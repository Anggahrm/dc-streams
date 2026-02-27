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
    "- Public: `.help`, `.queue`, `.play-live <url/youtube>`, `.play-cam <url>`",
    "- Owner priority: `.skip`, `.stop-stream`, `.disconnect`, `.loop on|off|toggle|show`, `.tune show|low|medium|high`, `.back [seconds]`, `.forw [seconds]`"
] as const;
