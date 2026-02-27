import type { Message } from "discord.js-selfbot-v13";

// --- Stream & Playback ---

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

// --- Media Probe ---

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

// --- YouTube Resolver ---

export type ResolverDownloadPayload = {
    fileUrl?: string;
    file_url?: string;
    url?: string;
    status?: string;
    error?: string;
    id?: string;
    data?: { fileUrl?: string; url?: string };
};

// --- Anime / Donghua (Sanka Vollerei API) ---

export type AnimeSearchResult = {
    title: string;
    poster: string;
    status: string;
    score: string;
    animeId: string;
    href: string;
    genreList: Array<{ title: string; genreId: string; href: string }>;
};

export type AnimeDetail = {
    title: string;
    poster: string;
    status: string;
    score: string;
    synopsis: string;
    genres: string[];
    episodeList: Array<{
        title: string;
        episodeId: string;
        href: string;
    }>;
};

export type AnimeDownloadQuality = {
    title: string;
    urls: Array<{ title: string; url: string }>;
};

export type AnimeDownloadFormat = {
    title: string;
    qualities: AnimeDownloadQuality[];
};

export type AnimeEpisode = {
    title: string;
    animeId: string;
    defaultStreamingUrl: string;
    hasPrevEpisode: boolean;
    hasNextEpisode: boolean;
    server: {
        qualities: Array<{
            title: string;
            serverList: Array<{
                title: string;
                serverId: string;
                href: string;
            }>;
        }>;
    };
    downloadUrl?: {
        formats: AnimeDownloadFormat[];
    };
};

export type DonghuaSearchResult = {
    title: string;
    slug: string;
    poster: string;
    status: string;
    type: string;
    sub: string;
    href: string;
};

export type DonghuaDetail = {
    title: string;
    alter_title: string;
    poster: string;
    rating: string;
    status: string;
    type: string;
    synopsis: string;
    genres: Array<{ name: string; slug: string }>;
    episodes_list: Array<{
        episode: string;
        slug: string;
        href: string;
    }>;
};

export type DonghuaStreamingServer = {
    name: string;
    url: string;
};

export type DonghuaEpisode = {
    episode: string;
    streaming: {
        main_url: DonghuaStreamingServer;
        servers: DonghuaStreamingServer[];
    };
    donghua_details?: {
        title: string;
        slug: string;
        poster: string;
    };
};
