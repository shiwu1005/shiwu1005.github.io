import { fa_comment, fa_paper_plane, fa_street_view, fa_shirt, fa_camera_retro, fa_info_circle, fa_xmark } from './icons.js';
import { showMessage, i18n } from './message.js';
const WAIFU_DISABLED_KEY = 'waifu-disabled';
function getUserId() {
    let id = localStorage.getItem('live2d-user-id');
    if (!id) {
        id = 'user_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('live2d-user-id', id);
    }
    return id;
}
function askAI() {
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
    const input = document.getElementById('ai-input-field');
    input.focus();
    const close = () => overlay.remove();
    document.getElementById('ai-input-cancel').onclick = close;
    const send = () => {
        const question = input.value.trim();
        if (!question)
            return;
        close();
        showMessage('让我想想……', 3000, 9);
        fetch('http://localhost:8080/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': getUserId()
            },
            body: JSON.stringify({ message: question })
        })
            .then(res => res.json())
            .then(data => {
            showMessage(data.reply || '我暂时不知道怎么回答……', 8000, 9);
        })
            .catch(err => {
            console.error(err);
            showMessage('接口好像出问题了，等会儿再试试吧～', 4000, 9);
        });
    };
    document.getElementById('ai-input-confirm').onclick = send;
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')
            send();
    });
}
class ToolsManager {
    constructor(model, config, tips) {
        this.config = config;
        this.tools = {
            hitokoto: {
                icon: fa_comment,
                callback: async () => {
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
                        if (!window.ASTEROIDSPLAYERS)
                            window.ASTEROIDSPLAYERS = [];
                        window.ASTEROIDSPLAYERS.push(new window.Asteroids());
                    }
                    else {
                        const script = document.createElement('script');
                        script.src =
                            'https://fastly.jsdelivr.net/gh/stevenjoezhang/asteroids/asteroids.js';
                        document.head.appendChild(script);
                    }
                }
            },
            "ask-ai": {
                icon: fa_comment,
                callback: askAI
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
                    const canvas = document.getElementById('live2d');
                    if (!canvas)
                        return;
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
                    var _a;
                    const showToggleAfterQuit = (_a = this.config.showToggleAfterQuit) !== null && _a !== void 0 ? _a : true;
                    if (showToggleAfterQuit) {
                        localStorage.setItem('waifu-display', Date.now().toString());
                    }
                    else {
                        localStorage.setItem(WAIFU_DISABLED_KEY, 'true');
                        localStorage.removeItem('waifu-display');
                    }
                    const message = tips.message.goodbye;
                    showMessage(message, 2000, 11);
                    const waifu = document.getElementById('waifu');
                    if (!waifu)
                        return;
                    waifu.classList.remove('waifu-active');
                    setTimeout(() => {
                        var _a;
                        waifu.classList.add('waifu-hidden');
                        if (showToggleAfterQuit) {
                            const waifuToggle = document.getElementById('waifu-toggle');
                            waifuToggle === null || waifuToggle === void 0 ? void 0 : waifuToggle.classList.add('waifu-toggle-active');
                        }
                        else {
                            (_a = document.getElementById('waifu-toggle')) === null || _a === void 0 ? void 0 : _a.remove();
                        }
                    }, 3000);
                }
            }
        };
    }
    registerTools() {
        var _a;
        if (!Array.isArray(this.config.tools)) {
            this.config.tools = Object.keys(this.tools);
        }
        for (const toolName of this.config.tools) {
            if (this.tools[toolName]) {
                const { icon, callback } = this.tools[toolName];
                const element = document.createElement('span');
                element.id = `waifu-tool-${toolName}`;
                element.innerHTML = icon;
                (_a = document
                    .getElementById('waifu-tool')) === null || _a === void 0 ? void 0 : _a.insertAdjacentElement('beforeend', element);
                element.addEventListener('click', callback);
            }
        }
    }
}
export { ToolsManager };
