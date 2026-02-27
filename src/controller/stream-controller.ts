import { StageChannel, type Message } from "discord.js-selfbot-v13";
import { Streamer, Utils, playStream, prepareStream } from "@dank074/discord-video-stream";
import type { RuntimeConfig } from "../config/runtime.js";
import { buildStreamOpts, formatProfile } from "../config/runtime.js";
import { formatQueueStatus } from "../formatters/queue.js";
import { formatResolvePrepareError } from "../formatters/stream-errors.js";
import type { AppState } from "../state/app-state.js";
import type { PendingRestartCause, ProfileName, QueueItem, StopReason, StreamType } from "../types.js";
import { FailedSourceTracker, classifyPlaybackError } from "./error-recovery.js";
import { sleep, withTimeout } from "../utils/async.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";
import { formatMetadataReply, getCurrentOffsetSeconds, shortUrl } from "../utils/media.js";
import { safeReply } from "../utils/reply.js";
import type { MetadataService } from "../services/metadata-service.js";
import type { YouTubeResolverService } from "../services/youtube-resolver-service.js";

export class StreamController {
    private readonly failedSourceTracker = new FailedSourceTracker();

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
        return [
            "**Tuning Status**",
            `- Active: \`${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}\``,
            "- Use: `.tune low`, `.tune medium`, `.tune high`"
        ].join("\n");
    }

    toggleLoop(arg: string | undefined): string {
        if (!arg || arg === "show") return `**Loop:** ${this.state.loopEnabled ? "ON" : "OFF"}`;
        if (arg === "toggle") this.state.loopEnabled = !this.state.loopEnabled;
        else if (arg === "on") this.state.loopEnabled = true;
        else if (arg === "off") this.state.loopEnabled = false;
        else return "**Invalid loop argument**\nUse: `.loop on`, `.loop off`, `.loop toggle`, `.loop show`.";
        return `**Loop:** ${this.state.loopEnabled ? "ON" : "OFF"}`;
    }

    async applyTune(msg: Message, profile: ProfileName): Promise<string> {
        this.state.activeProfile = profile;
        this.state.activeStreamOpts = buildStreamOpts(this.runtimeConfig, profile);
        if (!this.state.activePlayback) return `**Tuning updated**\nActive: \`${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}\``;

        const current = this.getCurrentPlaybackItem();
        if (!current) return `**Tuning updated**\nActive: \`${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}\``;
        const offsetSeconds = getCurrentOffsetSeconds(this.state.activePlayback);
        await this.restartCurrentPlayback(msg, current, offsetSeconds, "tune");
        return [
            "**Tuning updated**",
            `- Active: \`${formatProfile(this.state.activeProfile, this.state.activeStreamOpts)}\``,
            "- Applied to active stream"
        ].join("\n");
    }

    async seekPlayback(msg: Message, deltaSeconds: number): Promise<string> {
        if (!this.state.activePlayback) return "**No active stream.**";

        const currentOffsetSeconds = getCurrentOffsetSeconds(this.state.activePlayback);
        let targetOffsetSeconds = Math.max(0, currentOffsetSeconds + deltaSeconds);
        const metadata = await this.metadataService.getOrProbe(this.state.activePlayback.sourceUrl);
        if (metadata?.durationSeconds && Number.isFinite(metadata.durationSeconds)) {
            const maxSeek = Math.max(0, metadata.durationSeconds - 2);
            if (targetOffsetSeconds > maxSeek) targetOffsetSeconds = maxSeek;
        }

        const current = this.getCurrentPlaybackItem();
        if (!current) return "**No active stream.**";
        await this.restartCurrentPlayback(msg, current, targetOffsetSeconds, "seek");
        return `**Seek:** ${Math.floor(targetOffsetSeconds)} seconds.`;
    }

    async skip(msg: Message): Promise<string> {
        if (!this.state.activePlayback) {
            if (this.state.queue.length === 0) return "**Queue is empty.**";
            await this.tryStartNextQueued(msg);
            return "**No active stream**\nTrying to start the next queued item…";
        }

        const hasNext = this.state.queue.length > 0 || this.state.loopEnabled;
        this.state.activePlayback.stopReason = "skip";
        this.state.activePlayback.controller.abort();
        return hasNext
            ? "**Skip successful**\nMoving to the next queued item."
            : "**Skip successful**\nStream stopped, queue is empty.";
    }

    async enqueueAndPlay(msg: Message, url: string, type: StreamType, requestedByOwner: boolean, inputOptions?: string[]): Promise<string> {
        const metadata = await this.metadataService.getOrProbe(url);
        const item: QueueItem = { sourceUrl: url, type, requestedByOwner, inputOptions };

        if (this.state.activePlayback) {
            if (requestedByOwner) {
                const firstNonOwnerIndex = this.state.queue.findIndex((queuedItem) => !queuedItem.requestedByOwner);
                if (firstNonOwnerIndex === -1) this.state.queue.push(item);
                else this.state.queue.splice(firstNonOwnerIndex, 0, item);
            } else {
                this.state.queue.push(item);
            }
            if (metadata) {
                return [
                    formatMetadataReply(metadata),
                    "",
                    requestedByOwner
                        ? `**Added to owner-priority queue** (#${this.state.queue.length})\n${shortUrl(url)}`
                        : `**Added to queue** (#${this.state.queue.length})\n${shortUrl(url)}`
                ].join("\n");
            }
            return requestedByOwner
                ? `**Added to owner-priority queue** (#${this.state.queue.length})\n${shortUrl(url)}`
                : `**Added to queue** (#${this.state.queue.length})\n${shortUrl(url)}`;
        }

        this.state.queue.unshift(item);
        await this.tryStartNextQueued(msg);

        const activePlayback = (this.state as AppState).activePlayback;
        const startedCurrentItem = activePlayback
            && activePlayback.sourceUrl === item.sourceUrl
            && activePlayback.type === item.type;
        if (!startedCurrentItem) {
            const stillQueued = this.state.queue.some((queued) => queued.sourceUrl === item.sourceUrl && queued.type === item.type);
            if (stillQueued) {
                return [
                    "**Queued**",
                    "- Waiting for playback to start",
                    `- Source: ${shortUrl(url)}`
                ].join("\n");
            }
            return "";
        }

        if (metadata) {
            return [
                "**Starting stream**",
                `- Mode: ${type}`,
                `- Requested by: ${requestedByOwner ? "owner" : "public"}`,
                "",
                formatMetadataReply(metadata)
            ].join("\n");
        }
        return [
            "**Starting stream**",
            `- Mode: ${type}`,
            `- Requested by: ${requestedByOwner ? "owner" : "public"}`,
            `- Source: ${shortUrl(url)}`
        ].join("\n");
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
        if (!this.state.activePlayback) return "**No active stream.**";
        this.state.activePlayback.stopReason = "manual-stop";
        this.state.activePlayback.controller.abort();
        return "**Stream stopped**\nStill connected to voice channel.";
    }

    async tryStartNextQueued(msg: Message, forcedOffsetSeconds = 0): Promise<void> {
        if (this.state.activePlayback || this.state.startingPlayback) return;
        const next = this.dequeueNextUsableItem(forcedOffsetSeconds > 0);
        if (!next) return;
        this.state.startingPlayback = true;
        try {
            await this.startPlayback(msg, next, forcedOffsetSeconds);
        } finally {
            this.state.startingPlayback = false;
        }
    }

    private dequeueNextUsableItem(preferFront = false): QueueItem | undefined {
        while (this.state.queue.length > 0) {
            const ownerIndex = preferFront ? -1 : this.state.queue.findIndex((item) => item.requestedByOwner);
            const item = ownerIndex >= 0 ? this.state.queue.splice(ownerIndex, 1)[0] : this.state.queue.shift();
            if (!item) return undefined;
            if (!this.failedSourceTracker.isUnstable(item.sourceUrl)) return item;
            logWarn(`Skipping unstable source after repeated failures: ${item.sourceUrl}`);
        }
        return undefined;
    }

    private getCurrentPlaybackItem(): QueueItem | undefined {
        if (!this.state.activePlayback) return undefined;
        return {
            sourceUrl: this.state.activePlayback.sourceUrl,
            type: this.state.activePlayback.type,
            requestedByOwner: this.state.activePlayback.requestedByOwner
        };
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
            this.state.queue.unshift(item);
            await safeReply(msg, "**Not connected to voice**\nJoin a voice channel first, then use `.skip` to retry the queue.");
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
        const customInputOptions: string[] = [];
        if (seekSeconds > 0) customInputOptions.push("-ss", `${seekSeconds}`);
        if (item.inputOptions?.length) customInputOptions.push(...item.inputOptions);
        if (customInputOptions.length > 0) prepareOptions.customInputOptions = customInputOptions;

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
            this.failedSourceTracker.mark(item.sourceUrl);
            logError("resolve/prepare playback failed", error);
            await safeReply(msg, formatResolvePrepareError(error, item.sourceUrl));
            await this.afterPlaybackFinalize(msg, item, playbackController, "error", false);
            return;
        }

        const serial = ++this.state.playbackSerial;
        this.state.activePlayback = {
            sourceUrl: item.sourceUrl,
            resolvedUrl: resolvedStreamUrl,
            type: item.type,
            requestedByOwner: item.requestedByOwner,
            baseOffsetSeconds: seekSeconds,
            startedAtMs: Date.now(),
            controller: playbackController,
            stopReason: null
        };

        try {
            await playStream(output, this.streamer, { type: item.type }, playbackController.signal);
            logInfo(`Playback ended naturally serial=${serial}`);
            this.failedSourceTracker.clear(item.sourceUrl);
        } catch (error) {
            if (!playbackController.signal.aborted) {
                const recovery = classifyPlaybackError(
                    error,
                    item,
                    resolvedStreamUrl,
                    seekSeconds,
                    msg,
                    this.failedSourceTracker
                );

                if (recovery.kind === "disconnect-recover") {
                    this.state.pendingRestart = recovery.restart;
                    this.setSwitchStopReason(playbackController);
                    return;
                }

                if (recovery.kind === "refresh-url") {
                    this.youtubeResolverService.invalidate(item.sourceUrl);
                    this.state.pendingRestart = recovery.restart;
                    this.setSwitchStopReason(playbackController);
                    return;
                }

                this.failedSourceTracker.mark(item.sourceUrl);
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
        fallbackReason: StopReason,
        notifyErrorReply = true
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
            if (restart.cause === "refresh-url") await sleep(1200);
            await this.startPlayback(restart.msg, restart.item, restart.offsetSeconds);
            return;
        }

        if (reason === "disconnect" || reason === "manual-stop" || reason === "seek" || reason === "tune" || reason === "skip" || reason === "switch") {
            return;
        }

        if (this.state.loopEnabled && endedPlayback && reason !== "error") {
            this.state.queue.unshift({ sourceUrl: item.sourceUrl, type: item.type, requestedByOwner: item.requestedByOwner });
        }

        const contextMsg = this.state.latestMessageContext ?? msg;
        if (this.state.queue.length > 0) {
            await this.tryStartNextQueued(contextMsg);
            return;
        }

        if (reason === "error" && notifyErrorReply) {
            await safeReply(contextMsg, [
                "**Stream failed**",
                "- Playback stopped due to source/decoder error",
                `- Source: ${shortUrl(item.sourceUrl)}`
            ].join("\n"));
            return;
        }

        if (endedPlayback && reason !== "error") {
            await safeReply(contextMsg, "**Stream finished**\nStill connected to voice channel.");
        }
    }

    private setSwitchStopReason(playbackController: AbortController): void {
        if (this.state.activePlayback && this.state.activePlayback.controller === playbackController) {
            this.state.activePlayback.stopReason = "switch";
        }
    }
}
