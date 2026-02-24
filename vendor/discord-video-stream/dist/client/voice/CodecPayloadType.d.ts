export declare const CodecPayloadType: {
    readonly opus: {
        readonly name: "opus";
        readonly type: "audio";
        readonly clockRate: 48000;
        readonly priority: 1000;
        readonly payload_type: 120;
    };
    readonly H264: {
        readonly name: "H264";
        readonly type: "video";
        readonly clockRate: 90000;
        readonly priority: 1000;
        readonly payload_type: 101;
        readonly rtx_payload_type: 102;
        readonly encode: true;
        readonly decode: true;
    };
    readonly H265: {
        readonly name: "H265";
        readonly type: "video";
        readonly clockRate: 90000;
        readonly priority: 1000;
        readonly payload_type: 103;
        readonly rtx_payload_type: 104;
        readonly encode: true;
        readonly decode: true;
    };
    readonly VP8: {
        readonly name: "VP8";
        readonly type: "video";
        readonly clockRate: 90000;
        readonly priority: 1000;
        readonly payload_type: 105;
        readonly rtx_payload_type: 106;
        readonly encode: true;
        readonly decode: true;
    };
    readonly VP9: {
        readonly name: "VP9";
        readonly type: "video";
        readonly clockRate: 90000;
        readonly priority: 1000;
        readonly payload_type: 107;
        readonly rtx_payload_type: 108;
        readonly encode: true;
        readonly decode: true;
    };
    readonly AV1: {
        readonly name: "AV1";
        readonly type: "video";
        readonly clockRate: 90000;
        readonly priority: 1000;
        readonly payload_type: 109;
        readonly rtx_payload_type: 110;
        readonly encode: true;
        readonly decode: true;
    };
};
