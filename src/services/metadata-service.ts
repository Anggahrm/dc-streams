import { spawn } from "node:child_process";
import type { ProbeResult, VideoMetadata } from "../types.js";
import { formatDuration, parseFps } from "../utils/media.js";

export class MetadataService {
    private readonly cache = new Map<string, VideoMetadata>();

    async getOrProbe(url: string): Promise<VideoMetadata | undefined> {
        const cached = this.cache.get(url);
        if (cached) return cached;
        const metadata = await this.probe(url);
        if (metadata) this.cache.set(url, metadata);
        return metadata;
    }

    private async probe(url: string): Promise<VideoMetadata | undefined> {
        const result = await this.runFfprobe(url).catch(() => undefined);
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

    private runFfprobe(url: string): Promise<ProbeResult> {
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
}
