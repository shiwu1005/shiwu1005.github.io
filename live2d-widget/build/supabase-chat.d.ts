import type { SiteAction } from './site-actions.js';
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
interface ChatResult {
    reply: string;
    actions: SiteAction[];
}
declare class ChatNotice extends Error {
}
declare function askChat(config: ChatConfig, message: string, history?: ChatMessage[], context?: Record<string, unknown>): Promise<ChatResult>;
export { askChat, ChatNotice };
export type { ChatConfig, ChatMessage, ChatResult };
