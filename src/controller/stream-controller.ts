import { StageChannel, type Message } from "discord.js-selfbot-v13";
import { Streamer, Utils, playStream, prepareStream } from "@dank074/discord-video-stream";
import type { RuntimeConfig } from "../config/runtime.js";
import { buildStreamOpts, formatProfile } from "../config/runtime.js";
import { formatQueueStatus } from "../formatters/queue.js";
import type { AppState } from "../state/app-state.js";
import type { PendingRestartCause, ProfileName, QueueItem, StopReason, StreamType } from "../types.js";
import { withTimeout } from "../utils/async.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";
import { formatMetadataReply, getCurrentOffsetSeconds, shortUrl } from "../utils/media.js";
import { safeReply } from "../utils/reply.js";
import type { MetadataService } from "../services/metadata-service.js";
import type { YouTubeResolverService } from "../services/youtube-resolver-service.js";

type FailedSource = { count: number; lastFailedAt: number };

export class StreamController {
    private readonly failedSources = new Map<string, FailedSource>();

    constructor(
        private readonly streamer: Streamer,
        private readonly runtimeConfig: RuntimeConfig,
        private readonly state: AppState,
        private readonly metadataService: MetadataService,
        private readonly youtubeResolverService: YouTubeResolverService
    ) {}

    formatQueueStatus(): string {
        return formatQueueStatus(this.state);
    }

    getTuneStatus(): string {
        return `Tuning aktif: ${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}. Pilih: .tune low | .tune medium | .tune high`;
    }

    toggleLoop(arg: string | undefined): string {
        if (!arg || arg === "show") return `Loop: ${this.state.loopEnabled ? "ON" : "OFF"}`;
        if (arg === "toggle") this.state.loopEnabled = !this.state.loopEnabled;
        else if (arg === "on") this.state.loopEnabled = true;
        else if (arg === "off") this.state.loopEnabled = false;
        else return "Gunakan: .loop on | off | toggle | show";
        return `Loop: ${this.state.loopEnabled ? "ON" : "OFF"}`;
    }

    async applyTune(msg: Message, profile: ProfileName): Promise<string> {
        this.state.activeProfile = profile;
        this.state.activeStreamOpts = buildStreamOpts(this.runtimeConfig, profile);
        if (!this.state.activePlayback) return `Tuning diubah ke ${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}`;

        const offsetSeconds = getCurrentOffsetSeconds(this.state.activePlayback);
        const current = { sourceUrl: this.state.activePlayback.sourceUrl, type: this.state.activePlayback.type };
        await this.restartCurrentPlayback(msg, current, offsetSeconds, "tune");
        return `Tuning diubah: ${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}. Diterapkan ke stream aktif.`;
    }

    async seekPlayback(msg: Message, deltaSeconds: number): Promise<string> {
        if (!this.state.activePlayback) return "Tidak ada stream aktif.";

        const currentOffsetSeconds = getCurrentOffsetSeconds(this.state.activePlayback);
        let targetOffsetSeconds = Math.max(0, currentOffsetSeconds + deltaSeconds);
        const metadata = await this.metadataService.getOrProbe(this.state.activePlayback.sourceUrl);
        if (metadata?.durationSeconds && Number.isFinite(metadata.durationSeconds)) {
            const maxSeek = Math.max(0, metadata.durationSeconds - 2);
            if (targetOffsetSeconds > maxSeek) targetOffsetSeconds = maxSeek;
        }

        const current = { sourceUrl: this.state.activePlayback.sourceUrl, type: this.state.activePlayback.type };
        await this.restartCurrentPlayback(msg, current, targetOffsetSeconds, "seek");
        return `Seek ke ${Math.floor(targetOffsetSeconds)} detik.`;
    }

    async skip(msg: Message): Promise<string> {
        if (!this.state.activePlayback) {
            if (this.state.queue.length === 0) return "Queue kosong.";
            await this.tryStartNextQueued(msg);
            return "Tidak ada stream aktif. Menjalankan queue berikutnya...";
        }

        const hasNext = this.state.queue.length > 0 || this.state.loopEnabled;
        this.state.activePlayback.stopReason = "skip";
        this.state.activePlayback.controller.abort();
        return hasNext ? "Skip: lanjut ke item berikutnya." : "Skip: stream dihentikan, queue kosong.";
    }

    async enqueueAndPlay(msg: Message, url: string, type: StreamType): Promise<string> {
        const metadata = await this.metadataService.getOrProbe(url);
        const item: QueueItem = { sourceUrl: url, type };

        if (this.state.activePlayback) {
            this.state.queue.push(item);
            if (metadata) {
                return `${formatMetadataReply(metadata)}\nMasuk queue (#${this.state.queue.length}): ${shortUrl(url)}`;
            }
            return `Masuk queue (#${this.state.queue.length}): ${shortUrl(url)}`;
        }

        this.state.queue.unshift(item);
        await this.tryStartNextQueued(msg);
        if (metadata) return formatMetadataReply(metadata);
        return `Memulai stream: ${shortUrl(url)}`;
    }

    async disconnect(): Promise<void> {
        this.state.queue = [];
        this.state.pendingRestart = undefined;
        if (this.state.activePlayback) {
            this.state.activePlayback.stopReason = "disconnect";
            this.state.activePlayback.controller.abort();
        }
        this.state.activePlayback = undefined;
        this.streamer.leaveVoice();
    }

    stopStreamOnly(): string {
        this.state.queue = [];
        this.state.pendingRestart = undefined;
        if (!this.state.activePlayback) return "Tidak ada stream aktif.";
        this.state.activePlayback.stopReason = "manual-stop";
        this.state.activePlayback.controller.abort();
        return "Stream dihentikan. Tetap di voice.";
    }

    async tryStartNextQueued(msg: Message, forcedOffsetSeconds = 0): Promise<void> {
        if (this.state.activePlayback) return;
        const next = this.dequeueNextUsableItem();
        if (!next) return;
        await this.startPlayback(msg, next, forcedOffsetSeconds);
    }

    private dequeueNextUsableItem(): QueueItem | undefined {
        while (this.state.queue.length > 0) {
            const item = this.state.queue.shift();
            if (!item) return undefined;
            const fail = this.failedSources.get(item.sourceUrl);
            if (!fail) return item;
            const recent = Date.now() - fail.lastFailedAt < 30_000;
            if (fail.count < 3 || !recent) return item;
            logWarn(`Skipping unstable source after repeated failures: ${item.sourceUrl}`);
        }
        return undefined;
    }

    private async restartCurrentPlayback(msg: Message, item: QueueItem, offsetSeconds: number, reason: StopReason): Promise<void> {
        if (this.state.activePlayback) {
            this.state.pendingRestart = {
                item,
                offsetSeconds,
                msg,
                retries: 0,
                cause: this.toPendingCause(reason)
            };
            this.state.activePlayback.stopReason = reason;
            this.state.activePlayback.controller.abort();
            return;
        }

        this.state.queue.unshift(item);
        await this.tryStartNextQueued(msg, offsetSeconds);
    }

    private toPendingCause(reason: StopReason): PendingRestartCause {
        if (reason === "tune") return "tune";
        if (reason === "skip") return "skip";
        if (reason === "disconnect") return "disconnect-recover";
        return "seek";
    }

    private async ensureVoiceJoined(msg: Message): Promise<boolean> {
        const connectionChannelId = this.streamer.voiceConnection?.channelId;
        const channel = msg.author.voice?.channel;
        if ((!channel || !msg.guildId) && connectionChannelId) return true;
        if (!channel || !msg.guildId) return false;
        if (connectionChannelId === channel.id) return true;

        try {
            await withTimeout(this.streamer.joinVoice(msg.guildId, channel.id), 8000);
        } catch (error) {
            const stillConnected = this.streamer.client.user?.voice?.channelId === channel.id;
            if (!stillConnected) {
                logWarn("joinVoice failed", error);
                return false;
            }
        }

        if (channel instanceof StageChannel) await this.streamer.client.user?.voice?.setSuppressed(false);
        return Boolean(this.streamer.voiceConnection);
    }

    private async startPlayback(msg: Message, item: QueueItem, startOffsetSeconds = 0): Promise<void> {
        const joined = await this.ensureVoiceJoined(msg);
        if (!joined) {
            await safeReply(msg, "Masuk voice channel terlebih dahulu.");
            return;
        }

        const playbackController = new AbortController();
        let seekSeconds = Math.max(0, Math.floor(startOffsetSeconds));
        const metadata = await this.metadataService.getOrProbe(item.sourceUrl);
        if (metadata?.durationSeconds && Number.isFinite(metadata.durationSeconds)) {
            seekSeconds = Math.min(seekSeconds, Math.max(0, Math.floor(metadata.durationSeconds - 2)));
        }

        const prepareOptions: Record<string, unknown> = {
            width: this.state.activeStreamOpts.width,
            height: this.state.activeStreamOpts.height,
            frameRate: this.state.activeStreamOpts.fps,
            bitrateVideo: this.state.activeStreamOpts.bitrateKbps,
            bitrateVideoMax: this.state.activeStreamOpts.maxBitrateKbps,
            hardwareAcceleratedDecoding: this.state.activeStreamOpts.hardware_acceleration,
            videoCodec: Utils.normalizeVideoCodec(this.state.activeStreamOpts.videoCodec)
        };
        if (seekSeconds > 0) prepareOptions.customInputOptions = ["-ss", `${seekSeconds}`];

        let output: ReturnType<typeof prepareStream>["output"];
        let resolvedStreamUrl = item.sourceUrl;
        try {
            resolvedStreamUrl = await this.youtubeResolverService.resolvePlayableUrl(item.sourceUrl);
            const prepared = prepareStream(resolvedStreamUrl, prepareOptions as never, playbackController.signal);
            prepared.command.on("start", (cmdline: string) => {
                logInfo(`FFmpeg start (seek=${seekSeconds}s, type=${item.type}): ${cmdline}`);
            });
            prepared.command.on("error", (error: unknown) => {
                logError("ffmpeg command error", error);
            });
            output = prepared.output;
        } catch (error) {
            this.markSourceFailure(item.sourceUrl);
            logError("resolve/prepare playback failed", error);
            await safeReply(msg, "Gagal memproses source. Coba lagi beberapa saat.");
            await this.afterPlaybackFinalize(msg, item, playbackController, "error");
            return;
        }

        const serial = ++this.state.playbackSerial;
        this.state.activePlayback = {
            sourceUrl: item.sourceUrl,
            resolvedUrl: resolvedStreamUrl,
            type: item.type,
            baseOffsetSeconds: seekSeconds,
            startedAtMs: Date.now(),
            controller: playbackController,
            stopReason: null
        };

        try {
            await playStream(output, this.streamer, { type: item.type }, playbackController.signal);
            logInfo(`Playback ended naturally serial=${serial}`);
            this.clearSourceFailure(item.sourceUrl);
        } catch (error) {
            if (!playbackController.signal.aborted) {
                if (error instanceof Error && error.message.includes("Bot is not connected to a voice channel")) {
                    this.state.pendingRestart = {
                        item,
                        offsetSeconds: seekSeconds,
                        msg,
                        retries: 1,
                        cause: "disconnect-recover"
                    };
                    if (this.state.activePlayback && this.state.activePlayback.controller === playbackController) {
                        this.state.activePlayback.stopReason = "switch";
                    }
                    return;
                }
                if (this.shouldRefreshResolvedUrl(error, item.sourceUrl)) {
                    this.markSourceFailure(item.sourceUrl);
                    this.youtubeResolverService.invalidate(item.sourceUrl);
                    this.state.pendingRestart = {
                        item,
                        offsetSeconds: seekSeconds,
                        msg,
                        retries: 1,
                        cause: "refresh-url"
                    };
                    if (this.state.activePlayback && this.state.activePlayback.controller === playbackController) {
                        this.state.activePlayback.stopReason = "switch";
                    }
                    logWarn(`Resolver URL stale, retrying with fresh URL: ${item.sourceUrl}`);
                    return;
                }
                this.markSourceFailure(item.sourceUrl);
                logError("playStream error", error);
                if (this.state.activePlayback && this.state.activePlayback.controller === playbackController) {
                    this.state.activePlayback.stopReason = "error";
                }
            }
        } finally {
            await this.afterPlaybackFinalize(msg, item, playbackController, this.state.activePlayback?.stopReason ?? "natural-end");
        }
    }

    private async afterPlaybackFinalize(
        msg: Message,
        item: QueueItem,
        playbackController: AbortController,
        fallbackReason: StopReason
    ): Promise<void> {
        if (this.state.activePlayback && this.state.activePlayback.controller !== playbackController) return;

        const endedPlayback = this.state.activePlayback && this.state.activePlayback.controller === playbackController
            ? this.state.activePlayback
            : undefined;

        const reason = endedPlayback?.stopReason ?? fallbackReason;
        this.state.activePlayback = undefined;

        if (this.state.pendingRestart) {
            const restart = this.state.pendingRestart;
            this.state.pendingRestart = undefined;
            if (restart.cause === "disconnect-recover" && restart.retries > 1) return;
            if (restart.cause === "refresh-url" && restart.retries > 1) return;
            await this.startPlayback(restart.msg, restart.item, restart.offsetSeconds);
            return;
        }

        if (reason === "disconnect" || reason === "manual-stop" || reason === "seek" || reason === "tune" || reason === "skip" || reason === "switch") {
            return;
        }

        if (this.state.loopEnabled && endedPlayback && reason !== "error") {
            this.state.queue.unshift({ sourceUrl: item.sourceUrl, type: item.type });
        }

        const contextMsg = this.state.latestMessageContext ?? msg;
        if (this.state.queue.length > 0) {
            await this.tryStartNextQueued(contextMsg);
            return;
        }

        if (endedPlayback && reason !== "error") {
            await safeReply(contextMsg, "Stream selesai. Tetap di voice channel.");
        }
    }

    private markSourceFailure(sourceUrl: string): void {
        const current = this.failedSources.get(sourceUrl);
        this.failedSources.set(sourceUrl, {
            count: (current?.count ?? 0) + 1,
            lastFailedAt: Date.now()
        });
    }

    private clearSourceFailure(sourceUrl: string): void {
        this.failedSources.delete(sourceUrl);
    }

    private shouldRefreshResolvedUrl(error: unknown, sourceUrl: string): boolean {
        const normalizedSource = sourceUrl.toLowerCase();
        const failures = this.failedSources.get(sourceUrl)?.count ?? 0;
        if (failures > 0) return false;

        if (normalizedSource.includes("youtube.com/") || normalizedSource.includes("youtu.be/") || normalizedSource.startsWith("yt:")) {
            if (error instanceof Error) {
                const text = error.message.toLowerCase();
                return text.includes("404")
                    || text.includes("not found")
                    || text.includes("invalid data found when processing input")
                    || text.includes("error opening input");
            }
        }
        return false;
    }
}
