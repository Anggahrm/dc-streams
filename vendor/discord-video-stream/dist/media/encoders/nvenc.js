export function nvenc({ preset = "p4", spatialAq = false, temporalAq = false, gpu, } = {}) {
    const options = [
        `-preset ${preset}`,
        `-spatial-aq ${spatialAq}`,
        `-temporal-aq ${temporalAq}`,
        ...(gpu !== undefined ? [`-gpu ${gpu}`] : []),
    ];
    return (() => ({
        H264: {
            name: "h264_nvenc",
            options,
        },
        H265: {
            name: "hevc_nvenc",
            options,
        },
        AV1: {
            name: "av1_nvenc",
            options,
        },
    }));
}
//# sourceMappingURL=nvenc.js.map