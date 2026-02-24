import type { EncoderSettingsGetter } from "./index.js";
type VaapiSettings = {
    device?: string;
};
export declare function vaapi({ device, }?: Partial<VaapiSettings>): EncoderSettingsGetter;
export {};
