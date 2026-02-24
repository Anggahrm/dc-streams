import type { EncoderSettingsGetter } from "./index.js";
import type { SupportedVideoCodec } from "../../utils.js";
export declare const merge: (encoder: Partial<Record<SupportedVideoCodec, EncoderSettingsGetter>>) => EncoderSettingsGetter;
