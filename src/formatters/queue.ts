import type { AppState } from "../state/app-state.js";
import { getCurrentOffsetSeconds, shortUrl } from "../utils/media.js";

export function formatQueueStatus(state: AppState): string {
    const lines = [
        "**Queue Status**",
        `- Loop: **${state.loopEnabled ? "ON" : "OFF"}**`,
        `- Now playing: ${state.activePlayback
            ? `\`${state.activePlayback.type}\` ${shortUrl(state.activePlayback.sourceUrl)} @~${Math.floor(getCurrentOffsetSeconds(state.activePlayback))}s (${state.activePlayback.requestedByOwner ? "owner" : "public"})`
            : "-"}`,
        `- Queue: ${state.queue.length}`,
        "",
        "**Queue Items**"
    ];

    if (state.queue.length === 0) lines.push("- empty");
    else state.queue.slice(0, 10).forEach((item, index) => {
        lines.push(`- ${index + 1}. \`${item.type}\` ${shortUrl(item.sourceUrl)} (${item.requestedByOwner ? "owner" : "public"})`);
    });

    return lines.join("\n");
}
