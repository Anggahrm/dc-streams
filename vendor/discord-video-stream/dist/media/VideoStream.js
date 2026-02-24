import { BaseMediaStream } from "./BaseMediaStream.js";
export class VideoStream extends BaseMediaStream {
    _conn;
    constructor(conn, noSleep = false) {
        super("video", noSleep);
        this._conn = conn;
    }
    async _sendFrame(frame, frametime) {
        this._conn.sendVideoFrame(frame, frametime);
    }
}
//# sourceMappingURL=VideoStream.js.map