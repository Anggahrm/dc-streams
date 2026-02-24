import { BaseMediaConnection } from "./BaseMediaConnection.js";
export class VoiceConnection extends BaseMediaConnection {
    streamConnection;
    get daveChannelId() {
        return this.channelId;
    }
    get serverId() {
        return this.guildId ?? this.channelId; // for guild vc it is the guild id, for dm voice it is the channel id
    }
    stop() {
        super.stop();
        this.streamConnection?.stop();
    }
}
//# sourceMappingURL=VoiceConnection.js.map