import config from "../config.json" with { type: "json" };
import { profilePresets } from "../constants.js";
import type { ProfileName, StreamOptions } from "../types.js";

type BaseConfig = typeof config;

export type RuntimeConfig = BaseConfig;

export function resolveRuntimeConfig(): RuntimeConfig {
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

export function resolveDefaultProfile(): ProfileName {
    const configured = process.env.STREAM_PROFILE?.trim().toLowerCase();
    if (configured && isProfileName(configured)) return configured;
    return "high";
}

export function isProfileName(value: string): value is ProfileName {
    return value === "low" || value === "medium" || value === "high";
}

export function buildStreamOpts(runtimeConfig: RuntimeConfig, profileName: ProfileName): StreamOptions {
    return { ...runtimeConfig.streamOpts, ...profilePresets[profileName] };
}

export function formatProfile(profileName: ProfileName, streamOpts: RuntimeConfig["streamOpts"]): string {
    return `${profileName} (${streamOpts.width}x${streamOpts.height}, ${streamOpts.fps}fps, ${streamOpts.bitrateKbps}/${streamOpts.maxBitrateKbps} kbps)`;
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
