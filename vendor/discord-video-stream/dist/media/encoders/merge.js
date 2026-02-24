export const merge = (encoder) => {
    return ((bitrate, bitrateMax) => ({
        H264: encoder.H264?.(bitrate, bitrateMax),
        H265: encoder.H265?.(bitrate, bitrateMax),
        VP8: encoder.VP8?.(bitrate, bitrateMax),
        VP9: encoder.VP9?.(bitrate, bitrateMax),
        AV1: encoder.AV1?.(bitrate, bitrateMax),
    }));
};
//# sourceMappingURL=merge.js.map