import { Client, StageChannel, type Message } from "discord.js-selfbot-v13";
import { Streamer, Utils, prepareStream, playStream } from "@dank074/discord-video-stream";
import config from "./config.json" with { type: "json" };
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const runtimeConfig = resolveRuntimeConfig();
const streamer = new Streamer(new Client());
const youtubeResolverBase = (process.env.YTDL_API_BASE?.trim() || "https://youtubedl.siputzx.my.id").replace(/\/$/, "");
const youtubeResolverApiKey = process.env.YTDL_API_KEY?.trim();
const youtubeResolverMediaType = (process.env.YTDL_MEDIA_TYPE?.trim() || "merge").toLowerCase();
const ytdlPollIntervalMs = Number(process.env.YTDL_POLL_INTERVAL_MS || "2000");
const ytdlPollTimeoutMs = Number(process.env.YTDL_POLL_TIMEOUT_MS || "60000");

const profilePresets = {
    low: { width: 854, height: 480, fps: 24, bitrateKbps: 800, maxBitrateKbps: 1400 },
    medium: { width: 1280, height: 720, fps: 30, bitrateKbps: 1800, maxBitrateKbps: 2800 },
    high: { width: 1920, height: 1080, fps: 30, bitrateKbps: 3500, maxBitrateKbps: 5000 }
} as const;

type ProfileName = keyof typeof profilePresets;
type StreamType = "go-live" | "camera";
type QueueItem = { sourceUrl: string; type: StreamType };
type PendingRestart = { item: QueueItem; offsetSeconds: number; msg: Message; retries: number; cause: "seek" | "tune" | "skip" | "disconnect-recover" };
type ActivePlayback = {
    sourceUrl: string;
    resolvedUrl: string;
    type: StreamType;
    baseOffsetSeconds: number;
    startedAtMs: number;
    controller: AbortController;
    stopReason: "natural-end" | "manual-stop" | "switch" | "disconnect" | "seek" | "tune" | "skip" | "error" | null;
};

let activeProfile: ProfileName = "medium";
let activeStreamOpts = buildStreamOpts(activeProfile);
const defaultSeekStepSeconds = 10;
let activePlayback: ActivePlayback | undefined;
let queue: QueueItem[] = [];
let loopEnabled = false;
let latestMessageContext: Message | undefined;
let playbackSerial = 0;
let pendingRestart: PendingRestart | undefined;
const metadataCache = new Map<string, VideoMetadata>();
const resolvedUrlCache = new Map<string, { url: string; expiresAt: number }>();

streamer.client.on("ready", () => {
    console.log(`--- ${streamer.client.user?.tag} is ready ---`);
});

streamer.client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!runtimeConfig.acceptedAuthors.includes(msg.author.id)) return;
    if (!msg.content) return;

    latestMessageContext = msg;

    if (msg.content.startsWith(".help")) {
        await safeReply(msg, [
            "Perintah:",
            ".play-live <url/youtube> (play / enqueue)",
            ".play-cam <url> (play / enqueue)",
            ".skip (lanjut queue berikutnya)",
            ".stop-stream (stop stream, tetap di voice)",
            ".disconnect (leave voice + clear queue)",
            ".queue (lihat queue)",
            ".loop on|off|toggle|show",
            ".tune show|low|medium|high",
            ".back [detik] (default 10)",
            ".forw [detik] (default 10)",
            ".help"
        ].join("\n"));
        return;
    }

    if (msg.content.startsWith(".queue")) {
        await safeReply(msg, formatQueueStatus());
        return;
    }

    if (msg.content.startsWith(".loop")) {
        const arg = msg.content.trim().split(/\s+/)[1]?.toLowerCase();
        if (!arg || arg === "show") {
            await safeReply(msg, `Loop: ${loopEnabled ? "ON" : "OFF"}`);
            return;
        }
        if (arg === "toggle") loopEnabled = !loopEnabled;
        else if (arg === "on") loopEnabled = true;
        else if (arg === "off") loopEnabled = false;
        else {
            await safeReply(msg, "Gunakan: .loop on | off | toggle | show");
            return;
        }
        await safeReply(msg, `Loop: ${loopEnabled ? "ON" : "OFF"}`);
        return;
    }

    if (msg.content.startsWith(".tune")) {
        const args = msg.content.trim().split(/\s+/);
        const selectedProfile = args[1]?.toLowerCase();

        if (!selectedProfile || selectedProfile === "show") {
            await safeReply(msg, `Tuning aktif: ${formatProfile(activeProfile, activeStreamOpts)}. Pilih: .tune low | .tune medium | .tune high`);
            return;
        }
        if (!isProfileName(selectedProfile)) {
            await safeReply(msg, "Profil tidak dikenal. Gunakan: .tune low | .tune medium | .tune high");
            return;
        }

        activeProfile = selectedProfile;
        activeStreamOpts = buildStreamOpts(activeProfile);

        if (activePlayback) {
            const offsetSeconds = getCurrentOffsetSeconds(activePlayback);
            const current = { sourceUrl: activePlayback.sourceUrl, type: activePlayback.type };
            await safeReply(msg, `Tuning diubah ke ${formatProfile(activeProfile, activeStreamOpts)}. Auto-apply dari ${Math.floor(offsetSeconds)}s...`);
            await restartCurrentPlayback(msg, current, offsetSeconds, "tune");
            return;
        }

        await safeReply(msg, `Tuning diubah ke ${formatProfile(activeProfile, activeStreamOpts)}`);
        return;
    }

    if (msg.content.startsWith(".back") || msg.content.startsWith(".forw")) {
        if (!activePlayback) {
            await safeReply(msg, "Tidak ada stream aktif. Jalankan .play-live atau .play-cam dulu.");
            return;
        }

        const stepSeconds = parseSeekStep(msg.content, defaultSeekStepSeconds);
        const currentOffsetSeconds = getCurrentOffsetSeconds(activePlayback);
        let targetOffsetSeconds = msg.content.startsWith(".back")
            ? Math.max(0, currentOffsetSeconds - stepSeconds)
            : currentOffsetSeconds + stepSeconds;

        const metadata = await getOrProbeMetadata(activePlayback.sourceUrl);
        if (metadata?.durationSeconds && Number.isFinite(metadata.durationSeconds)) {
            const maxSeek = Math.max(0, metadata.durationSeconds - 2);
            if (targetOffsetSeconds > maxSeek) {
                targetOffsetSeconds = maxSeek;
                await safeReply(msg, `Target seek melewati durasi. Di-clamp ke ${Math.floor(targetOffsetSeconds)} detik.`);
            }
        }

        console.log(`Seek request: current=${Math.floor(currentOffsetSeconds)} step=${stepSeconds} target=${Math.floor(targetOffsetSeconds)}`);
        await safeReply(msg, `Seek ke ${Math.floor(targetOffsetSeconds)} detik (${msg.content.startsWith(".back") ? "back" : "forw"} ${stepSeconds}s), stream akan restart...`);

        const current = { sourceUrl: activePlayback.sourceUrl, type: activePlayback.type };
        await restartCurrentPlayback(msg, current, targetOffsetSeconds, "seek");
        return;
    }

    if (msg.content.startsWith(".skip")) {
        if (!activePlayback) {
            if (queue.length > 0) {
                await safeReply(msg, "Tidak ada stream aktif. Menjalankan queue berikutnya...");
                await tryStartNextQueued(msg);
            } else {
                await safeReply(msg, "Tidak ada stream aktif dan queue kosong.");
            }
            return;
        }

        const hasNext = queue.length > 0 || loopEnabled;
        activePlayback.stopReason = "skip";
        activePlayback.controller.abort();
        await safeReply(msg, hasNext ? "Skip... lanjut item berikutnya." : "Skip... stream dihentikan (queue kosong)." );
        return;
    }

    if (msg.content.startsWith(".play-live") || msg.content.startsWith(".play-cam")) {
        const args = parseArgs(msg.content);
        if (!args) {
            await safeReply(msg, "Gunakan: .play-live <url> atau .play-cam <url>");
            return;
        }

        const metadata = await getOrProbeMetadata(args.url);
        if (metadata) {
            await safeReply(msg, formatMetadataReply(metadata));
        }

        const type: StreamType = msg.content.startsWith(".play-cam") ? "camera" : "go-live";
        const item: QueueItem = { sourceUrl: args.url, type };

        if (activePlayback) {
            queue.push(item);
            await safeReply(msg, `Ditambahkan ke queue (#${queue.length}): ${type} ${shortUrl(args.url)}`);
            return;
        }

        queue.unshift(item);
        await tryStartNextQueued(msg);
        return;
    }

    if (msg.content.startsWith(".disconnect")) {
        queue = [];
        if (activePlayback) {
            activePlayback.stopReason = "disconnect";
            activePlayback.controller.abort();
        }
        activePlayback = undefined;
        streamer.leaveVoice();
        await safeReply(msg, "Disconnected. Queue dibersihkan.");
        return;
    }

    if (msg.content.startsWith(".stop-stream")) {
        queue = [];
        if (activePlayback) {
            activePlayback.stopReason = "manual-stop";
            activePlayback.controller.abort();
            await safeReply(msg, "Stream dihentikan. Tetap stay di voice.");
        } else {
            await safeReply(msg, "Tidak ada stream aktif. Tetap stay di voice.");
        }
        return;
    }
});

streamer.client.login(runtimeConfig.token);

function parseArgs(message: string): { url: string } | undefined {
    const args = message.trim().split(/\s+/);
    if (args.length < 2) return;
    return { url: args[1] };
}

function isProfileName(value: string): value is ProfileName {
    return value === "low" || value === "medium" || value === "high";
}

function buildStreamOpts(profileName: ProfileName): typeof config.streamOpts {
    return { ...runtimeConfig.streamOpts, ...profilePresets[profileName] };
}

function formatProfile(profileName: ProfileName, streamOpts: typeof config.streamOpts): string {
    return `${profileName} (${streamOpts.width}x${streamOpts.height}, ${streamOpts.fps}fps, ${streamOpts.bitrateKbps}/${streamOpts.maxBitrateKbps} kbps)`;
}

function formatQueueStatus(): string {
    const lines = [
        `Loop: ${loopEnabled ? "ON" : "OFF"}`,
        `Now playing: ${activePlayback ? `${activePlayback.type} ${shortUrl(activePlayback.sourceUrl)} @~${Math.floor(getCurrentOffsetSeconds(activePlayback))}s` : "-"}`,
        `Queue (${queue.length}):`
    ];
    if (queue.length === 0) lines.push("- kosong");
    else queue.slice(0, 10).forEach((item, i) => lines.push(`${i + 1}. ${item.type} ${shortUrl(item.sourceUrl)}`));
    return lines.join("\n");
}

function shortUrl(url: string): string {
    return url.length > 80 ? `${url.slice(0, 77)}...` : url;
}

async function safeReply(msg: { reply: (content: string) => Promise<unknown> }, content: string): Promise<void> {
    try {
        await msg.reply(content);
    } catch {}
}

function parseSeekStep(message: string, fallbackSeconds: number): number {
    const stepText = message.trim().split(/\s+/)[1];
    const parsed = Number(stepText);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackSeconds;
    return parsed;
}

function getCurrentOffsetSeconds(playback: ActivePlayback): number {
    const elapsedSeconds = (Date.now() - playback.startedAtMs) / 1000;
    return Math.max(0, playback.baseOffsetSeconds + elapsedSeconds);
}

async function restartCurrentPlayback(msg: Message, item: QueueItem, offsetSeconds: number, reason: ActivePlayback["stopReason"]): Promise<void> {
    if (activePlayback) {
        pendingRestart = {
            item,
            offsetSeconds,
            msg,
            retries: 0,
            cause: reason === "tune" ? "tune" : reason === "skip" ? "skip" : "seek"
        };
        activePlayback.stopReason = reason;
        activePlayback.controller.abort();
        return;
    }
    queue.unshift(item);
    await tryStartNextQueued(msg, offsetSeconds);
}

async function tryStartNextQueued(msg: Message, forcedOffsetSeconds = 0): Promise<void> {
    if (activePlayback) return;
    const next = queue.shift();
    if (!next) return;
    await startPlayback(msg, next, forcedOffsetSeconds);
}

async function ensureVoiceJoined(msg: Message): Promise<boolean> {
    const connectionChannelId = streamer.voiceConnection?.channelId;
    const channel = msg.author.voice?.channel;
    if ((!channel || !msg.guildId) && connectionChannelId) {
        return true;
    }
    if (!channel || !msg.guildId) return false;

    if (connectionChannelId === channel.id) {
        return true;
    }

    console.log(`Attempting to join voice channel ${msg.guildId}/${channel.id}`);
    try {
        await withTimeout(streamer.joinVoice(msg.guildId, channel.id), 8000);
    } catch (error) {
        const stillConnected = streamer.client.user?.voice?.channelId === channel.id;
        if (!stillConnected) {
            console.log("joinVoice failed", error);
            return false;
        }
    }

    if (channel instanceof StageChannel) {
        await streamer.client.user?.voice?.setSuppressed(false);
    }
    return Boolean(streamer.voiceConnection);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

async function startPlayback(msg: Message, item: QueueItem, startOffsetSeconds = 0): Promise<void> {
    const joined = await ensureVoiceJoined(msg);
    if (!joined) {
        await safeReply(msg, "Masuk voice channel dulu.");
        return;
    }

    const playbackController = new AbortController();
    let seekSeconds = Math.max(0, Math.floor(startOffsetSeconds));
    const metadata = await getOrProbeMetadata(item.sourceUrl);
    if (metadata?.durationSeconds && Number.isFinite(metadata.durationSeconds)) {
        const maxSeek = Math.max(0, Math.floor(metadata.durationSeconds - 2));
        if (seekSeconds > maxSeek) {
            console.log(`Clamp seek in startPlayback: requested=${seekSeconds} max=${maxSeek}`);
            seekSeconds = maxSeek;
        }
    }

    const prepareOptions: Record<string, unknown> = {
        width: activeStreamOpts.width,
        height: activeStreamOpts.height,
        frameRate: activeStreamOpts.fps,
        bitrateVideo: activeStreamOpts.bitrateKbps,
        bitrateVideoMax: activeStreamOpts.maxBitrateKbps,
        hardwareAcceleratedDecoding: activeStreamOpts.hardware_acceleration,
        videoCodec: Utils.normalizeVideoCodec(activeStreamOpts.videoCodec)
    };

    if (seekSeconds > 0) {
        prepareOptions.customInputOptions = ["-ss", `${seekSeconds}`];
    }

    const resolvedStreamUrl = await resolvePlayableUrl(item.sourceUrl);
    const { command, output } = prepareStream(resolvedStreamUrl, prepareOptions as never, playbackController.signal);
    command.on("start", (cmdline: string) => {
        console.log(`FFmpeg start (seek=${seekSeconds}s, type=${item.type}): ${cmdline}`);
    });
    command.on("error", (err: unknown) => {
        console.log("An error happened with ffmpeg");
        console.log(err);
    });

    const serial = ++playbackSerial;
    activePlayback = {
        sourceUrl: item.sourceUrl,
        resolvedUrl: resolvedStreamUrl,
        type: item.type,
        baseOffsetSeconds: seekSeconds,
        startedAtMs: Date.now(),
        controller: playbackController,
        stopReason: null
    };

    try {
        await playStream(output, streamer, { type: item.type }, playbackController.signal);
        console.log(`Playback ended naturally serial=${serial}`);
    } catch (error) {
        if (!playbackController.signal.aborted) {
            if (error instanceof Error && error.message.includes("Bot is not connected to a voice channel")) {
                console.log("playStream detected disconnected voice state, scheduling full restart...");
                pendingRestart = {
                    item,
                    offsetSeconds: seekSeconds,
                    msg,
                    retries: 1,
                    cause: "disconnect-recover"
                };
                if (activePlayback && activePlayback.controller === playbackController) {
                    activePlayback.stopReason = "switch";
                }
                return;
            }
            console.log("playStream error", error);
            if (activePlayback && activePlayback.controller === playbackController) {
                activePlayback.stopReason = "error";
            }
        }
    } finally {
        if (activePlayback && activePlayback.controller !== playbackController) {
            return;
        }

        const endedPlayback = activePlayback && activePlayback.controller === playbackController ? activePlayback : undefined;
        if (!endedPlayback) {
            return;
        }

        const reason = endedPlayback?.stopReason;
        activePlayback = undefined;

        if (pendingRestart) {
            const restart = pendingRestart;
            pendingRestart = undefined;
            if (restart.cause === "disconnect-recover" && restart.retries > 1) {
                await safeReply(restart.msg, "Gagal recover voice connection saat restart stream.");
                return;
            }
            await startPlayback(restart.msg, restart.item, restart.offsetSeconds);
            return;
        }

        if (reason === "disconnect") return;
        if (reason === "manual-stop") return;
        if (reason === "seek" || reason === "tune" || reason === "skip" || reason === "switch") return;

        if (loopEnabled && endedPlayback) {
            queue.unshift({ sourceUrl: endedPlayback.sourceUrl, type: endedPlayback.type });
        }

        const contextMsg = latestMessageContext ?? msg;
        if (queue.length > 0) {
            await tryStartNextQueued(contextMsg);
        } else if (endedPlayback) {
            await safeReply(contextMsg, "Stream selesai. Tetap stay di voice. Gunakan .disconnect untuk keluar.");
        }
    }
}

function resolveRuntimeConfig(): typeof config {
    const token = process.env.DISCORD_TOKEN?.trim() || config.token;
    const acceptedAuthors = parseAcceptedAuthors(process.env.ACCEPTED_AUTHORS) ?? config.acceptedAuthors;

    return {
        ...config,
        token,
        acceptedAuthors,
        streamOpts: {
            ...config.streamOpts,
            width: parseIntegerEnv("STREAM_WIDTH") ?? config.streamOpts.width,
            height: parseIntegerEnv("STREAM_HEIGHT") ?? config.streamOpts.height,
            fps: parseIntegerEnv("STREAM_FPS") ?? config.streamOpts.fps,
            bitrateKbps: parseIntegerEnv("STREAM_BITRATE_KBPS") ?? config.streamOpts.bitrateKbps,
            maxBitrateKbps: parseIntegerEnv("STREAM_MAX_BITRATE_KBPS") ?? config.streamOpts.maxBitrateKbps,
            hardware_acceleration: parseBooleanEnv("STREAM_HW_ACCEL") ?? config.streamOpts.hardware_acceleration,
            videoCodec: process.env.STREAM_VIDEO_CODEC?.trim() || config.streamOpts.videoCodec
        }
    };
}

function parseAcceptedAuthors(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    const parsed = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
}

function parseIntegerEnv(name: string): number | undefined {
    const value = process.env[name];
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanEnv(name: string): boolean | undefined {
    const value = process.env[name]?.toLowerCase();
    if (!value) return undefined;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return undefined;
}

type ProbeResult = {
    format?: {
        duration?: string;
        bit_rate?: string;
        format_name?: string;
    };
    streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
    }>;
};

type VideoMetadata = {
    durationSeconds?: number;
    durationText: string;
    resolution: string;
    fps: string;
    videoCodec: string;
    audioCodec: string;
};

async function probeVideoMetadata(url: string): Promise<VideoMetadata | undefined> {
    const result = await runFfprobe(url).catch(() => undefined);
    if (!result) return undefined;

    const video = result.streams?.find((stream) => stream.codec_type === "video");
    const audio = result.streams?.find((stream) => stream.codec_type === "audio");

    const duration = Number(result.format?.duration ?? "0");
    const durationText = Number.isFinite(duration) && duration > 0 ? formatDuration(duration) : "unknown";
    const resolution = video?.width && video?.height ? `${video.width}x${video.height}` : "unknown";
    const fps = parseFps(video?.avg_frame_rate);
    const videoCodec = video?.codec_name ?? "unknown";
    const audioCodec = audio?.codec_name ?? "unknown";

    return {
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        durationText,
        resolution,
        fps,
        videoCodec,
        audioCodec
    };
}

function formatMetadataReply(metadata: VideoMetadata): string {
    return `Metadata: durasi=${metadata.durationText}, resolusi=${metadata.resolution}, fps=${metadata.fps}, vcodec=${metadata.videoCodec}, acodec=${metadata.audioCodec}`;
}

async function getOrProbeMetadata(url: string): Promise<VideoMetadata | undefined> {
    const cached = metadataCache.get(url);
    if (cached) return cached;
    const metadata = await probeVideoMetadata(url);
    if (metadata) {
        metadataCache.set(url, metadata);
    }
    return metadata;
}

async function resolvePlayableUrl(sourceUrl: string): Promise<string> {
    if (!isYouTubeUrl(sourceUrl)) return sourceUrl;

    const cached = resolvedUrlCache.get(sourceUrl);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const resolved = await resolveViaYoutubedlApi(sourceUrl);
    resolvedUrlCache.set(sourceUrl, {
        url: resolved,
        expiresAt: Date.now() + 10 * 60 * 1000
    });
    return resolved;
}

function isYouTubeUrl(url: string): boolean {
    const normalized = url.toLowerCase();
    return normalized.includes("youtube.com/") || normalized.includes("youtu.be/") || normalized.startsWith("yt:");
}

async function resolveViaYoutubedlApi(sourceUrl: string): Promise<string> {
    const headers: Record<string, string> = { "Accept": "application/json" };
    const firstTry = await callResolverDownload(sourceUrl, headers);

    if (firstTry.statusCode === 401) {
        const powSession = await solveYtdlPowSession(sourceUrl);
        headers.Cookie = `pow_session=${powSession}`;
    } else if (firstTry.statusCode >= 400) {
        throw new Error(`YouTube resolver failed (${firstTry.statusCode})`);
    } else {
        return await resolveDownloadPayloadToUrl(sourceUrl, firstTry.payload, headers);
    }

    const secondTry = await callResolverDownload(sourceUrl, headers);
    if (secondTry.statusCode >= 400) {
        throw new Error(`YouTube resolver failed after PoW (${secondTry.statusCode})`);
    }

    return await resolveDownloadPayloadToUrl(sourceUrl, secondTry.payload, headers);
}

type ResolverDownloadPayload = {
    fileUrl?: string;
    file_url?: string;
    url?: string;
    status?: string;
    error?: string;
    id?: string;
    data?: { fileUrl?: string; url?: string };
};

function extractResolvedFileUrl(payload: ResolverDownloadPayload): string {
    const fileUrl = payload.fileUrl || payload.file_url || payload.url || payload.data?.fileUrl || payload.data?.url;
    if (!fileUrl) throw new Error("YouTube resolver returned empty file URL");
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    return new URL(fileUrl, `${youtubeResolverBase}/`).toString();
}

async function resolveDownloadPayloadToUrl(sourceUrl: string, payload: ResolverDownloadPayload, headers: Record<string, string>): Promise<string> {
    if (hasResolverFileUrl(payload)) {
        return extractResolvedFileUrl(payload);
    }

    const status = payload.status?.toLowerCase();
    if (status === "failed" || status === "error") {
        throw new Error(`Resolver download failed: ${payload.error || "unknown"}`);
    }

    if (status === "downloading" || status === "processing" || status === "queued") {
        return await pollResolverFileUrl(sourceUrl, headers);
    }

    throw new Error("Resolver response missing file URL");
}

async function pollResolverFileUrl(sourceUrl: string, headers: Record<string, string>): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < ytdlPollTimeoutMs) {
        await sleep(ytdlPollIntervalMs);
        const result = await callResolverDownload(sourceUrl, headers);
        if (result.statusCode >= 400) {
            throw new Error(`Resolver polling failed (${result.statusCode})`);
        }

        if (hasResolverFileUrl(result.payload)) {
            return extractResolvedFileUrl(result.payload);
        }

        const status = result.payload.status?.toLowerCase();
        if (status === "failed" || status === "error") {
            throw new Error(`Resolver polling failed: ${result.payload.error || "unknown"}`);
        }
    }

    throw new Error("Resolver polling timeout");
}

function hasResolverFileUrl(payload: ResolverDownloadPayload): boolean {
    return Boolean(payload.fileUrl || payload.file_url || payload.data?.fileUrl || payload.data?.url);
}

async function callResolverDownload(sourceUrl: string, headers: Record<string, string>): Promise<{ statusCode: number; payload: ResolverDownloadPayload }> {
    const endpoint = new URL(`${youtubeResolverBase}/download`);
    endpoint.searchParams.set("url", sourceUrl);
    endpoint.searchParams.set("type", youtubeResolverMediaType);
    if (youtubeResolverApiKey) endpoint.searchParams.set("apikey", youtubeResolverApiKey);

    const response = await fetch(endpoint.toString(), { method: "GET", headers });
    const payload = await response.json().catch(() => ({} as ResolverDownloadPayload));
    return { statusCode: response.status, payload };
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function solveYtdlPowSession(sourceUrl: string): Promise<string> {
    const challengeRes = await fetch(`${youtubeResolverBase}/akumaudownload`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ url: sourceUrl, type: youtubeResolverMediaType })
    });
    if (!challengeRes.ok) {
        throw new Error(`YouTube resolver challenge failed (${challengeRes.status})`);
    }

    const challengePayload = await challengeRes.json() as { challenge: string; difficulty: number };
    const nonce = solvePowNonce(challengePayload.challenge, challengePayload.difficulty);

    const verifyRes = await fetch(`${youtubeResolverBase}/cekpunyaku`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ url: sourceUrl, type: youtubeResolverMediaType, nonce })
    });

    if (!verifyRes.ok) {
        throw new Error(`YouTube resolver verify failed (${verifyRes.status})`);
    }

    const setCookie = verifyRes.headers.get("set-cookie") || "";
    const match = /pow_session=([^;]+)/.exec(setCookie);
    if (!match) {
        throw new Error("YouTube resolver did not return pow_session cookie");
    }
    return match[1];
}

function solvePowNonce(challenge: string, difficulty: number): string {
    const prefix = "0".repeat(Math.max(1, difficulty));
    for (let i = 0; i < 20_000_000; i++) {
        const nonce = String(i);
        const hash = createHash("sha256").update(challenge).update(nonce).digest("hex");
        if (hash.startsWith(prefix)) {
            return nonce;
        }
    }
    throw new Error(`Failed to solve PoW difficulty ${difficulty}`);
}

function runFfprobe(url: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
        const child = spawn("ffprobe", [
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            url
        ]);

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("ffprobe timeout"));
        }, 12000);

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(stderr || `ffprobe exited with code ${code}`));
                return;
            }

            try {
                resolve(JSON.parse(stdout) as ProbeResult);
            } catch (error) {
                reject(error);
            }
        });
    });
}

function parseFps(value: string | undefined): string {
    if (!value) return "unknown";
    const [numText, denText] = value.split("/");
    const num = Number(numText);
    const den = Number(denText ?? "1");
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return "unknown";
    const fps = num / den;
    if (!Number.isFinite(fps) || fps <= 0) return "unknown";
    return fps.toFixed(2).replace(/\.00$/, "");
}

function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}
