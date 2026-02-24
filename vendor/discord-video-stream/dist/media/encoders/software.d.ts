import type { EncoderSettingsGetter } from "./index.js";
type DeepPartial<T> = T extends unknown[] ? T : {
    [P in keyof T]?: DeepPartial<T[P]>;
};
type x26xPreset = "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow" | "placebo";
export type SoftwareEncoderSettings = {
    x264: {
        preset: x26xPreset;
        tune: "film" | "animation" | "grain" | "stillimage" | "fastdecode" | "zerolatency" | "psnr" | "ssim";
    };
    x265: {
        preset: x26xPreset;
        tune: "psnr" | "ssim" | "grain" | "fastdecode" | "zerolatency" | "animation";
    };
};
export declare const software: ({ x264, x265, }?: DeepPartial<SoftwareEncoderSettings>) => EncoderSettingsGetter;
export {};
