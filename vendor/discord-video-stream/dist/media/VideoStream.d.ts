import { BaseMediaStream } from "./BaseMediaStream.js";
import type { WebRtcConnWrapper } from "../client/voice/WebRtcWrapper.js";
export declare class VideoStream extends BaseMediaStream {
    private _conn;
    constructor(conn: WebRtcConnWrapper, noSleep?: boolean);
    protected _sendFrame(frame: Buffer, frametime: number): Promise<void>;
}
