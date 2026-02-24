import { Client, StageChannel, type Message } from "discord.js-selfbot-v13";
import { Streamer, Utils, prepareStream, playStream } from "@dank074/discord-video-stream";
import config from "./config.json" with {type: "json"};

const runtimeConfig = resolveRuntimeConfig();
const streamer = new Streamer(new Client());
const profilePresets = {
    low: {
        width: 854,
        height: 480,
        fps: 24,
        bitrateKbps: 800,
        maxBitrateKbps: 1400
    },
    medium: {
        width: 1280,
        height: 720,
        fps: 30,
        bitrateKbps: 1800,
        maxBitrateKbps: 2800
    },
    high: {
        width: 1920,
        height: 1080,
        fps: 30,
        bitrateKbps: 3500,
        maxBitrateKbps: 5000
    }
} as const;

let activeProfile: ProfileName = "medium";
let activeStreamOpts = buildStreamOpts(activeProfile);
const defaultSeekStepSeconds = 10;
let activePlayback: ActivePlayback | undefined;

// ready event
streamer.client.on("ready", () => {
    console.log(`--- ${streamer.client.user?.tag} is ready ---`);
});

let controller: AbortController;

// message event
streamer.client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    if (!runtimeConfig.acceptedAuthors.includes(msg.author.id)) return;

    if (!msg.content) return;

    if (msg.content.startsWith(".help")) {
        await safeReply(msg, [
            "Perintah:",
            ".play-live <url>",
            ".play-cam <url>",
            ".stop-stream",
            ".disconnect",
            ".tune show|low|medium|high",
            ".back [detik] (default 10)",
            ".forw [detik] (default 10)",
            ".help"
        ].join("\n"));
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
            await safeReply(msg, `Tuning diubah ke ${formatProfile(activeProfile, activeStreamOpts)}. Auto-apply ke stream aktif (restart dari ${Math.floor(offsetSeconds)}s)...`);
            await startPlayback(msg, activePlayback.url, activePlayback.type, offsetSeconds);
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

        await safeReply(msg, `Seek ke ${Math.floor(targetOffsetSeconds)} detik (${msg.content.startsWith(".back") ? "back" : "forw"} ${stepSeconds}s), stream akan restart...`);
        await startPlayback(msg, activePlayback.url, activePlayback.type, targetOffsetSeconds);
        return;
    }

    if (msg.content.startsWith(".play-live")) {
        const args = parseArgs(msg.content)
        if (!args) return;
        await startPlayback(msg, args.url, "go-live");
    } else if (msg.content.startsWith(".play-cam")) {
        const args = parseArgs(msg.content);
        if (!args) return;
        await startPlayback(msg, args.url, "camera");
    } else if (msg.content.startsWith(".disconnect")) {
        controller?.abort();
        activePlayback = undefined;
        streamer.leaveVoice();
    } else if(msg.content.startsWith(".stop-stream")) {
        controller?.abort();
        activePlayback = undefined;
    }
});

// login
streamer.client.login(runtimeConfig.token);

function parseArgs(message: string): Args | undefined {
    const args = message.split(" ");
    if (args.length < 2) return;

    const url = args[1];

    return { url }
}

type Args = {
    url: string;
}

type ProfileName = keyof typeof profilePresets;
type StreamType = "go-live" | "camera";
type ActivePlayback = {
    url: string;
    type: StreamType;
    offsetSeconds: number;
    startedAtMs: number;
};

function isProfileName(value: string): value is ProfileName {
    return value === "low" || value === "medium" || value === "high";
}

function buildStreamOpts(profileName: ProfileName): typeof config.streamOpts {
    return {
        ...runtimeConfig.streamOpts,
        ...profilePresets[profileName]
    };
}

function formatProfile(profileName: ProfileName, streamOpts: typeof config.streamOpts): string {
    return `${profileName} (${streamOpts.width}x${streamOpts.height}, ${streamOpts.fps}fps, ${streamOpts.bitrateKbps}/${streamOpts.maxBitrateKbps} kbps)`;
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
    return Math.max(0, playback.offsetSeconds + elapsedSeconds);
}

async function startPlayback(msg: Message, url: string, type: StreamType, startOffsetSeconds = 0): Promise<void> {
    const channel = msg.author.voice?.channel;
    if (!channel || !msg.guildId) return;

    console.log(`Attempting to join voice channel ${msg.guildId}/${channel.id}`);
    await streamer.joinVoice(msg.guildId, channel.id);

    if (channel instanceof StageChannel) {
        await streamer.client.user?.voice?.setSuppressed(false);
    }

    controller?.abort();
    controller = new AbortController();
    const playbackController = controller;

    const customFfmpegFlags = startOffsetSeconds > 0
        ? ["-ss", `${Math.floor(startOffsetSeconds)}`]
        : undefined;

    const prepareOptions: Record<string, unknown> = {
        width: activeStreamOpts.width,
        height: activeStreamOpts.height,
        frameRate: activeStreamOpts.fps,
        bitrateVideo: activeStreamOpts.bitrateKbps,
        bitrateVideoMax: activeStreamOpts.maxBitrateKbps,
        hardwareAcceleratedDecoding: activeStreamOpts.hardware_acceleration,
        videoCodec: Utils.normalizeVideoCodec(activeStreamOpts.videoCodec)
    };
    if (customFfmpegFlags) {
        prepareOptions.customFfmpegFlags = customFfmpegFlags;
    }

    const { command, output } = prepareStream(url, prepareOptions as never, playbackController.signal);
    command.on("error", (err: unknown) => {
        console.log("An error happened with ffmpeg");
        console.log(err);
    });

    activePlayback = {
        url,
        type,
        offsetSeconds: Math.max(0, startOffsetSeconds),
        startedAtMs: Date.now()
    };

    await playStream(output, streamer, { type }, playbackController.signal)
        .catch(() => playbackController.abort())
        .finally(() => {
            if (playbackController.signal.aborted) return;
            activePlayback = undefined;
        });
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
