import { Log } from "debug-level";
import { setTimeout } from "node:timers/promises";
import { Writable } from "node:stream";
export class BaseMediaStream extends Writable {
    _pts;
    _syncTolerance = 20;
    _loggerSend;
    _loggerSync;
    _loggerSleep;
    _noSleep;
    _startTime;
    _startPts;
    _sync = true;
    _syncStream;
    constructor(type, noSleep = false) {
        super({ objectMode: true, highWaterMark: 0 });
        this._loggerSend = new Log(`stream:${type}:send`);
        this._loggerSync = new Log(`stream:${type}:sync`);
        this._loggerSleep = new Log(`stream:${type}:sleep`);
        this._noSleep = noSleep;
    }
    get sync() {
        return this._sync;
    }
    set sync(val) {
        this._sync = val;
        if (val)
            this._loggerSync.debug("Sync enabled");
        else
            this._loggerSync.debug("Sync disabled");
    }
    get syncStream() {
        return this._syncStream;
    }
    set syncStream(stream) {
        if (stream !== undefined && this === stream.syncStream)
            throw new Error("Cannot sync 2 streams with eachother");
        this._syncStream = stream;
    }
    get noSleep() {
        return this._noSleep;
    }
    set noSleep(val) {
        this._noSleep = val;
        if (!val)
            this.resetTimingCompensation();
    }
    get pts() {
        return this._pts;
    }
    get syncTolerance() {
        return this._syncTolerance;
    }
    set syncTolerance(n) {
        if (n < 0)
            return;
        this._syncTolerance = n;
    }
    async _sendFrame(_frame, _frametime) {
        throw new Error("Not implemented");
    }
    ptsDelta() {
        if (this.pts !== undefined && this.syncStream?.pts !== undefined)
            return this.pts - this.syncStream.pts;
        return undefined;
    }
    isAhead() {
        const delta = this.ptsDelta();
        return (this.syncStream?.writableEnded === false &&
            delta !== undefined &&
            delta > this.syncTolerance);
    }
    isBehind() {
        const delta = this.ptsDelta();
        return (this.syncStream?.writableEnded === false &&
            delta !== undefined &&
            delta < -this.syncTolerance);
    }
    resetTimingCompensation() {
        this._startTime = this._startPts = undefined;
    }
    async _write(frame, _, callback) {
        const { data, pts, duration, timeBase } = frame;
        if (!data) {
            frame.free();
            callback();
            return;
        }
        const frametime = (Number(duration) / timeBase.den) * timeBase.num * 1000;
        const start_sendFrame = performance.now();
        await this._sendFrame(Buffer.from(data), frametime);
        const end_sendFrame = performance.now();
        this._pts = (Number(pts) / timeBase.den) * timeBase.num * 1000;
        this.emit("pts", this._pts);
        const sendTime = end_sendFrame - start_sendFrame;
        const ratio = sendTime / frametime;
        this._loggerSend.debug({
            stats: {
                pts: this._pts,
                frame_size: data.length,
                duration: sendTime,
                frametime,
            },
        }, `Frame sent in ${sendTime.toFixed(2)}ms (${(ratio * 100).toFixed(2)}% frametime)`);
        if (ratio > 1) {
            this._loggerSend.warn({
                frame_size: data.length,
                duration: sendTime,
                frametime,
            }, `Frame takes too long to send (${(ratio * 100).toFixed(2)}% frametime)`);
        }
        this._startTime ??= start_sendFrame;
        this._startPts ??= this._pts;
        const sleep = Math.max(0, this._pts -
            this._startPts +
            frametime -
            (end_sendFrame - this._startTime));
        if (this._noSleep || sleep === 0) {
            callback(null);
        }
        else if (this.sync && this.isBehind()) {
            this._loggerSync.debug({
                stats: {
                    pts: this.pts,
                    pts_other: this.syncStream?.pts,
                },
            }, "Stream is behind. Not sleeping for this frame");
            this.resetTimingCompensation();
            callback(null);
        }
        else if (this.sync && this.isAhead()) {
            do {
                this._loggerSync.debug({
                    stats: {
                        pts: this.pts,
                        pts_other: this.syncStream?.pts,
                        frametime,
                    },
                }, `Stream is ahead. Waiting for ${frametime}ms`);
                await setTimeout(frametime);
            } while (this.sync && this.isAhead());
            this.resetTimingCompensation();
            callback(null);
        }
        else {
            this._loggerSleep.debug({
                stats: {
                    pts: this._pts,
                    startPts: this._startPts,
                    time: end_sendFrame,
                    startTime: this._startTime,
                    frametime,
                },
            }, `Sleeping for ${sleep}ms`);
            setTimeout(sleep).then(() => callback(null));
        }
        frame.free();
    }
    _destroy(error, callback) {
        super._destroy(error, callback);
        this.syncStream = undefined;
    }
}
//# sourceMappingURL=BaseMediaStream.js.map