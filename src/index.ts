import { Client } from "discord.js-selfbot-v13";
import { Streamer } from "@dank074/discord-video-stream";
import { buildStreamOpts, resolveDefaultProfile, resolveRuntimeConfig } from "./config/runtime.js";
import { routeMessage } from "./commands/router.js";
import { StreamController } from "./controller/stream-controller.js";
import { MetadataService } from "./services/metadata-service.js";
import { YouTubeResolverService } from "./services/youtube-resolver-service.js";
import { AppState } from "./state/app-state.js";
import { logError, logInfo } from "./utils/logger.js";
import { safeReply } from "./utils/reply.js";

const runtimeConfig = resolveRuntimeConfig();
const streamer = new Streamer(new Client());

const youtubeResolverBase = (process.env.YTDL_API_BASE?.trim() || "https://youtubedl.siputzx.my.id").replace(/\/$/, "");
const youtubeResolverApiKey = process.env.YTDL_API_KEY?.trim();
const youtubeResolverMediaType = (process.env.YTDL_MEDIA_TYPE?.trim() || "merge").toLowerCase();
const ytdlPollIntervalMs = Number(process.env.YTDL_POLL_INTERVAL_MS || "2000");
const ytdlPollTimeoutMs = Number(process.env.YTDL_POLL_TIMEOUT_MS || "180000");

const defaultProfile = resolveDefaultProfile();
const state = new AppState({
    profile: defaultProfile,
    streamOpts: buildStreamOpts(runtimeConfig, defaultProfile)
});

const metadataService = new MetadataService();
const youtubeResolverService = new YouTubeResolverService({
    baseUrl: youtubeResolverBase,
    apiKey: youtubeResolverApiKey,
    mediaType: youtubeResolverMediaType,
    pollIntervalMs: ytdlPollIntervalMs,
    pollTimeoutMs: ytdlPollTimeoutMs
});

const controller = new StreamController(streamer, runtimeConfig, state, metadataService, youtubeResolverService);

streamer.client.on("ready", () => {
    logInfo(`${streamer.client.user?.tag} is ready`);
});

streamer.client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!runtimeConfig.acceptedAuthors.includes(msg.author.id)) return;
    if (!msg.content) return;

    state.latestMessageContext = msg;

    try {
        await routeMessage(msg, controller);
    } catch (error) {
        logError("messageCreate handler error", error);
        await safeReply(msg, "Command gagal diproses. Coba lagi.");
    }
});

process.on("unhandledRejection", (reason) => {
    logError("Unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
    logError("Uncaught exception", error);
});

streamer.client.login(runtimeConfig.token);
