import type { ProfileName } from "./types.js";

export const profilePresets: Record<ProfileName, {
    width: number;
    height: number;
    fps: number;
    bitrateKbps: number;
    maxBitrateKbps: number;
}> = {
    low: { width: 854, height: 480, fps: 24, bitrateKbps: 800, maxBitrateKbps: 1400 },
    medium: { width: 1280, height: 720, fps: 30, bitrateKbps: 1800, maxBitrateKbps: 2800 },
    high: { width: 1920, height: 1080, fps: 30, bitrateKbps: 3500, maxBitrateKbps: 5000 }
};

export const defaultSeekStepSeconds = 10;

export const helpLines = [
    "**Command List**",
    "",
    "**Stream**",
    "- `.play-live <url/youtube>` - Stream via Go Live",
    "- `.play-cam <url>` - Stream via Camera",
    "- `.queue` - Show queue status",
    "",
    "**Anime / Donghua**",
    "- `.anime <keyword>` - Search anime",
    "- `.anime-detail <id>` - Show anime detail",
    "- `.anime-play <episodeId>` - Stream anime episode",
    "- `.donghua <keyword>` - Search donghua",
    "- `.donghua-detail <slug>` - Show donghua detail",
    "- `.donghua-play <episodeSlug>` - Stream donghua episode",
    "",
    "**Owner Only**",
    "- `.skip` - Skip current stream",
    "- `.stop-stream` - Stop stream, stay in VC",
    "- `.disconnect` - Disconnect and clear queue",
    "- `.loop on|off|toggle|show` - Toggle loop",
    "- `.tune show|low|medium|high` - Change quality profile",
    "- `.back [seconds]` / `.forw [seconds]` - Seek",
    "",
    "Use `.help` to see this list."
] as const;
