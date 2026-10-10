interface ChatConfig {
    supabaseUrl: string;
    supabaseKey: string;
    functionName?: string;
    background?: string;
}
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}
declare class ChatNotice extends Error {
}
declare function askChat(config: ChatConfig, message: string, history?: ChatMessage[]): Promise<string>;
export { askChat, ChatNotice };
export type { ChatConfig, ChatMessage };
