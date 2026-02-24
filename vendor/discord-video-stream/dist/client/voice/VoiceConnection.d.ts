import { BaseMediaConnection } from "./BaseMediaConnection.js";
import type { StreamConnection } from "./StreamConnection.js";
export declare class VoiceConnection extends BaseMediaConnection {
    streamConnection?: StreamConnection;
    get daveChannelId(): string;
    get serverId(): string;
    stop(): void;
}
