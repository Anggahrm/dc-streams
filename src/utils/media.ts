import type { ActivePlayback, VideoMetadata } from "../types.js";

export function shortUrl(url: string): string {
    return url.length > 80 ? `${url.slice(0, 77)}...` : url;
}

export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseFps(value: string | undefined): string {
    if (!value) return "unknown";
    const [numText, denText] = value.split("/");
    const num = Number(numText);
    const den = Number(denText ?? "1");
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return "unknown";
    const fps = num / den;
    if (!Number.isFinite(fps) || fps <= 0) return "unknown";
    return fps.toFixed(2).replace(/\.00$/, "");
}

export function formatMetadataReply(metadata: VideoMetadata): string {
    return `Media: ${metadata.durationText} | ${metadata.resolution} | ${metadata.fps}fps | ${metadata.videoCodec}/${metadata.audioCodec}`;
}

export function getCurrentOffsetSeconds(playback: ActivePlayback): number {
    const elapsedSeconds = (Date.now() - playback.startedAtMs) / 1000;
    return Math.max(0, playback.baseOffsetSeconds + elapsedSeconds);
}
