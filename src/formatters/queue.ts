import type { AppState } from "../state/app-state.js";
import { getCurrentOffsetSeconds, shortUrl } from "../utils/media.js";

export function formatQueueStatus(state: AppState): string {
    const lines = [
        `Loop: ${state.loopEnabled ? "ON" : "OFF"}`,
        `Now playing: ${state.activePlayback ? `${state.activePlayback.type} ${shortUrl(state.activePlayback.sourceUrl)} @~${Math.floor(getCurrentOffsetSeconds(state.activePlayback))}s` : "-"}`,
        `Queue (${state.queue.length}):`
    ];

    if (state.queue.length === 0) lines.push("- kosong");
    else state.queue.slice(0, 10).forEach((item, index) => lines.push(`${index + 1}. ${item.type} ${shortUrl(item.sourceUrl)}`));

    return lines.join("\n");
}
