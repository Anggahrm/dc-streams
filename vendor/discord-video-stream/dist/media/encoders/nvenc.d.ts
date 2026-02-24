import type { EncoderSettingsGetter } from "./index.js";
type NvencPreset = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7";
type NvencSettings = {
    preset: NvencPreset;
    spatialAq: boolean;
    temporalAq: boolean;
    gpu: number;
};
export declare function nvenc({ preset, spatialAq, temporalAq, gpu, }?: Partial<NvencSettings>): EncoderSettingsGetter;
export {};
