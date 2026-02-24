import ffmpeg from "fluent-ffmpeg";
import { PassThrough, type Readable } from "node:stream";
import type { SupportedVideoCodec } from "../utils.js";
import type { Streamer } from "../client/index.js";
import type { EncoderSettingsGetter } from "./encoders/index.js";
import type { VideoStreamInfo } from "./LibavDemuxer.js";
export type PrepareStreamOptions = {
    /**
     * Disable video transcoding
     * If enabled, all video related settings have no effects, and the input
     * video stream is used as-is.
     *
     * You need to ensure that the video stream has the right properties
     * (keyframe every 1s, B-frames disabled). Failure to do so will result in
     * a glitchy stream, or degraded performance
     */
    noTranscoding: boolean;
    /**
     * Video width
     */
    width: number;
    /**
     * Video height
     */
    height: number;
    /**
     * Video frame rate
     */
    frameRate?: number;
    /**
     * Video codec
     */
    videoCodec: SupportedVideoCodec;
    /**
     * Video average bitrate in kbps
     */
    bitrateVideo: number;
    /**
     * Video max bitrate in kbps
     */
    bitrateVideoMax: number;
    /**
     * Audio bitrate in kbps
     */
    bitrateAudio: number;
    /**
     * Enable audio output
     */
    includeAudio: boolean;
    /**
     * Functions to get encoder settings
     * This function will receive the average and max bitrate as the input, and
     * returns an object containing encoder settings for the supported codecs
     */
    encoder: EncoderSettingsGetter;
    /**
     * Enable hardware accelerated decoding
     */
    hardwareAcceleratedDecoding: boolean;
    /**
     * Add some options to minimize latency
     */
    minimizeLatency: boolean;
    /**
     * Custom headers for HTTP requests
     */
    customHeaders: Record<string, string>;
    /**
     * Custom input options to pass directly to ffmpeg
     * These will be added to the command before other options
     */
    customInputOptions: string[];
    /**
     * Custom ffmpeg flags/options to pass directly to ffmpeg
     * These will be added to the command after other options
     */
    customFfmpegFlags: string[];
};
export type Controller = {
    volume: number;
    setVolume(newVolume: number): Promise<boolean>;
};
export declare function prepareStream(input: string | Readable, options?: Partial<PrepareStreamOptions>, cancelSignal?: AbortSignal): {
    command: ffmpeg.FfmpegCommand;
    output: PassThrough;
    promise: Promise<void>;
    controller: {
        readonly volume: number;
        setVolume(newVolume: number): Promise<boolean>;
    };
};
export type PlayStreamOptions = {
    /**
     * Set stream type as "Go Live" or camera stream
     */
    type: "go-live" | "camera";
    /**
     * Set format of the stream
     */
    format: "matroska" | "nut";
    /**
     * Override video width sent to Discord.
     *
     * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
     */
    width: number | ((v: VideoStreamInfo) => number);
    /**
     * Override video height sent to Discord.
     *
     * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
     */
    height: number | ((v: VideoStreamInfo) => number);
    /**
     * Override video frame rate sent to Discord.
     *
     * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
     */
    frameRate: number | ((v: VideoStreamInfo) => number);
    /**
     * Same as ffmpeg's `readrate_initial_burst` command line flag
     *
     * See https://ffmpeg.org/ffmpeg.html#:~:text=%2Dreadrate_initial_burst
     */
    readrateInitialBurst: number | undefined;
    /**
     * Enable stream preview from input stream (experimental)
     */
    streamPreview: boolean;
};
export declare function playStream(input: Readable, streamer: Streamer, options?: Partial<PlayStreamOptions>, cancelSignal?: AbortSignal): Promise<void>;
