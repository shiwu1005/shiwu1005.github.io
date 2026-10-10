/**
 * @file Contains the configuration and functions for waifu tools.
 * @module tools
 */

import {
  fa_comment,
  fa_paper_plane,
  fa_street_view,
  fa_shirt,
  fa_camera_retro,
  fa_info_circle,
  fa_xmark
} from './icons.js';
import { showMessage, i18n } from './message.js';
import { askChat, ChatNotice } from './supabase-chat.js';
import type { Config, ModelManager } from './model.js';
import type { Tips } from './widget.js';

const WAIFU_DISABLED_KEY = 'waifu-disabled';

interface Tools {
  /**
   * Key-value pairs of tools, where the key is the tool name.
   * @type {string}
   */
  [key: string]: {
    /**
     * Icon of the tool, usually an SVG string.
     * @type {string}
     */
    icon: string;
    /**
     * Callback function for the tool.
     * @type {() => void}
     */
    callback: (message: any) => void;
  };
}

/**
 * Ask the board-lady AI a question through the Supabase Edge Function.
 * @param {Config} config - Widget configuration; needs `chat` to be configured.
 */
async function askAI(config: Config) {
  const chat = config.chat;
  if (!chat || !chat.supabaseUrl || !chat.supabaseKey) {
    showMessage('AI 还没配置好呢～', 5000, 9);
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'ai-input-overlay';
  overlay.innerHTML = `
    <div id="ai-input-box">
      <div class="ai-input-title">你想问我什么呢？</div>
      <input type="text" id="ai-input-field" placeholder="输入你的问题..." />
      <div class="ai-input-actions">
        <button id="ai-input-cancel">取消</button>
        <button id="ai-input-confirm">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('ai-input-field') as HTMLInputElement;
  input.focus();

  const close = () => overlay.remove();

  document.getElementById('ai-input-cancel')!.onclick = close;

  const send = async () => {
    const question = input.value.trim();
    if (!question) return;
    close();

    showMessage('让我想想……', 3000, 9);

    try {
      const answer = await askChat(chat, question);
      showMessage(answer, 10000, 9);
    } catch (err) {
      console.error('[live2d-widget] AI 对话失败：', err);
      showMessage(
        err instanceof ChatNotice ? err.message : '接口好像出问题了，等会儿再试试吧～',
        5000,
        9,
      );
    }
  };

  document.getElementById('ai-input-confirm')!.onclick = send;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
}

/**
 * Waifu tools manager.
 */
class ToolsManager {
  tools: Tools;
  config: Config;

  constructor(model: ModelManager, config: Config, tips: Tips) {
    this.config = config;
    this.tools = {
      hitokoto: {
        icon: fa_comment,
        callback: async () => {
          // Add hitokoto.cn API
          const response = await fetch('https://v1.hitokoto.cn');
          const result = await response.json();
          const template = tips.message.hitokoto;
          const text = i18n(template, result.from, result.creator);
          showMessage(result.hitokoto, 6000, 9);
          setTimeout(() => {
            showMessage(text, 4000, 9);
          }, 6000);
        }
      },
      asteroids: {
        icon: fa_paper_plane,
        callback: () => {
          if (window.Asteroids) {
            if (!window.ASTEROIDSPLAYERS) window.ASTEROIDSPLAYERS = [];
            window.ASTEROIDSPLAYERS.push(new window.Asteroids());
          } else {
            const script = document.createElement('script');
            script.src =
              'https://fastly.jsdelivr.net/gh/stevenjoezhang/asteroids/asteroids.js';
            document.head.appendChild(script);
          }
        }
      },
      'ask-ai': {
        icon: fa_comment,
        callback: () => askAI(this.config)
      },
      'switch-model': {
        icon: fa_street_view,
        callback: () => model.loadNextModel()
      },
      'switch-texture': {
        icon: fa_shirt,
        callback: () => {
          let successMessage = '', failMessage = '';
          if (tips) {
            successMessage = tips.message.changeSuccess;
            failMessage = tips.message.changeFail;
          }
          model.loadRandTexture(successMessage, failMessage);
        }
      },
      photo: {
        icon: fa_camera_retro,
        callback: () => {
          const message = tips.message.photo;
          showMessage(message, 6000, 9);
          const canvas = document.getElementById('live2d') as HTMLCanvasElement;
          if (!canvas) return;
          const imageUrl = canvas.toDataURL();

          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = imageUrl;
          link.download = 'live2d-photo.png';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      },
      info: {
        icon: fa_info_circle,
        callback: () => {
          open('https://github.com/stevenjoezhang/live2d-widget');
        }
      },
      quit: {
        icon: fa_xmark,
        callback: () => {
          const showToggleAfterQuit = this.config.showToggleAfterQuit ?? true;
          if (showToggleAfterQuit) {
            localStorage.setItem('waifu-display', Date.now().toString());
          } else {
            localStorage.setItem(WAIFU_DISABLED_KEY, 'true');
            localStorage.removeItem('waifu-display');
          }
          const message = tips.message.goodbye;
          showMessage(message, 2000, 11);
          const waifu = document.getElementById('waifu');
          if (!waifu) return;
          waifu.classList.remove('waifu-active');
          setTimeout(() => {
            waifu.classList.add('waifu-hidden');
            if (showToggleAfterQuit) {
              const waifuToggle = document.getElementById('waifu-toggle');
              waifuToggle?.classList.add('waifu-toggle-active');
            } else {
              document.getElementById('waifu-toggle')?.remove();
            }
          }, 3000);
        }
      }
    };
  }

  registerTools() {
    if (!Array.isArray(this.config.tools)) {
      this.config.tools = Object.keys(this.tools);
    }
    for (const toolName of this.config.tools) {
      // 没配置 chat 就不显示 AI 按钮，免得点开只能看到报错
      if (toolName === 'ask-ai' && !this.config.chat?.supabaseUrl) continue;
      if (this.tools[toolName]) {
        const { icon, callback } = this.tools[toolName];
        const element = document.createElement('span');
        element.id = `waifu-tool-${toolName}`;
        element.innerHTML = icon;
        document
          .getElementById('waifu-tool')
          ?.insertAdjacentElement(
            'beforeend',
            element,
          );
        element.addEventListener('click', callback);
      }
    }
  }
}

export { ToolsManager, Tools };
