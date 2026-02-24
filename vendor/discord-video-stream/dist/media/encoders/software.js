export const software = ({ x264, x265, } = {}) => {
    const { preset: x264Preset = "superfast", tune: x264Tune = "film" } = x264 ?? {};
    const { preset: x265Preset = "superfast", tune: x265Tune } = x265 ?? {};
    return (() => ({
        H264: {
            name: "libx264",
            options: ["-forced-idr 1", `-tune ${x264Tune}`, `-preset ${x264Preset}`],
        },
        H265: {
            name: "libx265",
            options: [
                "-forced-idr 1",
                ...(x265Tune ? [`-tune ${x265Tune}`] : []),
                `-preset ${x265Preset}`,
            ],
        },
        VP8: {
            name: "libvpx",
            options: ["-deadline 20000"],
        },
        VP9: {
            name: "libvpx-vp9",
            options: ["-deadline 20000"],
        },
        AV1: {
            name: "libsvtav1",
            options: [],
        },
    }));
};
//# sourceMappingURL=software.js.map