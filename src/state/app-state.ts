import type { Message } from "discord.js-selfbot-v13";
import type {
    ActivePlayback,
    PendingRestart,
    ProfileName,
    QueueItem,
    StreamOptions
} from "../types.js";

export class AppState {
    activeProfile: ProfileName;
    activeStreamOpts: StreamOptions;
    activePlayback: ActivePlayback | undefined;
    queue: QueueItem[] = [];
    loopEnabled = false;
    latestMessageContext: Message | undefined;
    playbackSerial = 0;
    pendingRestart: PendingRestart | undefined;
    startingPlayback = false;

    constructor(args: {
        profile: ProfileName;
        streamOpts: StreamOptions;
    }) {
        this.activeProfile = args.profile;
        this.activeStreamOpts = args.streamOpts;
    }
}
