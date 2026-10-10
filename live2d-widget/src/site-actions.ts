/**
 * @file 把 AI 的决定变成真正的站点操作：放歌/切歌/调音量、打开文章或页面。
 *
 * 分工：模型只负责"决定做什么"（返回工具名 + 参数），真正的执行在浏览器里，
 * 所以模型碰不到你的站点数据，也不需要把歌单/文章列表交给它去猜。
 *
 * @module site-actions
 */

/** 模型可以请求的一个操作 */
interface SiteAction {
  name: string;
  arguments?: Record<string, unknown>;
}

interface PostRef {
  title: string;
  url: string;
}

/** 站点页面白名单：只允许跳到这些站内地址 */
const PAGE_URLS: Record<string, string> = {
  home: '/',
  archives: '/archives/',
  categories: '/categories/',
  tags: '/tags/',
  gallery: '/gallery/',
};

/** 文章链接形态：/2026/09/30/标题/ */
const POST_URL_RE = /^\/\d{4}\/\d{2}\/\d{2}\//;
/** 最多收集多少篇文章/多少首歌，避免把上下文撑爆 */
const MAX_ITEMS = 40;
/** 等待播放器初始化完成的最长时间 */
const PLAYER_WAIT_MS = 1500;

let postsCache: PostRef[] | null = null;
let musicCache: string[] | null = null;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\-_·・]/g, '');
}

/** 从当前页面里的链接收集文章 */
function collectPostsFromDom(): PostRef[] {
  const found = new Map<string, PostRef>();
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    let url = href;
    try {
      url = href.startsWith('http') ? new URL(href, location.origin).pathname : href;
    } catch {
      return;
    }
    if (!POST_URL_RE.test(url)) return;
    const title = (link.textContent || '').trim();
    if (title && !found.has(url)) found.set(url, { title, url });
  });
  return [...found.values()];
}

/** 文章页上通常没有文章列表，这时退回 /archives/ 抓一次 */
async function collectPostsFromArchive(): Promise<PostRef[]> {
  try {
    const response = await fetch('/archives/');
    if (!response.ok) return [];
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const out: PostRef[] = [];
    doc.querySelectorAll('a[href]').forEach(link => {
      const url = link.getAttribute('href') || '';
      const title = (link.textContent || '').trim();
      if (POST_URL_RE.test(url) && title && !out.some(post => post.url === url)) {
        out.push({ title, url });
      }
    });
    return out;
  } catch {
    return [];
  }
}

async function getPosts(): Promise<PostRef[]> {
  if (postsCache) return postsCache;
  let posts = collectPostsFromDom();
  if (posts.length === 0) posts = await collectPostsFromArchive();
  postsCache = posts.slice(0, MAX_ITEMS);
  return postsCache;
}

/** 等播放器实例出现（APlayer 是异步建出来的） */
async function waitForPlayer(): Promise<any | null> {
  const deadline = Date.now() + PLAYER_WAIT_MS;
  for (;;) {
    const player = (window as any).ap;
    if (player && player.list) return player;
    if (Date.now() > deadline) return null;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** 把一条音频记录转成"歌名 - 歌手"；APlayer 的默认占位值会被识破并丢掉 */
function trackTitle(audio: any): string {
  const name = String(audio?.name ?? audio?.title ?? '').trim();
  const artist = String(audio?.artist ?? audio?.author ?? '').trim();
  if (!name || name === 'Audio name') return '';
  const cleanArtist = artist && artist !== 'Audio artist' && artist !== '未知歌手' ? artist : '';
  return cleanArtist ? `${name} - ${cleanArtist}` : name;
}

/**
 * 歌单标题。
 * 优先直接读 /music/music.json：APlayer 会把 title/author 归一化成 name/artist，
 * 取不到时还会填 'Audio name' 这种占位值，所以从播放器实例读名字并不可靠。
 * 读不到文件时才退回播放器实例。
 */
async function getMusicTitles(): Promise<string[]> {
  if (musicCache) return musicCache;
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
  } catch {
    // 忽略：退回播放器实例
  }
  const player = await waitForPlayer();
  const audios: any[] = player?.list?.audios ?? [];
  musicCache = audios.slice(0, MAX_ITEMS).map(trackTitle).filter(Boolean);
  return musicCache;
}

/**
 * 收集给模型看的站点信息（当前页面 + 文章列表 + 歌单）。
 * 内容会被函数端再截断一次，这里先自己控制体积。
 */
async function buildSiteContext(): Promise<Record<string, unknown>> {
  const [posts, music] = await Promise.all([getPosts(), getMusicTitles()]);
  return {
    page: location.pathname,
    posts: posts.map(post => ({ title: post.title.slice(0, 60), url: post.url })),
    music: music.map(title => title.slice(0, 60)),
  };
}

/** 按关键词找文章：先精确包含，再退化成按字匹配打分 */
function pickPost(posts: PostRef[], query: string): PostRef | null {
  const target = normalize(query);
  if (!target) return null;
  const exact = posts.find(post => normalize(post.title).includes(target));
  if (exact) return exact;
  const reverse = posts.find(post => target.includes(normalize(post.title)));
  if (reverse) return reverse;
  let best: PostRef | null = null;
  let bestScore = 0;
  for (const post of posts) {
    const title = normalize(post.title);
    let score = 0;
    for (const ch of new Set(target)) if (title.includes(ch)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = post;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** 在歌单标题里按关键词找下标（标题来自 getMusicTitles，下标和播放器列表一一对应） */
function pickTrack(titles: string[], query: string): number {
  const target = normalize(query);
  if (!target) return -1;
  const names = titles.map(title => normalize(title));
  const exact = names.findIndex(name => name.includes(target));
  if (exact >= 0) return exact;
  // 模型有时会给"歌名 歌手"，两边都归一化后仍可能差一点，再按字重叠打分
  let best = -1;
  let bestScore = 0;
  names.forEach((name, index) => {
    let score = 0;
    for (const ch of new Set(target)) if (name.includes(ch)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return bestScore >= 2 ? best : -1;
}

function pickVolume(value: unknown): number | null {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return null;
  return Math.max(0, Math.min(100, Math.round(volume)));
}

/**
 * 执行模型请求的操作。
 * @param {SiteAction[]} actions - 模型返回的操作列表
 * @returns {Promise<string[]>} 每条操作的结果文案，用于在面板里回显
 */
async function executeActions(actions: SiteAction[]): Promise<string[]> {
  const results: string[] = [];
  let navigateTo: string | null = null;

  for (const action of actions) {
    const args = action?.arguments ?? {};
    try {
      switch (action?.name) {
        case 'play_music': {
          const player = await waitForPlayer();
          if (!player) {
            results.push('🎵 播放器还没加载好，等会儿再试试');
            break;
          }
          const titles = await getMusicTitles();
          const query = String(args.query ?? '');
          const index = pickTrack(titles, query);
          const total = player.list?.audios?.length ?? 0;
          if (index < 0 || index >= total) {
            const sample = titles.slice(0, 3).join('、');
            results.push(`🎵 歌单里没找到「${query}」，比如有：${sample}`);
            break;
          }
          player.list.switch(index);
          player.play();
          results.push(`🎵 正在播放：${titles[index] ?? '这首歌'}`);
          // 浏览器可能因为"没有用户手势"拦掉自动播放，这里探一下并给出提示
          await new Promise(resolve => setTimeout(resolve, 400));
          if (player.audio && player.audio.paused) {
            results.push('（没声音的话：点一下播放器上的播放键，浏览器会拦自动播放）');
          }
          break;
        }
        case 'music_control': {
          const player = await waitForPlayer();
          const what = String(args.action ?? 'toggle');
          if (!player) {
            results.push('🎵 播放器还没加载好，等会儿再试试');
            break;
          }
          if (what === 'pause') {
            player.pause();
            results.push('⏸️ 已暂停');
          } else if (what === 'next') {
            player.skipForward();
            results.push('⏭️ 下一首');
          } else if (what === 'prev') {
            player.skipBack();
            results.push('⏮️ 上一首');
          } else {
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
          const query = String(args.query ?? '');
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
          const page = String(args.page ?? '');
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
    } catch (error) {
      console.error('[live2d-widget] 执行站点操作失败：', action?.name, error);
      results.push('⚠️ 这个操作没做成，等会儿再试试');
    }
  }

  if (navigateTo) {
    // 留一点时间把提示显示出来再跳转
    const target = navigateTo;
    setTimeout(() => {
      location.href = target;
    }, 900);
  }

  return results;
}

export { buildSiteContext, executeActions };
export type { SiteAction };
