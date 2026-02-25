import { createHash } from "node:crypto";
import type { ResolverDownloadPayload } from "../types.js";
import { sleep } from "../utils/async.js";

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
        if (!this.isYouTubeUrl(sourceUrl)) return sourceUrl;

        const cached = this.cache.get(sourceUrl);
        if (cached && cached.expiresAt > Date.now()) {
            const stillValid = await this.isResolvedUrlUsable(cached.url);
            if (stillValid) return cached.url;
            this.cache.delete(sourceUrl);
        }

        const resolved = await this.resolveViaApi(sourceUrl);
        if (this.cacheTtlMs > 0) {
            this.cache.set(sourceUrl, { url: resolved, expiresAt: Date.now() + this.cacheTtlMs });
        }
        return resolved;
    }

    invalidate(sourceUrl: string): void {
        this.cache.delete(sourceUrl);
    }

    private isYouTubeUrl(url: string): boolean {
        const normalized = url.toLowerCase();
        return normalized.includes("youtube.com/") || normalized.includes("youtu.be/") || normalized.startsWith("yt:");
    }

    private async resolveViaApi(sourceUrl: string): Promise<string> {
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
        if (this.hasResolverFileUrl(payload)) return this.extractResolvedFileUrl(payload);

        const status = payload.status?.toLowerCase();
        if (status === "failed" || status === "error") {
            throw new Error(`Resolver download failed: ${payload.error || "unknown"}`);
        }
        if (status === "downloading" || status === "processing" || status === "queued") {
            return await this.pollResolverFileUrl(sourceUrl, headers);
        }

        throw new Error("Resolver response missing file URL");
    }

    private async pollResolverFileUrl(sourceUrl: string, headers: Record<string, string>): Promise<string> {
        const start = Date.now();
        while (Date.now() - start < this.options.pollTimeoutMs) {
            await sleep(this.options.pollIntervalMs);
            const result = await this.callResolverDownload(sourceUrl, headers);
            if (result.statusCode >= 400) throw new Error(`Resolver polling failed (${result.statusCode})`);
            if (this.hasResolverFileUrl(result.payload)) return this.extractResolvedFileUrl(result.payload);

            const status = result.payload.status?.toLowerCase();
            if (status === "failed" || status === "error") {
                throw new Error(`Resolver polling failed: ${result.payload.error || "unknown"}`);
            }
        }
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
        return { statusCode: response.status, payload };
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
