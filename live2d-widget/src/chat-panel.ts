/**
 * @file 看板娘 AI 对话的独立聊天面板（Ash 小屋）。
 *
 * 为什么单独做一个面板：原来 AI 回复是用看板娘的气泡（#waifu-tips）显示的，
 * 而气泡和 Live2D 模型在同一层里，长回复会被模型的帽子/身体压住。
 * 这里用一个独立的浮层（z-index 远高于 #waifu），放在左下角，
 * 与右下角的看板娘互不遮挡。
 *
 * 面板背景图来自 config.chat.background（在 dist/autoload.js 里配置），
 * 上面盖一层半透明遮罩保证文字可读，做法和 custom.css 里旧的 #ai-input-box 一致。
 *
 * @module chat-panel
 */

import { askChat, ChatNotice } from './supabase-chat.js';
import { buildSiteContext, executeActions } from './site-actions.js';
import type { ChatConfig, ChatMessage } from './supabase-chat.js';

const PANEL_ID = 'live2d-chat-panel';
const STYLE_ID = 'live2d-chat-panel-style';
const LIST_ID = 'live2d-chat-list';
/** 面板里最多保留多少条消息，防止聊久了 DOM 无限增长 */
const MAX_MESSAGES = 60;
/** 带给模型的最多历史消息条数（一问一答算两条，所以取偶数） */
const MAX_HISTORY = 10;
/**
 * 模型偶尔会把工具调用写成 <invoke>/<name>/<parameter> 标签文本。
 * 这种内容既不该显示给访客，更不能进历史 —— 一旦进去，它后面会一直模仿。
 * （函数端也会识别并清洗，这里是第二道保险。）
 */
const TOOL_XML_HINT =
  /<\s*(?:result|invoke|tool_call|function_calls)\b|<parameter\s+name=|<name>\s*[A-Za-z_]/i;

let sending = false;
/** 当前会话的上下文，点"清空"会重置 */
const conversation: ChatMessage[] = [];

const PANEL_CSS = `
#${PANEL_ID} {
  background-color: #fff;
  background-image: var(--lc-bg, none);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  border: 1px solid rgba(0, 0, 0, .06);
  border-radius: 14px;
  bottom: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
  color: #333;
  display: flex;
  flex-direction: column;
  font-size: 14px;
  left: 24px;
  line-height: 1.6;
  max-height: min(560px, 72vh);
  overflow: hidden;
  position: fixed;
  width: min(380px, calc(100vw - 48px));
  z-index: 99990;
}
#${PANEL_ID}[hidden] { display: none; }
/* 背景图上盖一层遮罩，保证任何图都能看清文字 */
#${PANEL_ID}::before {
  background: rgba(255, 255, 255, .78);
  content: '';
  inset: 0;
  position: absolute;
  z-index: 0;
}
#${PANEL_ID} > * { position: relative; z-index: 1; }
#${PANEL_ID} .lc-header {
  align-items: center;
  background: linear-gradient(135deg, rgba(73, 177, 245, .95), rgba(58, 158, 224, .95));
  color: #fff;
  display: flex;
  font-weight: 600;
  gap: 6px;
  padding: 10px 12px;
}
#${PANEL_ID} .lc-title { flex: 1; }
#${PANEL_ID} .lc-btn {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 5px 7px;
}
#${PANEL_ID} .lc-btn:hover { background: rgba(255, 255, 255, .22); }
#${PANEL_ID} .lc-list {
  background: transparent;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
  overflow-y: auto;
  padding: 12px;
}
#${PANEL_ID} .lc-msg {
  border-radius: 12px;
  max-width: 82%;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
#${PANEL_ID} .lc-msg-user {
  align-self: flex-end;
  background: rgba(73, 177, 245, .95);
  border-bottom-right-radius: 4px;
  color: #fff;
}
#${PANEL_ID} .lc-msg-ai {
  align-self: flex-start;
  background: rgba(255, 255, 255, .92);
  border: 1px solid #e6ebf2;
  border-bottom-left-radius: 4px;
}
#${PANEL_ID} .lc-msg-error {
  align-self: flex-start;
  background: rgba(255, 242, 240, .94);
  border: 1px solid #ffccc7;
  border-bottom-left-radius: 4px;
  color: #cf1322;
}
#${PANEL_ID} .lc-msg-action {
  align-self: flex-start;
  background: rgba(73, 177, 245, .12);
  border: 1px dashed rgba(73, 177, 245, .55);
  color: #2f6f9f;
  font-size: 13px;
  max-width: 92%;
  padding: 6px 10px;
}
#${PANEL_ID} .lc-typing { animation: lc-pulse 1.2s ease-in-out infinite; color: #8a94a6; }
@keyframes lc-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
#${PANEL_ID} .lc-footer {
  backdrop-filter: blur(3px);
  background: rgba(255, 255, 255, .86);
  border-top: 1px solid #eef1f5;
  display: flex;
  gap: 8px;
  padding: 10px;
}
#${PANEL_ID} .lc-input {
  background: rgba(255, 255, 255, .9);
  border: 1px solid #dfe4ea;
  border-radius: 10px;
  flex: 1;
  font-family: inherit;
  font-size: 14px;
  min-width: 0;
  outline: none;
  padding: 9px 12px;
}
#${PANEL_ID} .lc-input:focus { border-color: #49b1f5; }
#${PANEL_ID} .lc-send {
  background: #49b1f5;
  border: 0;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 0 16px;
}
#${PANEL_ID} .lc-send:disabled { cursor: not-allowed; opacity: .5; }

[data-theme="dark"] #${PANEL_ID} { background-color: #23272e; border-color: #333; color: #e6e6e6; }
[data-theme="dark"] #${PANEL_ID}::before { background: rgba(20, 22, 26, .78); }
[data-theme="dark"] #${PANEL_ID} .lc-msg-ai { background: rgba(43, 48, 56, .92); border-color: #3a4048; }
[data-theme="dark"] #${PANEL_ID} .lc-msg-error { background: rgba(58, 35, 38, .94); border-color: #5c2b30; color: #ff9c9c; }
[data-theme="dark"] #${PANEL_ID} .lc-msg-action { background: rgba(73, 177, 245, .16); border-color: rgba(73, 177, 245, .45); color: #9fd0f5; }
[data-theme="dark"] #${PANEL_ID} .lc-footer { background: rgba(35, 39, 46, .86); border-color: #333; }
[data-theme="dark"] #${PANEL_ID} .lc-input { background: rgba(27, 30, 35, .92); border-color: #3a4048; color: #e6e6e6; }

@media screen and (max-width: 768px) {
  #${PANEL_ID} {
    bottom: 8px;
    left: 8px;
    max-height: 60vh;
    right: 8px;
    width: auto;
  }
  #${PANEL_ID} .lc-msg { max-width: 88%; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

function createPanel(chat: ChatConfig): HTMLElement {
  ensureStyle();
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.hidden = true;
  if (chat.background) {
    // 用 CSS 变量传图片地址，这样带空格/特殊字符的路径也不用转义
    panel.style.setProperty('--lc-bg', `url('${chat.background}')`);
  }
  panel.innerHTML = `
    <div class="lc-header">
      <span class="lc-title">Ash 小屋</span>
      <button class="lc-btn lc-clear" type="button" title="清空对话">清空</button>
      <button class="lc-btn lc-close" type="button" title="关闭">✕</button>
    </div>
    <div class="lc-list" id="${LIST_ID}"></div>
    <div class="lc-footer">
      <input class="lc-input" type="text" maxlength="300" placeholder="问我点什么吧…" />
      <button class="lc-send" type="button">发送</button>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function getList(panel: HTMLElement): HTMLElement {
  return panel.querySelector(`#${LIST_ID}`) as HTMLElement;
}

function appendMessage(
  panel: HTMLElement,
  kind: 'user' | 'ai' | 'error' | 'action',
  text: string,
): HTMLElement {
  const list = getList(panel);
  const item = document.createElement('div');
  item.className = `lc-msg lc-msg-${kind}`;
  item.textContent = text;
  list.appendChild(item);
  while (list.childElementCount > MAX_MESSAGES) {
    list.firstElementChild?.remove();
  }
  list.scrollTop = list.scrollHeight;
  return item;
}

/** 记下这一轮问答，作为下一轮的上下文；只保留最近 MAX_HISTORY 条 */
function remember(question: string, answer: string): void {
  conversation.push(
    { role: 'user', content: question },
    { role: 'assistant', content: answer },
  );
  if (conversation.length > MAX_HISTORY) {
    conversation.splice(0, conversation.length - MAX_HISTORY);
  }
}

async function send(panel: HTMLElement, chat: ChatConfig, question: string): Promise<void> {
  const input = panel.querySelector('.lc-input') as HTMLInputElement;
  const button = panel.querySelector('.lc-send') as HTMLButtonElement;

  appendMessage(panel, 'user', question);
  input.value = '';
  const pending = appendMessage(panel, 'ai', '正在思考…');
  pending.classList.add('lc-typing');

  sending = true;
  input.disabled = true;
  button.disabled = true;

  try {
    // 把之前几轮 + 站点信息（当前页面/文章/歌单）一起发过去，
    // 模型据此决定要不要调用工具（放歌、打开文章……）。
    const context = await buildSiteContext();
    const { reply, actions } = await askChat(chat, question, conversation.slice(), context);
    // 假工具调用文本不显示、也不写进历史
    const answer = reply && !TOOL_XML_HINT.test(reply) ? reply : '好，我来帮你处理～';
    remember(question, answer);
    pending.classList.remove('lc-typing');
    pending.textContent = answer;

    if (actions.length) {
      // 真正动手的是浏览器：切歌、跳转都由这里执行
      const results = await executeActions(actions);
      for (const text of results) appendMessage(panel, 'action', text);
    }
  } catch (error) {
    pending.classList.remove('lc-typing', 'lc-msg-ai');
    pending.classList.add('lc-msg-error');
    // ChatNotice 是服务端给的、可以直接展示的提示（例如额度用完），属于预期情况，
    // 只记 warn；其它异常才是真的出错。
    if (error instanceof ChatNotice) {
      pending.textContent = error.message;
      console.warn('[live2d-widget] AI 对话被拒绝：', error.message);
    } else {
      pending.textContent = '接口好像出问题了，等会儿再试试吧～';
      console.error('[live2d-widget] AI 对话失败：', error);
    }
  } finally {
    sending = false;
    input.disabled = false;
    button.disabled = false;
    getList(panel).scrollTop = getList(panel).scrollHeight;
    input.focus();
  }
}

/**
 * Open the "Ash 小屋" AI chat panel (focus it if it is already open).
 * @param {ChatConfig} chat - Supabase configuration from the widget config.
 */
function toggleChatPanel(chat: ChatConfig): void {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = createPanel(chat);
    const input = panel.querySelector('.lc-input') as HTMLInputElement;
    const button = panel.querySelector('.lc-send') as HTMLButtonElement;

    const submit = () => {
      const question = input.value.trim();
      if (!question || sending) return;
      void send(panel as HTMLElement, chat, question);
    };

    button.addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });
    panel.querySelector('.lc-close')?.addEventListener('click', () => {
      (panel as HTMLElement).hidden = true;
    });
    panel.querySelector('.lc-clear')?.addEventListener('click', () => {
      conversation.length = 0;
      getList(panel as HTMLElement).innerHTML = '';
      appendMessage(panel as HTMLElement, 'ai', '好，刚才聊的都忘掉啦，重新开始吧～');
      input.focus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !(panel as HTMLElement).hidden) {
        (panel as HTMLElement).hidden = true;
      }
    });

    appendMessage(panel, 'ai', '嗨，我是这里的看板娘～ 有什么想问的都可以跟我说。');
  }

  const wasHidden = panel.hidden;
  panel.hidden = false;
  (panel.querySelector('.lc-input') as HTMLInputElement).focus();
  if (wasHidden) {
    const list = getList(panel);
    list.scrollTop = list.scrollHeight;
  }
}

export { toggleChatPanel };
