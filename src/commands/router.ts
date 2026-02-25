import type { Message } from "discord.js-selfbot-v13";
import { defaultSeekStepSeconds, helpLines } from "../constants.js";
import type { StreamController } from "../controller/stream-controller.js";
import { isProfileName } from "../config/runtime.js";
import { parseSeekStep, parseUrlArg } from "../utils/command.js";
import { safeReply } from "../utils/reply.js";

export async function routeMessage(msg: Message, controller: StreamController): Promise<void> {
    const content = msg.content;
    if (!content) return;

    if (content.startsWith(".help")) {
        await safeReply(msg, helpLines.join("\n"));
        return;
    }

    if (content.startsWith(".queue")) {
        await safeReply(msg, controller.formatQueueStatus());
        return;
    }

    if (content.startsWith(".loop")) {
        const arg = content.trim().split(/\s+/)[1]?.toLowerCase();
        const result = controller.toggleLoop(arg);
        await safeReply(msg, result);
        return;
    }

    if (content.startsWith(".tune")) {
        const selectedProfile = content.trim().split(/\s+/)[1]?.toLowerCase();
        if (!selectedProfile || selectedProfile === "show") {
            await safeReply(msg, controller.getTuneStatus());
            return;
        }
        if (!isProfileName(selectedProfile)) {
            await safeReply(msg, "Profil tidak valid. Gunakan: .tune low | .tune medium | .tune high");
            return;
        }
        await safeReply(msg, await controller.applyTune(msg, selectedProfile));
        return;
    }

    if (content.startsWith(".back") || content.startsWith(".forw")) {
        const stepSeconds = parseSeekStep(content, defaultSeekStepSeconds);
        const result = await controller.seekPlayback(msg, content.startsWith(".back") ? -stepSeconds : stepSeconds);
        await safeReply(msg, result);
        return;
    }

    if (content.startsWith(".skip")) {
        await safeReply(msg, await controller.skip(msg));
        return;
    }

    if (content.startsWith(".play-live") || content.startsWith(".play-cam")) {
        const url = parseUrlArg(content);
        if (!url) {
            await safeReply(msg, "Format: .play-live <url> atau .play-cam <url>");
            return;
        }
        const isCamera = content.startsWith(".play-cam");
        const message = await controller.enqueueAndPlay(msg, url, isCamera ? "camera" : "go-live");
        await safeReply(msg, message);
        return;
    }

    if (content.startsWith(".disconnect")) {
        await controller.disconnect();
        await safeReply(msg, "Disconnected. Queue dibersihkan.");
        return;
    }

    if (content.startsWith(".stop-stream")) {
        await safeReply(msg, controller.stopStreamOnly());
    }
}
