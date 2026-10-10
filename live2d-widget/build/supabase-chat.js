class ChatNotice extends Error {
}
const SESSION_KEY = 'live2d-chat-session';
const EXPIRY_SKEW_MS = 60 * 1000;
function readSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.access_token && parsed.refresh_token ? parsed : null;
    }
    catch (_a) {
        return null;
    }
}
function writeSession(session) {
    try {
        if (session)
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else
            localStorage.removeItem(SESSION_KEY);
    }
    catch (_a) {
    }
}
function toSession(raw) {
    return {
        access_token: String(raw.access_token),
        refresh_token: String(raw.refresh_token),
        expires_at: Date.now() + Number(raw.expires_in || 3600) * 1000,
    };
}
async function authRequest(config, path, body) {
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
        const reason = (data === null || data === void 0 ? void 0 : data.error_code) || (data === null || data === void 0 ? void 0 : data.error) || (data === null || data === void 0 ? void 0 : data.msg) || response.status;
        throw new Error(`Supabase Auth 失败：${reason}`);
    }
    return data;
}
async function signInAnonymously(config) {
    const data = await authRequest(config, 'signup', {});
    const session = toSession(data);
    writeSession(session);
    return session;
}
async function refreshSession(config, session) {
    const data = await authRequest(config, 'token?grant_type=refresh_token', {
        refresh_token: session.refresh_token,
    });
    const next = toSession(data);
    writeSession(next);
    return next;
}
async function getAccessToken(config, force = false) {
    const stored = readSession();
    if (!force && stored && stored.expires_at - EXPIRY_SKEW_MS > Date.now()) {
        return stored.access_token;
    }
    if (stored) {
        try {
            return (await refreshSession(config, stored)).access_token;
        }
        catch (error) {
            console.warn('[live2d-widget] 刷新登录状态失败，重新匿名登录', error);
            writeSession(null);
        }
    }
    return (await signInAnonymously(config)).access_token;
}
async function askChat(config, message) {
    const url = `${config.supabaseUrl}/functions/v1/${config.functionName || 'chat'}`;
    let token = await getAccessToken(config);
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: config.supabaseKey,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && attempt === 0) {
            token = await getAccessToken(config, true);
            continue;
        }
        if (!response.ok) {
            if (typeof (data === null || data === void 0 ? void 0 : data.reply) === 'string' && data.reply)
                throw new ChatNotice(data.reply);
            throw new Error(`chat function 返回 ${response.status}`);
        }
        if (typeof (data === null || data === void 0 ? void 0 : data.reply) !== 'string' || !data.reply) {
            throw new Error('chat function 返回内容为空');
        }
        return data.reply;
    }
    throw new Error('身份校验失败');
}
export { askChat, ChatNotice };
