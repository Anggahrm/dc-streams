import { Client, StageChannel, type Message } from "discord.js-selfbot-v13";
import { Streamer, Utils, prepareStream, playStream } from "@dank074/discord-video-stream";
import config from "./config.json" with { type: "json" };

const runtimeConfig = resolveRuntimeConfig();
const streamer = new Streamer(new Client());

const profilePresets = {
    low: { width: 854, height: 480, fps: 24, bitrateKbps: 800, maxBitrateKbps: 1400 },
    medium: { width: 1280, height: 720, fps: 30, bitrateKbps: 1800, maxBitrateKbps: 2800 },
    high: { width: 1920, height: 1080, fps: 30, bitrateKbps: 3500, maxBitrateKbps: 5000 }
} as const;

type ProfileName = keyof typeof profilePresets;
type StreamType = "go-live" | "camera";
type QueueItem = { url: string; type: StreamType };
type ActivePlayback = {
    url: string;
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
            ".play-live <url> (play / enqueue)",
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
            const current = { url: activePlayback.url, type: activePlayback.type };
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
        const targetOffsetSeconds = msg.content.startsWith(".back")
            ? Math.max(0, currentOffsetSeconds - stepSeconds)
            : currentOffsetSeconds + stepSeconds;

        console.log(`Seek request: current=${Math.floor(currentOffsetSeconds)} step=${stepSeconds} target=${Math.floor(targetOffsetSeconds)}`);
        await safeReply(msg, `Seek ke ${Math.floor(targetOffsetSeconds)} detik (${msg.content.startsWith(".back") ? "back" : "forw"} ${stepSeconds}s), stream akan restart...`);

        const current = { url: activePlayback.url, type: activePlayback.type };
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

        const type: StreamType = msg.content.startsWith(".play-cam") ? "camera" : "go-live";
        const item: QueueItem = { url: args.url, type };

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
        `Now playing: ${activePlayback ? `${activePlayback.type} ${shortUrl(activePlayback.url)} @~${Math.floor(getCurrentOffsetSeconds(activePlayback))}s` : "-"}`,
        `Queue (${queue.length}):`
    ];
    if (queue.length === 0) lines.push("- kosong");
    else queue.slice(0, 10).forEach((item, i) => lines.push(`${i + 1}. ${item.type} ${shortUrl(item.url)}`));
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
        activePlayback.stopReason = reason;
        activePlayback.controller.abort();
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
    const channel = msg.author.voice?.channel;
    if (!channel || !msg.guildId) return false;

    console.log(`Attempting to join voice channel ${msg.guildId}/${channel.id}`);
    await streamer.joinVoice(msg.guildId, channel.id);

    if (channel instanceof StageChannel) {
        await streamer.client.user?.voice?.setSuppressed(false);
    }
    return true;
}

async function startPlayback(msg: Message, item: QueueItem, startOffsetSeconds = 0): Promise<void> {
    const joined = await ensureVoiceJoined(msg);
    if (!joined) {
        await safeReply(msg, "Masuk voice channel dulu.");
        return;
    }

    const playbackController = new AbortController();
    const seekSeconds = Math.max(0, Math.floor(startOffsetSeconds));

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
        prepareOptions.customFfmpegFlags = ["-ss", `${seekSeconds}`];
    }

    const { command, output } = prepareStream(item.url, prepareOptions as never, playbackController.signal);
    command.on("start", (cmdline: string) => {
        console.log(`FFmpeg start (seek=${seekSeconds}s, type=${item.type}): ${cmdline}`);
    });
    command.on("error", (err: unknown) => {
        console.log("An error happened with ffmpeg");
        console.log(err);
    });

    const serial = ++playbackSerial;
    activePlayback = {
        url: item.url,
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

        if (reason === "disconnect") return;
        if (reason === "manual-stop") return;
        if (reason === "seek" || reason === "tune" || reason === "skip" || reason === "switch") return;

        if (loopEnabled && endedPlayback) {
            queue.unshift({ url: endedPlayback.url, type: endedPlayback.type });
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
