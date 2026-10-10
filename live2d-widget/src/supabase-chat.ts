/**
 * @file 看板娘 AI 对话的前端客户端：匿名登录 Supabase、自动续期、调用 Edge Function。
 * 只用 fetch，不引入 supabase-js，避免给看板娘增加依赖和体积。
 * @module supabase-chat
 */

/**
 * 看板娘 AI 对话的配置，写在 dist/autoload.js 的 `initWidget({ chat: ... })` 里。
 */
interface ChatConfig {
  /**
   * Supabase 项目地址，例如 https://xxxx.supabase.co
   * @type {string}
   */
  supabaseUrl: string;
  /**
   * Publishable key：设计上可以公开，权限受 RLS 约束。
   * @type {string}
   */
  supabaseKey: string;
  /**
   * Edge Function 名字，默认 chat。
   * @type {string | undefined}
   */
  functionName?: string;
  /**
   * 聊天面板的背景图地址，例如 '/img/Moondrop/xxx.jpg'。
   * 不填就是纯色面板。
   * @type {string | undefined}
   */
  background?: string;
}

/**
 * 一条对话消息，用来给模型提供上下文。
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/**
 * 服务端明确让用户看到的提示（例如当日额度用完），可以直接展示在气泡里。
 */
class ChatNotice extends Error {}

const SESSION_KEY = 'live2d-chat-session';
/** 提前 60 秒续期，避免刚好在过期边界上失败 */
const EXPIRY_SKEW_MS = 60 * 1000;

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed && parsed.access_token && parsed.refresh_token ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可：下次对话重新匿名登录。
  }
}

function toSession(raw: any): Session {
  return {
    access_token: String(raw.access_token),
    refresh_token: String(raw.refresh_token),
    expires_at: Date.now() + Number(raw.expires_in || 3600) * 1000,
  };
}

async function authRequest(config: ChatConfig, path: string, body: unknown): Promise<any> {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error_code || data?.error || data?.msg || response.status;
    throw new Error(`Supabase Auth 失败：${reason}`);
  }
  return data;
}

async function signInAnonymously(config: ChatConfig): Promise<Session> {
  const data = await authRequest(config, 'signup', {});
  const session = toSession(data);
  writeSession(session);
  return session;
}

async function refreshSession(config: ChatConfig, session: Session): Promise<Session> {
  const data = await authRequest(config, 'token?grant_type=refresh_token', {
    refresh_token: session.refresh_token,
  });
  const next = toSession(data);
  writeSession(next);
  return next;
}

async function getAccessToken(config: ChatConfig, force = false): Promise<string> {
  const stored = readSession();
  if (!force && stored && stored.expires_at - EXPIRY_SKEW_MS > Date.now()) {
    return stored.access_token;
  }
  if (stored) {
    try {
      return (await refreshSession(config, stored)).access_token;
    } catch (error) {
      console.warn('[live2d-widget] 刷新登录状态失败，重新匿名登录', error);
      writeSession(null);
    }
  }
  return (await signInAnonymously(config)).access_token;
}

/**
 * 把一句话发给看板娘 AI，返回回复文本。
 * 失败时抛出异常：`ChatNotice` 表示服务端给了可以直接展示的提示，其余情况按通用错误处理。
 * @param {ChatConfig} config - Supabase 配置
 * @param {string} message - 用户的问题
 * @param {ChatMessage[]} [history] - 之前的对话，用来给模型提供上下文
 * @returns {Promise<string>} 看板娘的回答
 */
async function askChat(
  config: ChatConfig,
  message: string,
  history: ChatMessage[] = [],
): Promise<string> {
  const url = `${config.supabaseUrl}/functions/v1/${config.functionName || 'chat'}`;
  let token = await getAccessToken(config);

  const payload: { message: string; history?: ChatMessage[] } = { message };
  if (history.length) payload.history = history;
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && attempt === 0) {
      // 令牌可能是刚过期的，强制换一张再来一次。
      token = await getAccessToken(config, true);
      continue;
    }
    if (!response.ok) {
      if (typeof data?.reply === 'string' && data.reply) throw new ChatNotice(data.reply);
      throw new Error(`chat function 返回 ${response.status}`);
    }
    if (typeof data?.reply !== 'string' || !data.reply) {
      throw new Error('chat function 返回内容为空');
    }
    return data.reply;
  }
  throw new Error('身份校验失败');
}

export { askChat, ChatNotice };
export type { ChatConfig, ChatMessage };
