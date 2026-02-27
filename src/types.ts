import type { Message } from "discord.js-selfbot-v13";

export type ProfileName = "low" | "medium" | "high";
export type StreamType = "go-live" | "camera";

export type StreamOptions = {
    width: number;
    height: number;
    fps: number;
    bitrateKbps: number;
    maxBitrateKbps: number;
    hardware_acceleration: boolean;
    videoCodec: string;
};

export type QueueItem = {
    sourceUrl: string;
    type: StreamType;
    requestedByOwner?: boolean;
};

export type StopReason =
    | "natural-end"
    | "manual-stop"
    | "switch"
    | "disconnect"
    | "seek"
    | "tune"
    | "skip"
    | "error"
    | null;

export type PendingRestartCause = "seek" | "tune" | "skip" | "disconnect-recover" | "refresh-url";

export type PendingRestart = {
    item: QueueItem;
    offsetSeconds: number;
    msg: Message;
    retries: number;
    cause: PendingRestartCause;
};

export type ActivePlayback = {
    sourceUrl: string;
    resolvedUrl: string;
    type: StreamType;
    requestedByOwner?: boolean;
    baseOffsetSeconds: number;
    startedAtMs: number;
    controller: AbortController;
    stopReason: StopReason;
};

export type ProbeResult = {
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

export type VideoMetadata = {
    durationSeconds?: number;
    durationText: string;
    resolution: string;
    fps: string;
    videoCodec: string;
    audioCodec: string;
};

export type ResolverDownloadPayload = {
    fileUrl?: string;
    file_url?: string;
    url?: string;
    status?: string;
    error?: string;
    id?: string;
    data?: { fileUrl?: string; url?: string };
};
