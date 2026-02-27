function timestamp(): string {
    return new Date().toISOString();
}

export function logInfo(message: string, ...args: unknown[]): void {
    console.log(`[${timestamp()}] [info] ${message}`, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
    console.warn(`[${timestamp()}] [warn] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
    console.error(`[${timestamp()}] [error] ${message}`, ...args);
}
