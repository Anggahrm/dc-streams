import { type Stream } from "node-av";
import { AVCodecID } from "./LibavCodecId.js";
import type { CodecParameters } from "node-av";
import type { Readable } from "node:stream";
type MediaStreamInfoCommon = {
    index: number;
    codec: AVCodecID;
    codecpar: CodecParameters;
    avStream: Stream;
};
export type VideoStreamInfo = MediaStreamInfoCommon & {
    width: number;
    height: number;
    framerate_num: number;
    framerate_den: number;
};
export type AudioStreamInfo = MediaStreamInfoCommon & {
    sample_rate: number;
};
type DemuxerOptions = {
    format: "matroska" | "nut";
};
export declare function demux(input: Readable, { format }: DemuxerOptions): Promise<{
    video: {
        stream: Readable;
        index: number;
        codec: AVCodecID;
        codecpar: CodecParameters;
        avStream: Stream;
        width: number;
        height: number;
        framerate_num: number;
        framerate_den: number;
    } | undefined;
    audio: {
        stream: Readable;
        index: number;
        codec: AVCodecID;
        codecpar: CodecParameters;
        avStream: Stream;
        sample_rate: number;
    } | undefined;
}>;
export {};
