interface ChatConfig {
    supabaseUrl: string;
    supabaseKey: string;
    functionName?: string;
}
declare class ChatNotice extends Error {
}
declare function askChat(config: ChatConfig, message: string): Promise<string>;
export { askChat, ChatNotice };
export type { ChatConfig };
