export function logInfo(message: string, ...args: unknown[]): void {
    console.log(`[info] ${message}`, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
    console.log(`[warn] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
    console.log(`[error] ${message}`, ...args);
}
