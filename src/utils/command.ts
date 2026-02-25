export function parseUrlArg(message: string): string | undefined {
    const args = message.trim().split(/\s+/);
    if (args.length < 2) return undefined;
    return args[1];
}

export function parseSeekStep(message: string, fallbackSeconds: number): number {
    const stepText = message.trim().split(/\s+/)[1];
    const parsed = Number(stepText);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackSeconds;
    return parsed;
}
