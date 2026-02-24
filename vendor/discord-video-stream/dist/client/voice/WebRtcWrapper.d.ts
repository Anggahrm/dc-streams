import { PeerConnection } from "@lng2004/node-datachannel";
import type { BaseMediaConnection } from "./BaseMediaConnection.js";
export declare class WebRtcConnWrapper {
    private _mediaConn;
    private _webRtcConn?;
    private _audioDef;
    private _videoDef;
    private _audioTrack?;
    private _videoTrack?;
    private _audioPacketizer?;
    private _videoPacketizer?;
    private _videoCodec?;
    constructor(mediaConn: BaseMediaConnection);
    initWebRtc(): PeerConnection;
    private _setMediaHandler;
    close(): void;
    get webRtcConn(): PeerConnection | undefined;
    get ready(): boolean;
    get mediaConnection(): BaseMediaConnection;
    sendAudioFrame(frame: Buffer, frametime: number): void;
    sendVideoFrame(frame: Buffer, frametime: number): void;
    setPacketizer(videoCodec: string): void;
}
