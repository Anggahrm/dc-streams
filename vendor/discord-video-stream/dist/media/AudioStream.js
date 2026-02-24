import { BaseMediaStream } from "./BaseMediaStream.js";
export class AudioStream extends BaseMediaStream {
    _conn;
    constructor(conn, noSleep = false) {
        super("audio", noSleep);
        this._conn = conn;
    }
    async _sendFrame(frame, frametime) {
        this._conn.sendAudioFrame(frame, frametime);
    }
}
//# sourceMappingURL=AudioStream.js.map