import { createHash } from "node:crypto";
import type { ResolverDownloadPayload } from "../types.js";
import { sleep } from "../utils/async.js";
import { logInfo, logWarn } from "../utils/logger.js";

type YoutubeResolverOptions = {
    baseUrl: string;
    apiKey?: string;
    mediaType: string;
    pollIntervalMs: number;
    pollTimeoutMs: number;
};

export class YouTubeResolverService {
    private readonly cache = new Map<string, { url: string; expiresAt: number }>();
    private readonly cacheTtlMs = Math.max(0, Number(process.env.YTDL_CACHE_TTL_MS || "45000"));

    constructor(private readonly options: YoutubeResolverOptions) {}

    async resolvePlayableUrl(sourceUrl: string): Promise<string> {
        const normalizedSourceUrl = this.normalizeResolverSourceUrl(sourceUrl);
        if (!this.isYouTubeUrl(normalizedSourceUrl)) return sourceUrl;

        const cached = this.cache.get(normalizedSourceUrl);
        if (cached && cached.expiresAt > Date.now()) {
            const stillValid = await this.isResolvedUrlUsable(cached.url);
            if (stillValid) return cached.url;
            this.cache.delete(normalizedSourceUrl);
        }

        const resolved = await this.resolveViaApi(normalizedSourceUrl);
        if (this.cacheTtlMs > 0) {
            this.cache.set(normalizedSourceUrl, { url: resolved, expiresAt: Date.now() + this.cacheTtlMs });
        }
        return resolved;
    }

    invalidate(sourceUrl: string): void {
        this.cache.delete(this.normalizeResolverSourceUrl(sourceUrl));
    }

    private isYouTubeUrl(url: string): boolean {
        const normalized = url.toLowerCase();
        return normalized.includes("youtube.com/") || normalized.includes("youtu.be/") || normalized.startsWith("yt:");
    }

    private async resolveViaApi(sourceUrl: string): Promise<string> {
        logInfo(`Resolver request: type=${this.options.mediaType} source=${sourceUrl}`);
        const headers: Record<string, string> = { Accept: "application/json" };
        const firstTry = await this.callResolverDownload(sourceUrl, headers);

        if (firstTry.statusCode === 401) {
            const powSession = await this.solveYtdlPowSession(sourceUrl);
            headers.Cookie = `pow_session=${powSession}`;
        } else if (firstTry.statusCode >= 400) {
            throw new Error(`YouTube resolver failed (${firstTry.statusCode})`);
        } else {
            return await this.resolveDownloadPayloadToUrl(sourceUrl, firstTry.payload, headers);
        }

        const secondTry = await this.callResolverDownload(sourceUrl, headers);
        if (secondTry.statusCode >= 400) {
            throw new Error(`YouTube resolver failed after PoW (${secondTry.statusCode})`);
        }
        return await this.resolveDownloadPayloadToUrl(sourceUrl, secondTry.payload, headers);
    }

    private extractResolvedFileUrl(payload: ResolverDownloadPayload): string {
        const fileUrl = payload.fileUrl || payload.file_url || payload.url || payload.data?.fileUrl || payload.data?.url;
        if (!fileUrl) throw new Error("YouTube resolver returned empty file URL");
        if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
        return new URL(fileUrl, `${this.options.baseUrl}/`).toString();
    }

    private async resolveDownloadPayloadToUrl(
        sourceUrl: string,
        payload: ResolverDownloadPayload,
        headers: Record<string, string>
    ): Promise<string> {
        if (this.hasResolverFileUrl(payload)) {
            const candidate = this.extractResolvedFileUrl(payload);
            if (await this.isResolvedUrlUsable(candidate)) return candidate;
            return await this.pollResolverFileUrl(sourceUrl, headers, candidate);
        }

        const status = payload.status?.toLowerCase();
        if (status === "failed" || status === "error") {
            throw new Error(`Resolver download failed: ${payload.error || "unknown"}`);
        }
        if (status === "downloading" || status === "processing" || status === "queued") {
            return await this.pollResolverFileUrl(sourceUrl, headers);
        }

        throw new Error("Resolver response missing file URL");
    }

    private async pollResolverFileUrl(
        sourceUrl: string,
        headers: Record<string, string>,
        avoidUrl?: string
    ): Promise<string> {
        const start = Date.now();
        let lastRejectedUrl = avoidUrl;
        let pollCount = 0;
        let completedUnusableCount = 0;

        while (Date.now() - start < this.options.pollTimeoutMs) {
            await sleep(this.options.pollIntervalMs);
            const result = await this.callResolverDownload(sourceUrl, headers);
            if (result.statusCode >= 400) throw new Error(`Resolver polling failed (${result.statusCode})`);
            pollCount += 1;

            logInfo(
                `Resolver poll #${pollCount}: status=${result.payload.status || "unknown"} id=${result.payload.id || "-"} hasFileUrl=${this.hasResolverFileUrl(result.payload)}`
            );

            if (this.hasResolverFileUrl(result.payload)) {
                const candidate = this.extractResolvedFileUrl(result.payload);
                const status = result.payload.status?.toLowerCase();

                if (lastRejectedUrl && candidate === lastRejectedUrl) {
                    if (status === "completed") {
                        completedUnusableCount += 1;
                        if (completedUnusableCount >= 3) {
                            throw new Error("Resolver completed but returned unusable file URL repeatedly");
                        }
                    }
                    continue;
                }

                if (await this.isResolvedUrlUsable(candidate)) return candidate;
                if (status === "completed") {
                    completedUnusableCount += 1;
                    if (completedUnusableCount >= 3) {
                        throw new Error("Resolver completed but returned unusable file URL repeatedly");
                    }
                }
                lastRejectedUrl = candidate;
                continue;
            }

            const status = result.payload.status?.toLowerCase();
            if (status === "failed" || status === "error") {
                throw new Error(`Resolver polling failed: ${result.payload.error || "unknown"}`);
            }
        }
        logInfo(`Resolver polling timeout after ${pollCount} attempts for ${sourceUrl}`);
        throw new Error("Resolver polling timeout");
    }

    private hasResolverFileUrl(payload: ResolverDownloadPayload): boolean {
        return Boolean(payload.fileUrl || payload.file_url || payload.data?.fileUrl || payload.data?.url);
    }

    private async callResolverDownload(
        sourceUrl: string,
        headers: Record<string, string>
    ): Promise<{ statusCode: number; payload: ResolverDownloadPayload }> {
        const endpoint = new URL(`${this.options.baseUrl}/download`);
        endpoint.searchParams.set("url", sourceUrl);
        endpoint.searchParams.set("type", this.options.mediaType);
        if (this.options.apiKey) endpoint.searchParams.set("apikey", this.options.apiKey);

        const response = await fetch(endpoint.toString(), { method: "GET", headers });
        const payload = await response.json().catch(() => ({} as ResolverDownloadPayload));
        if (response.status >= 400) {
            const payloadSummary = JSON.stringify({
                status: payload.status,
                error: payload.error,
                id: payload.id
            });
            logWarn(`Resolver HTTP ${response.status}: source=${sourceUrl} payload=${payloadSummary}`);
        }
        return { statusCode: response.status, payload };
    }

    private normalizeResolverSourceUrl(sourceUrl: string): string {
        if (!this.isYouTubeUrl(sourceUrl)) return sourceUrl;

        try {
            const parsed = new URL(sourceUrl);
            const host = parsed.hostname.toLowerCase();

            if (host === "youtu.be" || host.endsWith(".youtu.be")) {
                const normalized = new URL(`${parsed.protocol}//youtu.be${parsed.pathname}`);
                const t = parsed.searchParams.get("t");
                if (t) normalized.searchParams.set("t", t);
                return normalized.toString();
            }

            if (host.includes("youtube.com")) {
                if (parsed.pathname === "/watch") {
                    const v = parsed.searchParams.get("v");
                    if (!v) return sourceUrl;
                    const normalized = new URL("https://www.youtube.com/watch");
                    normalized.searchParams.set("v", v);
                    const t = parsed.searchParams.get("t");
                    if (t) normalized.searchParams.set("t", t);
                    return normalized.toString();
                }

                if (parsed.pathname.startsWith("/live/")) {
                    const liveId = parsed.pathname.split("/").filter(Boolean)[1];
                    if (!liveId) return sourceUrl;
                    const normalized = new URL("https://www.youtube.com/watch");
                    normalized.searchParams.set("v", liveId);
                    const t = parsed.searchParams.get("t");
                    if (t) normalized.searchParams.set("t", t);
                    return normalized.toString();
                }

                if (parsed.pathname.startsWith("/shorts/")) {
                    return `https://www.youtube.com${parsed.pathname}`;
                }
            }

            return sourceUrl;
        } catch {
            return sourceUrl;
        }
    }

    private async solveYtdlPowSession(sourceUrl: string): Promise<string> {
        const challengeRes = await fetch(`${this.options.baseUrl}/akumaudownload`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ url: sourceUrl, type: this.options.mediaType })
        });
        if (!challengeRes.ok) throw new Error(`YouTube resolver challenge failed (${challengeRes.status})`);

        const challengePayload = await challengeRes.json() as { challenge: string; difficulty: number };
        const nonce = this.solvePowNonce(challengePayload.challenge, challengePayload.difficulty);

        const verifyRes = await fetch(`${this.options.baseUrl}/cekpunyaku`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ url: sourceUrl, type: this.options.mediaType, nonce })
        });
        if (!verifyRes.ok) throw new Error(`YouTube resolver verify failed (${verifyRes.status})`);

        const setCookie = verifyRes.headers.get("set-cookie") || "";
        const match = /pow_session=([^;]+)/.exec(setCookie);
        if (!match) throw new Error("YouTube resolver did not return pow_session cookie");
        return match[1];
    }

    private solvePowNonce(challenge: string, difficulty: number): string {
        const prefix = "0".repeat(Math.max(1, difficulty));
        for (let i = 0; i < 20_000_000; i++) {
            const nonce = String(i);
            const hash = createHash("sha256").update(challenge).update(nonce).digest("hex");
            if (hash.startsWith(prefix)) return nonce;
        }
        throw new Error(`Failed to solve PoW difficulty ${difficulty}`);
    }

    private async isResolvedUrlUsable(url: string): Promise<boolean> {
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { Range: "bytes=0-0" },
                signal: AbortSignal.timeout(6000)
            });
            return response.ok || response.status === 206;
        } catch {
            return false;
        }
    }
}
