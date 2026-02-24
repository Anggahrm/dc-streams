import type { SupportedVideoCodec } from "../../utils.js";
export type EncoderSettings = {
    name: string;
    options: string[];
    globalOptions?: string[];
    outFilters?: string[];
};
export type EncoderSettingsGetter = (bitrate: number, bitrateMax: number) => Partial<Record<SupportedVideoCodec, EncoderSettings>>;
import { nvenc } from "./nvenc.js";
import { vaapi } from "./vaapi.js";
declare const Encoders: {
    software: ({ x264, x265, }?: {
        x264?: {
            preset?: ("ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow" | "placebo") | undefined;
            tune?: "film" | "animation" | "grain" | "stillimage" | "fastdecode" | "zerolatency" | "psnr" | "ssim" | undefined;
        } | undefined;
        x265?: {
            preset?: ("ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow" | "placebo") | undefined;
            tune?: "animation" | "grain" | "fastdecode" | "zerolatency" | "psnr" | "ssim" | undefined;
        } | undefined;
    }) => EncoderSettingsGetter;
    nvenc: typeof nvenc;
    vaapi: typeof vaapi;
    merge: (encoder: Partial<Record<SupportedVideoCodec, EncoderSettingsGetter>>) => EncoderSettingsGetter;
};
export { Encoders };
