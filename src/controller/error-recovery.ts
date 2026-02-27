import type { QueueItem, PendingRestart } from "../types.js";
import type { Message } from "discord.js-selfbot-v13";
import { logWarn } from "../utils/logger.js";

type FailedSource = { count: number; lastFailedAt: number };

export type RecoveryAction =
    | { kind: "disconnect-recover"; restart: PendingRestart }
    | { kind: "refresh-url"; restart: PendingRestart }
    | { kind: "fatal" };

export class FailedSourceTracker {
    private readonly sources = new Map<string, FailedSource>();

    mark(sourceUrl: string): void {
        const current = this.sources.get(sourceUrl);
        this.sources.set(sourceUrl, {
            count: (current?.count ?? 0) + 1,
            lastFailedAt: Date.now()
        });
    }

    clear(sourceUrl: string): void {
        this.sources.delete(sourceUrl);
    }

    isUnstable(sourceUrl: string): boolean {
        const fail = this.sources.get(sourceUrl);
        if (!fail) return false;
        const recent = Date.now() - fail.lastFailedAt < 30_000;
        return fail.count >= 3 && recent;
    }

    getFailureCount(sourceUrl: string): number {
        return this.sources.get(sourceUrl)?.count ?? 0;
    }
}

export function classifyPlaybackError(
    error: unknown,
    item: QueueItem,
    resolvedUrl: string,
    seekSeconds: number,
    msg: Message,
    tracker: FailedSourceTracker
): RecoveryAction {
    if (!(error instanceof Error)) return { kind: "fatal" };

    const text = error.message.toLowerCase();

    if (text.includes("bot is not connected to a voice channel")) {
        return {
            kind: "disconnect-recover",
            restart: { item, offsetSeconds: seekSeconds, msg, retries: 1, cause: "disconnect-recover" }
        };
    }

    if (shouldRefreshResolvedUrl(error, item.sourceUrl, tracker)) {
        tracker.mark(item.sourceUrl);
        logWarn(`Resolver URL stale, retrying with fresh URL: ${item.sourceUrl}`);
        return {
            kind: "refresh-url",
            restart: { item, offsetSeconds: seekSeconds, msg, retries: 1, cause: "refresh-url" }
        };
    }

    if (shouldRetryGoogleVideoForbidden(error, resolvedUrl)) {
        tracker.mark(item.sourceUrl);
        logWarn(`Googlevideo 403 detected, forcing fresh resolver URL: ${item.sourceUrl}`);
        return {
            kind: "refresh-url",
            restart: { item, offsetSeconds: seekSeconds, msg, retries: 1, cause: "refresh-url" }
        };
    }

    return { kind: "fatal" };
}

function shouldRefreshResolvedUrl(error: unknown, sourceUrl: string, tracker: FailedSourceTracker): boolean {
    if (tracker.getFailureCount(sourceUrl) > 0) return false;
    if (!(error instanceof Error)) return false;

    const normalizedSource = sourceUrl.toLowerCase();
    if (!normalizedSource.includes("youtube.com/") && !normalizedSource.includes("youtu.be/") && !normalizedSource.startsWith("yt:")) {
        return false;
    }

    const text = error.message.toLowerCase();
    return text.includes("404")
        || text.includes("not found")
        || text.includes("invalid data found when processing input")
        || text.includes("error opening input");
}

function shouldRetryGoogleVideoForbidden(error: unknown, resolvedUrl: string): boolean {
    if (!resolvedUrl.toLowerCase().includes("googlevideo.com/")) return false;
    if (!(error instanceof Error)) return false;

    const text = error.message.toLowerCase();
    return text.includes("403") || text.includes("forbidden") || text.includes("access denied");
}
