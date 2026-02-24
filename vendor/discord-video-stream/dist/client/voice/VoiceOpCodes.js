export var VoiceOpCodes;
(function (VoiceOpCodes) {
    VoiceOpCodes[VoiceOpCodes["IDENTIFY"] = 0] = "IDENTIFY";
    VoiceOpCodes[VoiceOpCodes["SELECT_PROTOCOL"] = 1] = "SELECT_PROTOCOL";
    VoiceOpCodes[VoiceOpCodes["READY"] = 2] = "READY";
    VoiceOpCodes[VoiceOpCodes["HEARTBEAT"] = 3] = "HEARTBEAT";
    VoiceOpCodes[VoiceOpCodes["SELECT_PROTOCOL_ACK"] = 4] = "SELECT_PROTOCOL_ACK";
    VoiceOpCodes[VoiceOpCodes["SPEAKING"] = 5] = "SPEAKING";
    VoiceOpCodes[VoiceOpCodes["HEARTBEAT_ACK"] = 6] = "HEARTBEAT_ACK";
    VoiceOpCodes[VoiceOpCodes["RESUME"] = 7] = "RESUME";
    VoiceOpCodes[VoiceOpCodes["HELLO"] = 8] = "HELLO";
    VoiceOpCodes[VoiceOpCodes["RESUMED"] = 9] = "RESUMED";
    VoiceOpCodes[VoiceOpCodes["CLIENTS_CONNECT"] = 11] = "CLIENTS_CONNECT";
    VoiceOpCodes[VoiceOpCodes["VIDEO"] = 12] = "VIDEO";
    VoiceOpCodes[VoiceOpCodes["CLIENT_DISCONNECT"] = 13] = "CLIENT_DISCONNECT";
    VoiceOpCodes[VoiceOpCodes["SESSION_UPDATE"] = 14] = "SESSION_UPDATE";
    VoiceOpCodes[VoiceOpCodes["MEDIA_SINK_WANTS"] = 15] = "MEDIA_SINK_WANTS";
    VoiceOpCodes[VoiceOpCodes["VOICE_BACKEND_VERSION"] = 16] = "VOICE_BACKEND_VERSION";
    VoiceOpCodes[VoiceOpCodes["CHANNEL_OPTIONS_UPDATE"] = 17] = "CHANNEL_OPTIONS_UPDATE";
    VoiceOpCodes[VoiceOpCodes["FLAGS"] = 18] = "FLAGS";
    VoiceOpCodes[VoiceOpCodes["SPEED_TEST"] = 19] = "SPEED_TEST";
    VoiceOpCodes[VoiceOpCodes["PLATFORM"] = 20] = "PLATFORM";
    VoiceOpCodes[VoiceOpCodes["DAVE_PREPARE_TRANSITION"] = 21] = "DAVE_PREPARE_TRANSITION";
    VoiceOpCodes[VoiceOpCodes["DAVE_EXECUTE_TRANSITION"] = 22] = "DAVE_EXECUTE_TRANSITION";
    VoiceOpCodes[VoiceOpCodes["DAVE_TRANSITION_READY"] = 23] = "DAVE_TRANSITION_READY";
    VoiceOpCodes[VoiceOpCodes["DAVE_PREPARE_EPOCH"] = 24] = "DAVE_PREPARE_EPOCH";
    VoiceOpCodes[VoiceOpCodes["MLS_INVALID_COMMIT_WELCOME"] = 31] = "MLS_INVALID_COMMIT_WELCOME";
})(VoiceOpCodes || (VoiceOpCodes = {}));
export var VoiceOpCodesBinary;
(function (VoiceOpCodesBinary) {
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_EXTERNAL_SENDER"] = 25] = "MLS_EXTERNAL_SENDER";
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_KEY_PACKAGE"] = 26] = "MLS_KEY_PACKAGE";
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_PROPOSALS"] = 27] = "MLS_PROPOSALS";
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_COMMIT_WELCOME"] = 28] = "MLS_COMMIT_WELCOME";
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_ANNOUNCE_COMMIT_TRANSITION"] = 29] = "MLS_ANNOUNCE_COMMIT_TRANSITION";
    VoiceOpCodesBinary[VoiceOpCodesBinary["MLS_WELCOME"] = 30] = "MLS_WELCOME";
})(VoiceOpCodesBinary || (VoiceOpCodesBinary = {}));
//# sourceMappingURL=VoiceOpCodes.js.map