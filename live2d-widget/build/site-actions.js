const PAGE_URLS = {
    home: '/',
    archives: '/archives/',
    categories: '/categories/',
    tags: '/tags/',
    gallery: '/gallery/',
};
const POST_URL_RE = /^\/\d{4}\/\d{2}\/\d{2}\//;
const MAX_ITEMS = 40;
const PLAYER_WAIT_MS = 1500;
let postsCache = null;
let musicCache = null;
function normalize(text) {
    return text.toLowerCase().replace(/[\s\-_·・]/g, '');
}
function collectPostsFromDom() {
    const found = new Map();
    document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href') || '';
        let url = href;
        try {
            url = href.startsWith('http') ? new URL(href, location.origin).pathname : href;
        }
        catch (_a) {
            return;
        }
        if (!POST_URL_RE.test(url))
            return;
        const title = (link.textContent || '').trim();
        if (title && !found.has(url))
            found.set(url, { title, url });
    });
    return [...found.values()];
}
async function collectPostsFromArchive() {
    try {
        const response = await fetch('/archives/');
        if (!response.ok)
            return [];
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const out = [];
        doc.querySelectorAll('a[href]').forEach(link => {
            const url = link.getAttribute('href') || '';
            const title = (link.textContent || '').trim();
            if (POST_URL_RE.test(url) && title && !out.some(post => post.url === url)) {
                out.push({ title, url });
            }
        });
        return out;
    }
    catch (_a) {
        return [];
    }
}
async function getPosts() {
    if (postsCache)
        return postsCache;
    let posts = collectPostsFromDom();
    if (posts.length === 0)
        posts = await collectPostsFromArchive();
    postsCache = posts.slice(0, MAX_ITEMS);
    return postsCache;
}
async function waitForPlayer() {
    const deadline = Date.now() + PLAYER_WAIT_MS;
    for (;;) {
        const player = window.ap;
        if (player && player.list)
            return player;
        if (Date.now() > deadline)
            return null;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
function trackTitle(audio) {
    var _a, _b, _c, _d;
    const name = String((_b = (_a = audio === null || audio === void 0 ? void 0 : audio.name) !== null && _a !== void 0 ? _a : audio === null || audio === void 0 ? void 0 : audio.title) !== null && _b !== void 0 ? _b : '').trim();
    const artist = String((_d = (_c = audio === null || audio === void 0 ? void 0 : audio.artist) !== null && _c !== void 0 ? _c : audio === null || audio === void 0 ? void 0 : audio.author) !== null && _d !== void 0 ? _d : '').trim();
    if (!name || name === 'Audio name')
        return '';
    const cleanArtist = artist && artist !== 'Audio artist' && artist !== '未知歌手' ? artist : '';
    return cleanArtist ? `${name} - ${cleanArtist}` : name;
}
async function getMusicTitles() {
    var _a, _b;
    if (musicCache)
        return musicCache;
    try {
        const response = await fetch('/music/music.json');
        if (response.ok) {
            const list = await response.json();
            if (Array.isArray(list) && list.length) {
                const titles = list.slice(0, MAX_ITEMS).map(trackTitle).filter(Boolean);
                if (titles.length) {
                    musicCache = titles;
                    return musicCache;
                }
            }
        }
    }
    catch (_c) {
    }
    const player = await waitForPlayer();
    const audios = (_b = (_a = player === null || player === void 0 ? void 0 : player.list) === null || _a === void 0 ? void 0 : _a.audios) !== null && _b !== void 0 ? _b : [];
    musicCache = audios.slice(0, MAX_ITEMS).map(trackTitle).filter(Boolean);
    return musicCache;
}
async function buildSiteContext() {
    const [posts, music] = await Promise.all([getPosts(), getMusicTitles()]);
    return {
        page: location.pathname,
        posts: posts.map(post => ({ title: post.title.slice(0, 60), url: post.url })),
        music: music.map(title => title.slice(0, 60)),
    };
}
function pickPost(posts, query) {
    const target = normalize(query);
    if (!target)
        return null;
    const exact = posts.find(post => normalize(post.title).includes(target));
    if (exact)
        return exact;
    const reverse = posts.find(post => target.includes(normalize(post.title)));
    if (reverse)
        return reverse;
    let best = null;
    let bestScore = 0;
    for (const post of posts) {
        const title = normalize(post.title);
        let score = 0;
        for (const ch of new Set(target))
            if (title.includes(ch))
                score++;
        if (score > bestScore) {
            bestScore = score;
            best = post;
        }
    }
    return bestScore >= 2 ? best : null;
}
function pickTrack(titles, query) {
    const target = normalize(query);
    if (!target)
        return -1;
    const names = titles.map(title => normalize(title));
    const exact = names.findIndex(name => name.includes(target));
    if (exact >= 0)
        return exact;
    let best = -1;
    let bestScore = 0;
    names.forEach((name, index) => {
        let score = 0;
        for (const ch of new Set(target))
            if (name.includes(ch))
                score++;
        if (score > bestScore) {
            bestScore = score;
            best = index;
        }
    });
    return bestScore >= 2 ? best : -1;
}
function pickVolume(value) {
    const volume = Number(value);
    if (!Number.isFinite(volume))
        return null;
    return Math.max(0, Math.min(100, Math.round(volume)));
}
async function executeActions(actions) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const results = [];
    let navigateTo = null;
    for (const action of actions) {
        const args = (_a = action === null || action === void 0 ? void 0 : action.arguments) !== null && _a !== void 0 ? _a : {};
        try {
            switch (action === null || action === void 0 ? void 0 : action.name) {
                case 'play_music': {
                    const player = await waitForPlayer();
                    if (!player) {
                        results.push('🎵 播放器还没加载好，等会儿再试试');
                        break;
                    }
                    const titles = await getMusicTitles();
                    const query = String((_b = args.query) !== null && _b !== void 0 ? _b : '');
                    const index = pickTrack(titles, query);
                    const total = (_e = (_d = (_c = player.list) === null || _c === void 0 ? void 0 : _c.audios) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
                    if (index < 0 || index >= total) {
                        const sample = titles.slice(0, 3).join('、');
                        results.push(`🎵 歌单里没找到「${query}」，比如有：${sample}`);
                        break;
                    }
                    player.list.switch(index);
                    player.play();
                    results.push(`🎵 正在播放：${(_f = titles[index]) !== null && _f !== void 0 ? _f : '这首歌'}`);
                    await new Promise(resolve => setTimeout(resolve, 400));
                    if (player.audio && player.audio.paused) {
                        results.push('（没声音的话：点一下播放器上的播放键，浏览器会拦自动播放）');
                    }
                    break;
                }
                case 'music_control': {
                    const player = await waitForPlayer();
                    const what = String((_g = args.action) !== null && _g !== void 0 ? _g : 'toggle');
                    if (!player) {
                        results.push('🎵 播放器还没加载好，等会儿再试试');
                        break;
                    }
                    if (what === 'pause') {
                        player.pause();
                        results.push('⏸️ 已暂停');
                    }
                    else if (what === 'next') {
                        player.skipForward();
                        results.push('⏭️ 下一首');
                    }
                    else if (what === 'prev') {
                        player.skipBack();
                        results.push('⏮️ 上一首');
                    }
                    else {
                        player.play();
                        results.push('▶️ 继续播放');
                    }
                    break;
                }
                case 'set_volume': {
                    const player = await waitForPlayer();
                    const volume = pickVolume(args.volume);
                    if (!player || volume === null) {
                        results.push('🔊 音量没调成，等会儿再试试');
                        break;
                    }
                    player.volume(volume / 100, true);
                    results.push(`🔊 音量已调到 ${volume}%`);
                    break;
                }
                case 'open_post': {
                    const query = String((_h = args.query) !== null && _h !== void 0 ? _h : '');
                    const post = pickPost(await getPosts(), query);
                    if (!post) {
                        results.push(`📖 没找到和「${query}」有关的文章`);
                        break;
                    }
                    navigateTo = post.url;
                    results.push(`📖 正在打开《${post.title}》`);
                    break;
                }
                case 'open_page': {
                    const page = String((_j = args.page) !== null && _j !== void 0 ? _j : '');
                    const url = PAGE_URLS[page];
                    if (!url) {
                        results.push(`📄 不认识的页面：${page}`);
                        break;
                    }
                    navigateTo = url;
                    results.push(`📄 正在打开：${page}`);
                    break;
                }
                default:
                    break;
            }
        }
        catch (error) {
            console.error('[live2d-widget] 执行站点操作失败：', action === null || action === void 0 ? void 0 : action.name, error);
            results.push('⚠️ 这个操作没做成，等会儿再试试');
        }
    }
    if (navigateTo) {
        const target = navigateTo;
        setTimeout(() => {
            location.href = target;
        }, 900);
    }
    return results;
}
export { buildSiteContext, executeActions };
