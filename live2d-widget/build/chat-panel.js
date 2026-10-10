import { askChat, ChatNotice } from './supabase-chat.js';
import { buildSiteContext, executeActions } from './site-actions.js';
const PANEL_ID = 'live2d-chat-panel';
const STYLE_ID = 'live2d-chat-panel-style';
const LIST_ID = 'live2d-chat-list';
const MAX_MESSAGES = 60;
const MAX_HISTORY = 10;
const TOOL_XML_HINT = /<\s*(?:result|invoke|tool_call|function_calls)\b|<parameter\s+name=|<name>\s*[A-Za-z_]/i;
let sending = false;
const conversation = [];
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
function ensureStyle() {
    if (document.getElementById(STYLE_ID))
        return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
}
function createPanel(chat) {
    ensureStyle();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.hidden = true;
    if (chat.background) {
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
function getList(panel) {
    return panel.querySelector(`#${LIST_ID}`);
}
function appendMessage(panel, kind, text) {
    var _a;
    const list = getList(panel);
    const item = document.createElement('div');
    item.className = `lc-msg lc-msg-${kind}`;
    item.textContent = text;
    list.appendChild(item);
    while (list.childElementCount > MAX_MESSAGES) {
        (_a = list.firstElementChild) === null || _a === void 0 ? void 0 : _a.remove();
    }
    list.scrollTop = list.scrollHeight;
    return item;
}
function remember(question, answer) {
    conversation.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
    if (conversation.length > MAX_HISTORY) {
        conversation.splice(0, conversation.length - MAX_HISTORY);
    }
}
async function send(panel, chat, question) {
    const input = panel.querySelector('.lc-input');
    const button = panel.querySelector('.lc-send');
    appendMessage(panel, 'user', question);
    input.value = '';
    const pending = appendMessage(panel, 'ai', '正在思考…');
    pending.classList.add('lc-typing');
    sending = true;
    input.disabled = true;
    button.disabled = true;
    try {
        const context = await buildSiteContext();
        const { reply, actions } = await askChat(chat, question, conversation.slice(), context);
        const answer = reply && !TOOL_XML_HINT.test(reply) ? reply : '好，我来帮你处理～';
        remember(question, answer);
        pending.classList.remove('lc-typing');
        pending.textContent = answer;
        if (actions.length) {
            const results = await executeActions(actions);
            for (const text of results)
                appendMessage(panel, 'action', text);
        }
    }
    catch (error) {
        pending.classList.remove('lc-typing', 'lc-msg-ai');
        pending.classList.add('lc-msg-error');
        if (error instanceof ChatNotice) {
            pending.textContent = error.message;
            console.warn('[live2d-widget] AI 对话被拒绝：', error.message);
        }
        else {
            pending.textContent = '接口好像出问题了，等会儿再试试吧～';
            console.error('[live2d-widget] AI 对话失败：', error);
        }
    }
    finally {
        sending = false;
        input.disabled = false;
        button.disabled = false;
        getList(panel).scrollTop = getList(panel).scrollHeight;
        input.focus();
    }
}
function toggleChatPanel(chat) {
    var _a, _b;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
        panel = createPanel(chat);
        const input = panel.querySelector('.lc-input');
        const button = panel.querySelector('.lc-send');
        const submit = () => {
            const question = input.value.trim();
            if (!question || sending)
                return;
            void send(panel, chat, question);
        };
        button.addEventListener('click', submit);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                submit();
            }
        });
        (_a = panel.querySelector('.lc-close')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
            panel.hidden = true;
        });
        (_b = panel.querySelector('.lc-clear')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
            conversation.length = 0;
            getList(panel).innerHTML = '';
            appendMessage(panel, 'ai', '好，刚才聊的都忘掉啦，重新开始吧～');
            input.focus();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) {
                panel.hidden = true;
            }
        });
        appendMessage(panel, 'ai', '嗨，我是这里的看板娘～ 有什么想问的都可以跟我说。');
    }
    const wasHidden = panel.hidden;
    panel.hidden = false;
    panel.querySelector('.lc-input').focus();
    if (wasHidden) {
        const list = getList(panel);
        list.scrollTop = list.scrollHeight;
    }
}
export { toggleChatPanel };
