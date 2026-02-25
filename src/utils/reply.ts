export async function safeReply(msg: { reply: (content: string) => Promise<unknown> }, content: string): Promise<void> {
    try {
        await msg.reply(content);
    } catch {
    }
}
