import { shortUrl } from "../utils/media.js";

export function formatResolvePrepareError(error: unknown, sourceUrl: string): string {
    const defaultReply = "**Failed to process source**\nPlease try again in a moment.";
    if (!(error instanceof Error)) return defaultReply;

    const text = error.message.toLowerCase();

    const patterns: Array<{ match: string; lines: string[] }> = [
        {
            match: "file size exceeds maximum",
            lines: [
                "**Stream rejected by resolver**",
                "- Reason: file size exceeds resolver limit",
                "- Try a shorter source or different stream"
            ]
        },
        {
            match: "invalid youtube url",
            lines: [
                "**Invalid YouTube URL for resolver**",
                "- Use standard links like `youtube.com/watch?v=...` or `youtu.be/...`"
            ]
        },
        {
            match: "polling timeout",
            lines: [
                "**Resolver timeout**",
                "- Source processing took too long",
                "- Please retry in a moment"
            ]
        },
        {
            match: "pow challenge required",
            lines: [
                "**Resolver challenge failed**",
                "- Resolver requested a PoW challenge and did not complete",
                "- Please retry shortly"
            ]
        },
        {
            match: "completed but returned unusable file url repeatedly",
            lines: [
                "**Resolver output unusable**",
                "- Resolver marked job as completed but file URL cannot be played",
                "- Please retry with another source"
            ]
        }
    ];

    for (const pattern of patterns) {
        if (text.includes(pattern.match)) {
            return [...pattern.lines, `- Source: ${shortUrl(sourceUrl)}`].join("\n");
        }
    }

    return defaultReply;
}
