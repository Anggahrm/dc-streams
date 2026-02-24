import { VoiceConnection } from "./voice/VoiceConnection.js";
import type { Client, DMChannel, GroupDMChannel, VoiceBasedChannel } from "discord.js-selfbot-v13";
import type { WebRtcConnWrapper } from "./voice/WebRtcWrapper.js";
export declare class Streamer {
    private _voiceConnection?;
    private _client;
    private _gatewayEmitter;
    constructor(client: Client);
    get client(): Client;
    get opts(): {};
    get voiceConnection(): VoiceConnection | undefined;
    sendOpcode(code: number, data: unknown): void;
    joinVoiceChannel(channel: DMChannel | GroupDMChannel | VoiceBasedChannel): Promise<WebRtcConnWrapper>;
    /**
     * Joins a voice channel and returns a WebRtcConnWrapper object.
     * @param guild_id the guild id of the voice channel. If null, it will join a DM voice channel.
     * @param channel_id the channel id of the voice channel
     * @returns the WebRtcConnWrapper object
     * @throws Error if the client is not logged in
     */
    joinVoice(guild_id: string | null, channel_id: string): Promise<WebRtcConnWrapper>;
    createStream(): Promise<WebRtcConnWrapper>;
    setStreamPreview(image: Buffer): Promise<void>;
    stopStream(): void;
    leaveVoice(): void;
    signalVideo(video_enabled: boolean): void;
    signalStream(): void;
    signalStopStream(): void;
    signalLeaveVoice(): void;
}
