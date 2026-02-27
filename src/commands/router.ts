import type { Message } from "discord.js-selfbot-v13";
import { defaultSeekStepSeconds, helpLines } from "../constants.js";
import type { StreamController } from "../controller/stream-controller.js";
import { isProfileName } from "../config/runtime.js";
import { parseSeekStep, parseUrlArg } from "../utils/command.js";
import { safeReply } from "../utils/reply.js";
import {
    searchAnime,
    getAnimeDetail,
    resolveAnimeStreamUrl,
    searchDonghua,
    getDonghuaDetail,
    resolveDonghuaStreamUrl
} from "../services/anime-service.js";
import {
    formatAnimeSearchResults,
    formatAnimeDetail,
    formatDonghuaSearchResults,
    formatDonghuaDetail
} from "../formatters/anime.js";

const ownerOnlyNotice = [
    "**Access denied**",
    "> This command is owner-priority.",
    "Use `.help` for public commands."
].join("\n");

type CommandHandler = (msg: Message, controller: StreamController, isOwnerAuthor: boolean, content: string) => Promise<void>;

function ownerOnly(handler: (msg: Message, controller: StreamController, content: string) => Promise<void>): CommandHandler {
    return async (msg, controller, isOwnerAuthor, content) => {
        if (!isOwnerAuthor) {
            await safeReply(msg, ownerOnlyNotice);
            return;
        }
        await handler(msg, controller, content);
    };
}

function extractArg(content: string): string {
    return content.trim().split(/\s+/).slice(1).join(" ").trim();
}

const commands: Array<{ prefix: string; handler: CommandHandler }> = [
    {
        prefix: ".help",
        handler: async (msg) => {
            await safeReply(msg, helpLines.join("\n"));
        }
    },
    {
        prefix: ".queue",
        handler: async (msg, controller) => {
            await safeReply(msg, controller.formatQueueStatus());
        }
    },
    {
        prefix: ".loop",
        handler: ownerOnly(async (msg, controller, content) => {
            const arg = content.trim().split(/\s+/)[1]?.toLowerCase();
            await safeReply(msg, controller.toggleLoop(arg));
        })
    },
    {
        prefix: ".tune",
        handler: ownerOnly(async (msg, controller, content) => {
            const selectedProfile = content.trim().split(/\s+/)[1]?.toLowerCase();
            if (!selectedProfile || selectedProfile === "show") {
                await safeReply(msg, controller.getTuneStatus());
                return;
            }
            if (!isProfileName(selectedProfile)) {
                await safeReply(msg, "**Invalid profile**\nUse: `.tune low`, `.tune medium`, or `.tune high`.");
                return;
            }
            await safeReply(msg, await controller.applyTune(msg, selectedProfile));
        })
    },
    {
        prefix: ".back",
        handler: ownerOnly(async (msg, controller, content) => {
            const stepSeconds = parseSeekStep(content, defaultSeekStepSeconds);
            await safeReply(msg, await controller.seekPlayback(msg, -stepSeconds));
        })
    },
    {
        prefix: ".forw",
        handler: ownerOnly(async (msg, controller, content) => {
            const stepSeconds = parseSeekStep(content, defaultSeekStepSeconds);
            await safeReply(msg, await controller.seekPlayback(msg, stepSeconds));
        })
    },
    {
        prefix: ".skip",
        handler: ownerOnly(async (msg, controller) => {
            await safeReply(msg, await controller.skip(msg));
        })
    },
    {
        prefix: ".play-live",
        handler: async (msg, controller, isOwnerAuthor, content) => {
            const url = parseUrlArg(content);
            if (!url) {
                await safeReply(msg, "**Invalid format**\nUse: `.play-live <url>`.");
                return;
            }
            const message = await controller.enqueueAndPlay(msg, url, "go-live", isOwnerAuthor);
            if (message) await safeReply(msg, message);
        }
    },
    {
        prefix: ".play-cam",
        handler: async (msg, controller, isOwnerAuthor, content) => {
            const url = parseUrlArg(content);
            if (!url) {
                await safeReply(msg, "**Invalid format**\nUse: `.play-cam <url>`.");
                return;
            }
            const message = await controller.enqueueAndPlay(msg, url, "camera", isOwnerAuthor);
            if (message) await safeReply(msg, message);
        }
    },
    {
        prefix: ".disconnect",
        handler: ownerOnly(async (msg, controller) => {
            await controller.disconnect();
            await safeReply(msg, "**Disconnected**\nQueue cleared.");
        })
    },
    {
        prefix: ".stop-stream",
        handler: ownerOnly(async (msg, controller) => {
            await safeReply(msg, controller.stopStreamOnly());
        })
    },

    // --- Anime commands ---
    {
        prefix: ".anime-detail",
        handler: async (msg, _controller, _isOwnerAuthor, content) => {
            const slug = extractArg(content);
            if (!slug) {
                await safeReply(msg, "**Usage:** `.anime-detail <animeId>`");
                return;
            }
            await safeReply(msg, "Fetching anime detail...");
            const detail = await getAnimeDetail(slug);
            if (!detail) {
                await safeReply(msg, `**Anime not found:** \`${slug}\``);
                return;
            }
            await safeReply(msg, formatAnimeDetail(detail));
        }
    },
    {
        prefix: ".anime-play",
        handler: async (msg, controller, isOwnerAuthor, content) => {
            const episodeSlug = extractArg(content);
            if (!episodeSlug) {
                await safeReply(msg, "**Usage:** `.anime-play <episodeId>`\nGet episode IDs from `.anime-detail <animeId>`.");
                return;
            }
            await safeReply(msg, `Resolving stream for \`${episodeSlug}\`...`);
            const result = await resolveAnimeStreamUrl(episodeSlug);
            if (!result) {
                await safeReply(msg, `**Failed to resolve stream**\nEpisode: \`${episodeSlug}\`\nThe server may be unavailable.`);
                return;
            }
            const message = await controller.enqueueAndPlay(msg, result.url, "go-live", isOwnerAuthor);
            if (message) {
                await safeReply(msg, `**Anime:** ${result.title}\n${message}`);
            } else {
                await safeReply(msg, `**Streaming:** ${result.title}`);
            }
        }
    },
    {
        prefix: ".anime",
        handler: async (msg, _controller, _isOwnerAuthor, content) => {
            const keyword = extractArg(content);
            if (!keyword) {
                await safeReply(msg, "**Usage:** `.anime <keyword>`\nExample: `.anime naruto`");
                return;
            }
            await safeReply(msg, `Searching anime: \`${keyword}\`...`);
            const results = await searchAnime(keyword);
            await safeReply(msg, formatAnimeSearchResults(results, keyword));
        }
    },

    // --- Donghua commands ---
    {
        prefix: ".donghua-detail",
        handler: async (msg, _controller, _isOwnerAuthor, content) => {
            const slug = extractArg(content);
            if (!slug) {
                await safeReply(msg, "**Usage:** `.donghua-detail <slug>`");
                return;
            }
            await safeReply(msg, "Fetching donghua detail...");
            const detail = await getDonghuaDetail(slug);
            if (!detail) {
                await safeReply(msg, `**Donghua not found:** \`${slug}\``);
                return;
            }
            await safeReply(msg, formatDonghuaDetail(detail));
        }
    },
    {
        prefix: ".donghua-play",
        handler: async (msg, controller, isOwnerAuthor, content) => {
            const episodeSlug = extractArg(content);
            if (!episodeSlug) {
                await safeReply(msg, "**Usage:** `.donghua-play <episodeSlug>`\nGet episode slugs from `.donghua-detail <slug>`.");
                return;
            }
            await safeReply(msg, `Resolving stream for \`${episodeSlug}\`...`);
            const result = await resolveDonghuaStreamUrl(episodeSlug);
            if (!result) {
                await safeReply(msg, `**Failed to resolve stream**\nEpisode: \`${episodeSlug}\`\nThe server may be unavailable.`);
                return;
            }
            const message = await controller.enqueueAndPlay(msg, result.url, "go-live", isOwnerAuthor);
            if (message) {
                await safeReply(msg, `**Donghua:** ${result.title}\n${message}`);
            } else {
                await safeReply(msg, `**Streaming:** ${result.title}`);
            }
        }
    },
    {
        prefix: ".donghua",
        handler: async (msg, _controller, _isOwnerAuthor, content) => {
            const keyword = extractArg(content);
            if (!keyword) {
                await safeReply(msg, "**Usage:** `.donghua <keyword>`\nExample: `.donghua soul land`");
                return;
            }
            await safeReply(msg, `Searching donghua: \`${keyword}\`...`);
            const results = await searchDonghua(keyword);
            await safeReply(msg, formatDonghuaSearchResults(results, keyword));
        }
    }
];

export async function routeMessage(msg: Message, controller: StreamController, isOwnerAuthor: boolean): Promise<void> {
    const content = msg.content;
    if (!content) return;

    for (const command of commands) {
        if (content.startsWith(command.prefix)) {
            await command.handler(msg, controller, isOwnerAuthor, content);
            return;
        }
    }

    if (content.startsWith(".")) {
        await safeReply(msg, "**Unknown command**\nUse `.help` to see the command list.");
    }
}
