// ================================================================
// annual-canvas-render.js
// 年度报告模式 纯Canvas绘制导出（对齐 export-canvas-render.js 视觉风格）
// 每个模块单独生成一张图，固定尺寸 + DPR×2 高清输出
// ================================================================
import {
  getWebImageUrl,
  preloadImageBitmap,
  preloadAndDecodeImage,
  convertR2ToJsDelivr,
  LAYOUT_SPACE,
  LAYOUT_STYLE
} from './main.js';
// 复用FavList导出的文字换行工具和绘制器
import { wrapText, measureWrappedHeight, CanvasLayoutPainter, setCurrentDPR } from './export-canvas-render.js';

// ===================== 常量 =====================
const MAX_IMAGE_CONCURRENCY = 4;
const FONT_SIYUAN = "Noto Sans SC, sans-serif";
const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
let DPR = 2;
const WRAP_MAX_W = 1200;

// ---- 固定尺寸（对齐FavList，不随宽度等比缩放）----
const TITLE_SIZE = 42;                 // 大标题（对齐FavList）
const MODULE_TITLE_SIZE = 24;          // 模块小标题（对齐FavList"基础信息"24px）
const NO_SIZE = 22;                    // NO.标签
const NAME_SIZE = 22;                  // 游戏/角色/CP名称
const STAT_SIZE = 16;                  // 统计文字（保留，旧函数兼容）
const STAT_VALUE_SIZE = 42;            // 用户输入值固定42px（整体调大，更适应文本框）
const STAT_LABEL_SIZE = 36;            // 标签文字固定36px
const STAT_LINE_HEIGHT = 52;           // 混排行高
const SUBTITLE_COLOR = '#b85878';      // 模块小标题颜色（对齐网页.annual-top-label，用户指定）
const COVER_TEXT_GAP = 16;             // ✅新增：封面卡片右边框 到 感想框左边框 的统一间距
const NO_COLOR = '#b85878';            // NO标签颜色（对齐网页.annual-top-label）
const LABEL_ROW_MB = 8;                // ✅NO+名称行底部间距（12→8，缩减与下方图片距离）
const ITEM_GAP = 24;                   // TOP条目间间距
const MODULE_GAP = 30;                 // 模块卡片间间距（单模块图中不涉及，预留）
const CARD_INNER_PAD = 20;             // 模块卡片内边距（对齐BIG_CARD_PADDING）
const COVER_CARD_PAD = 0;              // ✅封面卡片内边距（8→0，图片贴外框，删除图片与外框间内边距）
const TEXT_BOX_PAD = 10;               // 感想文字框内边距
const GAME_COVER_W = 140;              // 游戏封面固定宽度
const CHAR_COVER_SIZE = 120;           // 角色封面固定正方形
const CP_COVER_SIZE = 100;             // CP封面固定正方形
const CP_GAP = 10;                     // CP双图间距
// ========== 五、其他模块 ==========
const OTHER_SECTION_TITLE_SIZE = 18;   // "还玩了"/卡片标题/底部标题统一18px
const OTHER_CARD_W = 225;              // 其他模块卡片宽度（容纳CP双图100+10+100=210）
const OTHER_CARD_GAP = 16;             // 其他模块卡片间距
const OTHER_CARD_PAD = 14;             // 其他模块卡片内边距
const OTHER_CARD_TITLE_MB = 10;        // 卡片标题底部间距
const OTHER_ALSO_COVER_W = GAME_COVER_W;      // "还玩了"封面宽度=模块二140
const OTHER_ALSO_COVER_GAP = 16;       // "还玩了"封面间距
const OTHER_CP_COVER_SIZE = CP_COVER_SIZE;    // 最喜欢的CP封面=模块四100
const OTHER_SUPPORT_COVER_SIZE = CP_COVER_SIZE;   // 最喜欢的配角=与CP图一致100
const OTHER_TEXT_BOX_MIN_H = 80;       // 其他模块文本框最小高度
const OTHER_SECTION_GAP = 20;          // "还玩了"区域与卡片区间距
// ========== 六、七宫格模块 ==========
const GRID_GAP = 16;                   // 宫格间距
const GRID_LABEL_SIZE = 18;            // 宫格标签字号统一18px
const GRID_LABEL_GAP = 8;              // 封面与标签间距
const GRID_FOOTER_GAP = 20;            // 宫格与底部文本框间距
const FOOTER_PAD = 14;                 // 底部文本框内边距
const FOOTER_TITLE_GAP = 10;           // 底部标题与文本框间距
const CARD_RADIUS = 16;                // 模块卡片圆角（对齐BIG_CARD_RADIUS）
const CARD_BORDER_W = 2;               // 模块卡片边框宽度
const SUB_CARD_RADIUS = 8;             // 封面/感想框圆角
const SUB_CARD_BORDER = '#eee';        // 封面卡片边框色

// ===================== 缓存 =====================
const roundImageCache = new Map();
const rawImageResourceCache = new Map();

// ===================== 进度上报 =====================
function emitRenderProgress(percent) {
  window.dispatchEvent(new CustomEvent('annual-canvas-progress', {
    detail: { percent: Math.min(100, Math.max(0, Number(percent))) }
  }));
}

// ===================== URL安全过滤 =====================
function isSafeUrl(url) {
  if (!url) return false;
  if (!/^https?:\/\//.test(url)) return false;
  if (/^https:\/\/pub-/.test(url)) return false;
  if (/raw\.githubusercontent\.com/.test(url)) return false;
  return true;
}

function toCanvasUrl(relativeSrc) {
  if (!relativeSrc) return '';
  let url = getWebImageUrl(relativeSrc);
  if (url && /^https:\/\/pub-/.test(url)) {
    const converted = convertR2ToJsDelivr(relativeSrc);
    if (converted && isSafeUrl(converted)) url = converted;
  }
  return isSafeUrl(url) ? url : '';
}

// ===================== 图片尺寸工具 =====================
function getImgSize(img) {
  if (!img) return { w: 0, h: 0 };
  return {
    w: img.naturalWidth ?? img.width ?? 0,
    h: img.naturalHeight ?? img.height ?? 0
  };
}

// 游戏封面高度：固定宽度，按原图比例自适应
function calcGameCoverHeight(img) {
  const { w, h } = getImgSize(img);
  if (w <= 0 || h <= 0) return Math.round(GAME_COVER_W * 1.4); // 兜底竖版比例
  return Math.round(GAME_COVER_W * h / w);
}

// ===================== 布局计算辅助 =====================
function getBodyPad() {
  return LAYOUT_SPACE.BODY_PADDING || 20;
}

function getWrapW(targetW) {
  const pad = getBodyPad();
  return Math.min(WRAP_MAX_W, targetW - pad * 2);
}

function getWrapX(targetW, wrapW) {
  const pad = getBodyPad();
  return Math.max(pad, (targetW - wrapW) / 2);
}

function getTitleMb() {
  return (LAYOUT_SPACE.SITE_TITLE_MT || 0) + (LAYOUT_SPACE.SITE_TITLE_MB || 20);
}

// ===================== 圆角离屏画布 =====================
function createRoundImageCanvas(img, srcUrl, radius) {
  if (!img) return null;
  const { w: sourceW, h: sourceH } = getImgSize(img);
  if (sourceW <= 0 || sourceH <= 0) return null;
  if (IS_IOS_WEBKIT) {
    const pxTotal = (sourceW * DPR) * (sourceH * DPR);
    if (pxTotal > 4096 * 4096) return null;
  }
  const cacheKey = `${srcUrl}||${sourceW}x${sourceH}||${radius}||${DPR}`;
  if (roundImageCache.has(cacheKey)) return roundImageCache.get(cacheKey);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sourceW * DPR;
  offCanvas.height = sourceH * DPR;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return null;
  offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);  // ✅补：清空离屏画布
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = "high";
  offCtx.webkitImageSmoothingEnabled = true;  // ✅补：IOS Safari前缀兼容
  try {
    offCtx.save();
    offCtx.scale(DPR, DPR);
    offCtx.beginPath();
    offCtx.moveTo(radius, 0);
    offCtx.lineTo(sourceW - radius, 0);
    offCtx.quadraticCurveTo(sourceW, 0, sourceW, radius);
    offCtx.lineTo(sourceW, sourceH - radius);
    offCtx.quadraticCurveTo(sourceW, sourceH, sourceW - radius, sourceH);
    offCtx.lineTo(radius, sourceH);
    offCtx.quadraticCurveTo(0, sourceH, 0, sourceH - radius);
    offCtx.lineTo(0, radius);
    offCtx.quadraticCurveTo(0, 0, radius, 0);
    offCtx.closePath();
    offCtx.clip();
    offCtx.drawImage(img, 0, 0, sourceW, sourceH);
    offCtx.restore();
  } catch (e) {
    console.warn("annual离屏画布绘制异常", srcUrl, e);  // ✅补：可追踪警告
    offCanvas.width = 0; offCanvas.height = 0;
    return null;
  }
  roundImageCache.set(cacheKey, offCanvas);
  return offCanvas;
}

async function preGenerateAllRoundCanvas(imageCache, roundTaskList) {
  const taskMap = new Map();
  for (const task of roundTaskList) {
    const img = imageCache.get(task.src);
    if (!img) continue;
    const { w, h } = getImgSize(img);
    const key = `${task.src}||${w}x${h}||${task.radius}||${DPR}`;
    if (!taskMap.has(key)) taskMap.set(key, task);
  }
  let idx = 0;
  const total = taskMap.size;
  for (const task of taskMap.values()) {
    createRoundImageCanvas(imageCache.get(task.src), task.src, task.radius);
    await new Promise(r => setTimeout(r, IS_IOS_WEBKIT ? 30 : 12));
    idx++;
    if (total > 0) emitRenderProgress(45 + (idx / total) * 15);
  }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 50));
  if (IS_IOS_WEBKIT && roundImageCache.size > 80) {
    const del = roundImageCache.size - 80;
    let count = 0;
    for (const [k, c] of roundImageCache) {
      if (count >= del) break;
      c.width = 0; c.height = 0;
      roundImageCache.delete(k);
      count++;
    }
  }
}

// ===================== 图片加载 =====================
async function loadImagesWithLimit(urlList, limit) {
  const uniqueUrls = [...new Set(urlList)];
  const resultMap = new Map();
  let index = 0;

  async function loadSingleUrl(url, retryCount = 2) {
    try {
      const bitmap = await preloadImageBitmap(url);
      if (!bitmap || bitmap.width === 0 || bitmap.height === 0) throw new Error("empty");
      if (IS_IOS_WEBKIT) await new Promise(r => requestAnimationFrame(r));
      rawImageResourceCache.set(url, { type: 'bitmap', data: bitmap });
      return bitmap;
    } catch (err) {
      if (retryCount > 0) {
        await new Promise(r => setTimeout(r, 600));
        return loadSingleUrl(url, retryCount - 1);
      }
      try {
        const img = await preloadAndDecodeImage(url);
        await new Promise(r => requestAnimationFrame(r));
        rawImageResourceCache.set(url, { type: 'image', data: img });
        return img;
      } catch (e2) {
        rawImageResourceCache.set(url, { type: 'fail', data: null });
        return null;
      }
    }
  }

  async function worker() {
    while (index < uniqueUrls.length) {
      const url = uniqueUrls[index++];
      if (resultMap.has(url)) continue;
      const bitmap = await loadSingleUrl(url);
      resultMap.set(url, bitmap);
      if (uniqueUrls.length > 0) emitRenderProgress((resultMap.size / uniqueUrls.length) * 45);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 30));
  // ✅收集失败列表（对齐export容错模式）
  const failList = [];
  for (const [u, val] of resultMap.entries()) {
    if (!val) failList.push(u);
  }
  if (failList.length > 0) {
    console.warn("⚠️ annual部分图片加载失败，继续渲染（空白占位）：", failList);
  }
  return { resultMap, failList };
}

// ===================== 统计文本 =====================
const STAT_LABELS = [
  ['reportYear', '年度'],
  ['playCount', '游玩总数'],
  ['totalHours', '总时长'],
  ['likeCharCount', '喜欢角色'],
  ['cpCount', 'CP'],
  ['buyCount', '购买'],
  ['costMoney', '花费'],
  ['finished', '完结'],
  ['ongoing', '途中'],
  ['notStart', '未开'],
];

// ========== STATS_BG_CONFIG 框范围按1620px像素范围精确换算 ==========
const STATS_BG_CONFIG = {
  A: {
    file: 'game/Stats1.png',
    // 只有A：高502-890px（底图上204px/高874px）→ t=0.34 b=0.79；左右全宽居中
    boxes: { A: { l: 0.00, r: 1.00, t: 0.34, b: 0.79 } }
  },
  B: {
    file: 'game/Stats2.png',
    // 只有B：高270-820px（底图上204px/高786px）→ t=0.08 b=0.78；宽405-1405px → l=0.24 r=0.89
    boxes: { B: { l: 0.24, r: 0.89, t: 0.08, b: 0.78 } }
  },
  C: {
    file: 'game/Stats3.png',
    // 只有C：高275-880px（底图上204px/高748px）→ t=0.10 b=0.90；宽175-1270px → l=0.09 r=0.80
    boxes: { C: { l: 0.09, r: 0.80, t: 0.10, b: 0.90 } }
  },
  AB: {
    file: 'game/Stats4.png',
    boxes: {
      // A高505-890px（底图上204px/高1586px）→ t=0.19 b=0.43；左右全宽居中
      A: { l: 0.00, r: 1.00, t: 0.19, b: 0.43 },
      // B高1065-1625px → t=0.54 b=0.90；宽405-1405px（底图左40px/宽1540px）→ l=0.24 r=0.89
      B: { l: 0.24, r: 0.89, t: 0.54, b: 0.90 }
    }
  },
  AC: {
    file: 'game/Stats5.png',
    boxes: {
      // A高502-890px（底图上204px/高1568px）→ t=0.19 b=0.44；左右全宽居中
      A: { l: 0.00, r: 1.00, t: 0.19, b: 0.44 },
      // C高1097-1703px → t=0.57 b=0.96；宽175-1270px → l=0.09 r=0.80
      C: { l: 0.09, r: 0.80, t: 0.57, b: 0.96 }
    }
  },
  BC: {
    file: 'game/Stats6.png',
    boxes: {
      // B高275-825px（底图上204px/高1382px）→ t=0.05 b=0.45；宽405-1405px → l=0.24 r=0.89
      B: { l: 0.24, r: 0.89, t: 0.05, b: 0.45 },
      // C高915-1515px → t=0.51 b=0.95；宽175-1270px → l=0.09 r=0.80
      C: { l: 0.09, r: 0.80, t: 0.51, b: 0.95 }
    }
  },
  ABC: {
    file: 'game/Stats7.png',
    boxes: {
      // A高505-890px（底图上204px/高2178px）→ t=0.14 b=0.32；左右全宽居中
      A: { l: 0.00, r: 1.00, t: 0.14, b: 0.32 },
      // B高1070-1625px → t=0.40 b=0.65；宽405-1405px → l=0.24 r=0.89
      B: { l: 0.24, r: 0.89, t: 0.40, b: 0.65 },
      // C高1705-2310px → t=0.69 b=0.97；宽175-1270px → l=0.09 r=0.80
      C: { l: 0.09, r: 0.80, t: 0.69, b: 0.97 }
    }
  }
};

// ========== 判断A/B/C哪些部分有数据 ==========
function getStatsParts(annualData) {
  const has = (key) => String(annualData[key] ?? '').trim() !== '';
  const parts = [];
  if (has('reportYear') || has('playCount') || has('totalHours')) parts.push('A');
  if (has('likeCharCount') || has('cpCount') || has('buyCount') || has('costMoney')) parts.push('B');
  if (has('finished') || has('ongoing') || has('notStart')) parts.push('C');
  return parts;
}

// ========== buildStatPartSegments — 去掉 finished 的 noStyle 标记 ==========
function buildStatPartSegments(part, annualData) {
  const v = (key) => String(annualData[key] ?? '').trim();
  const BR = { text: '', isBreak: true };
  // 按行构建，每行所有用户值全为空则跳过该行
  const lines = [];
  if (part === 'A') {
    // 第1行：{年}年游玩了{部数}部日乙 — reportYear或playCount任一非空则保留
    if (v('reportYear') || v('playCount')) {
      const line = [];
      if (v('reportYear')) line.push({ text: v('reportYear'), isValue: true });
      line.push({ text: '年游玩了', isValue: false });
      if (v('playCount')) line.push({ text: v('playCount'), isValue: true });
      line.push({ text: '部日乙', isValue: false });
      lines.push(line);
    }
    // 第2行：总时数{小时}小时 — totalHours非空则保留
    if (v('totalHours')) {
      lines.push([
        { text: '总时数', isValue: false },
        { text: v('totalHours'), isValue: true },
        { text: '小时', isValue: false }
      ]);
    }
  }
  if (part === 'B') {
    // 第1行：喜欢{数}个人
    if (v('likeCharCount')) {
      lines.push([
        { text: '喜欢', isValue: false },
        { text: v('likeCharCount'), isValue: true },
        { text: '个人', isValue: false }
      ]);
    }
    // 第2行：嗑{数}对CP
    if (v('cpCount')) {
      lines.push([
        { text: '嗑', isValue: false },
        { text: v('cpCount'), isValue: true },
        { text: '对CP', isValue: false }
      ]);
    }
    // 第3行：一共买了{数}部游戏
    if (v('buyCount')) {
      lines.push([
        { text: '一共买了', isValue: false },
        { text: v('buyCount'), isValue: true },
        { text: '部游戏', isValue: false }
      ]);
    }
    // 第4行：花费{数}元
    if (v('costMoney')) {
      lines.push([
        { text: '花费', isValue: false },
        { text: v('costMoney'), isValue: true },
        { text: '元', isValue: false }
      ]);
    }
  }
  if (part === 'C') {
    // 第1行：其中，{数}部已封盘 — finished非空则保留（含前缀"其中，"）
    // 数值与其他值一样加粗+左右4px间距（已移除 noStyle）
    if (v('finished')) {
      lines.push([
        { text: '其中，', isValue: false },
        { text: v('finished'), isValue: true },
        { text: '部已封盘', isValue: false }
      ]);
    }
    // 第2行：{数}部正在进行
    if (v('ongoing')) {
      lines.push([
        { text: v('ongoing'), isValue: true },
        { text: '部正在进行', isValue: false }
      ]);
    }
    // 第3行：{数}部还未开始
    if (v('notStart')) {
      lines.push([
        { text: v('notStart'), isValue: true },
        { text: '部还未开始', isValue: false }
      ]);
    }
  }
  // 展开为segments，行间用BR分隔
  const segments = [];
  lines.forEach((line, i) => {
    if (i > 0) segments.push(BR);
    segments.push(...line);
  });
  return segments;
}

// ========== wrapStatSegments — 去掉自动换行，只按 BR 强制换行 ==========
function wrapStatSegments(ctx, segments, maxWidth, valueSize, labelSize) {
  // 不自动换行：只按 BR 标记强制换行，每行内容直接排列
  const lines = [[]];
  for (const seg of segments) {
    if (seg.isBreak) {
      lines.push([]);
      continue;
    }
    const size = seg.isValue ? valueSize : labelSize;
    ctx.font = (seg.isValue ? 'bold ' : '') + size + 'px ' + FONT_SIYUAN;
    const chars = Array.from(seg.text);
    chars.forEach((ch, ci) => {
      lines[lines.length - 1].push({
        ch: ch,
        size: size,
        isValue: seg.isValue,
        isValueStart: seg.isValue && ci === 0,
        isValueEnd: seg.isValue && ci === chars.length - 1
      });
    });
  }
  return lines;
}

// ========== drawStatPartCentered — 修正垂直居中计算（解决文字偏下） ==========
function drawStatPartCentered(ctx, segments, boxX, boxY, boxW, boxH,
                              valueSize, labelSize, lineHeight, valueColor, labelColor) {
  const lines = wrapStatSegments(ctx, segments, boxW, valueSize, labelSize);
  if (lines.length === 0) return;
  // bottom基线模式：末行文字底部在 y+maxSize，文字块总高=(n-1)*lineHeight+末行maxSize
  let lastMaxSize = 0;
  for (const item of lines[lines.length - 1]) {
    if (item.size > lastMaxSize) lastMaxSize = item.size;
  }
  const totalH = (lines.length - 1) * lineHeight + lastMaxSize;
  let y = boxY + (boxH - totalH) / 2;
  ctx.textBaseline = 'bottom';
  for (const line of lines) {
    // 计算行宽（含值段前后4px间距）
    let lineW = 0;
    for (const item of line) {
      ctx.font = (item.isValue ? 'bold ' : '') + item.size + 'px ' + FONT_SIYUAN;
      lineW += ctx.measureText(item.ch).width;
      if (item.isValueStart) lineW += 4;
      if (item.isValueEnd) lineW += 4;
    }
    // 本行最大字号：底部基线 = 行顶部 + 最大字号
    let maxSize = 0;
    for (const item of line) {
      if (item.size > maxSize) maxSize = item.size;
    }
    let x = boxX + (boxW - lineW) / 2;
    const baselineY = y + maxSize;
    for (const item of line) {
      if (item.isValueStart) x += 4;
      ctx.font = (item.isValue ? 'bold ' : '') + item.size + 'px ' + FONT_SIYUAN;
      ctx.fillStyle = item.isValue ? valueColor : labelColor;
      ctx.fillText(item.ch, x, baselineY);
      x += ctx.measureText(item.ch).width;
      if (item.isValueEnd) x += 4;
    }
    y += lineHeight;
  }
}

function buildStatsText(annualData) {
  const parts = [];
  for (const [key, label] of STAT_LABELS) {
    const val = annualData[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      parts.push(`${label}：${String(val).trim()}`);
    }
  }
  return parts.join('  ');
}

// ===================== 收集图片URL =====================
function collectModuleImages(moduleType, annualData) {
  const urls = [];
  const safeEach = (list, cb) => { (list || []).forEach(item => { if (item) cb(item); }); };
  const pushUrl = (src) => { const u = toCanvasUrl(src); if (u) urls.push(u); };
  if (moduleType === 'stats') {
    const parts = getStatsParts(annualData);
    if (parts.length > 0) {
      const bgInfo = STATS_BG_CONFIG[parts.join('')];
      if (bgInfo) pushUrl(bgInfo.file);
    }
    return [...new Set(urls)];
  }
  if (moduleType === 'gameTop') {
    safeEach(annualData.topList, item => { if (!item.gameId) return; pushUrl(item.coverSrc); });
  } else if (moduleType === 'charTop') {
    safeEach(annualData.charTopList, item => { if (!item.charId) return; pushUrl(item.coverSrc); });
  } else if (moduleType === 'cpTop') {
    safeEach(annualData.cpTopList, item => {
      if (!item.femaleId || !item.maleId) return;
      pushUrl(item.femaleCoverSrc); pushUrl(item.maleCoverSrc);
    });
  } else if (moduleType === 'other') {
    safeEach(annualData.other?.alsoPlayed, item => pushUrl(item.coverSrc));
    const cp = annualData.other?.favCp;
    if (cp && cp.femaleId && cp.maleId) { pushUrl(cp.femaleCoverSrc); pushUrl(cp.maleCoverSrc); }
    const sup = annualData.other?.favSupport;
    if (sup && sup.charId) pushUrl(sup.coverSrc);
    // 新增：最喜欢的女主
    const heroine = annualData.other?.favHeroine;
    if (heroine && heroine.charId) pushUrl(heroine.coverSrc);
    // 新增：自定义角色卡片
    safeEach(annualData.other?.customCharCards, item => { if (item && item.charId) pushUrl(item.coverSrc); });
  } else if (moduleType === 'gameGrid') {
    const g = annualData.gameGrid;
    safeEach(g?.fixed, item => { if (item.gameId) pushUrl(item.coverSrc); });
    safeEach(g?.custom, item => { if (item.gameId) pushUrl(item.coverSrc); });
  } else if (moduleType === 'charGrid') {
    const g = annualData.charGrid;
    safeEach(g?.fixed, item => { if (item.charId) pushUrl(item.coverSrc); });
    safeEach(g?.custom, item => { if (item.charId) pushUrl(item.coverSrc); });
  }
  return [...new Set(urls)];
}

// ===================== 过滤有效条目 =====================
function getValidItems(moduleType, annualData) {
  if (moduleType === 'gameTop') {
    return (annualData.topList || []).filter(item => item && item.gameId);
  } else if (moduleType === 'charTop') {
    return (annualData.charTopList || []).filter(item => item && item.charId);
  } else if (moduleType === 'cpTop') {
    return (annualData.cpTopList || []).filter(item => item && item.femaleId && item.maleId);
  }
  return [];
}

// ===================== 五、其他模块：判断是否有内容 =====================
function hasOtherContent(annualData) {
  const o = annualData.other || {};
  if ((o.alsoPlayed || []).length > 0) return true;
  if (o.favCp && o.favCp.femaleId && o.favCp.maleId) return true;
  if (o.favSupport && o.favSupport.charId) return true;
  if (o.favHeroine && o.favHeroine.charId) return true;  // 新增
  const customCharValid = (o.customCharCards || []).some(c => c && (c.charId || (c.label || '').trim()));
  if (customCharValid) return true;  // 新增
  if ((o.favLine || '').trim()) return true;
  if ((o.favMusic || '').trim()) return true;
  if ((o.favHe || '').trim()) return true;
  if ((o.favBe || '').trim()) return true;
  const customValid = (o.customCards || []).some(c => c && ((c.label || '').trim() || (c.text || '').trim()));
  if (customValid) return true;
  return false;
}

// 收集五模块中有内容的卡片列表（不含"还玩了"区域）
function getOtherCards(annualData) {
  const o = annualData.other || {};
  const cards = [];
  // 新增：最喜欢的女主（顺序最前）
  if (o.favHeroine && o.favHeroine.charId) {
    cards.push({ type: 'heroine', title: '最喜欢的女主', data: o.favHeroine });
  }
  if (o.favSupport && o.favSupport.charId) {
    cards.push({ type: 'support', title: '最喜欢的配角', data: o.favSupport });
  }
  if (o.favCp && o.favCp.femaleId && o.favCp.maleId) {
    cards.push({ type: 'cp', title: '最喜欢的CP', data: o.favCp });
  }
  // 新增：自定义角色卡片
  (o.customCharCards || []).forEach(c => {
    if (c && (c.charId || (c.label || '').trim())) {
      cards.push({ type: 'customChar', title: c.label || '自定义', data: c });
    }
  });
  if ((o.favLine || '').trim()) cards.push({ type: 'text', title: '最喜欢的台词', text: o.favLine });
  if ((o.favMusic || '').trim()) cards.push({ type: 'text', title: '最喜欢的OP/ED/BGM', text: o.favMusic });
  if ((o.favHe || '').trim()) cards.push({ type: 'text', title: '最喜欢的HE', text: o.favHe });
  if ((o.favBe || '').trim()) cards.push({ type: 'text', title: '最喜欢的BE', text: o.favBe });
  (o.customCards || []).forEach(c => {
    if (c && ((c.label || '').trim() || (c.text || '').trim())) {
      cards.push({ type: 'custom', title: c.label || '自定义', text: c.text || '' });
    }
  });
  return cards;
}

// ===================== 六、七宫格：收集有效项 =====================
function getValidGridItems(gridData, gridKind) {
  // gridKind: 'game' | 'char'
  const valid = [];
  const hasId = (item) => gridKind === 'game' ? !!(item && item.gameId) : !!(item && item.charId);
  // 固定项：有图才导出
  (gridData?.fixed || []).forEach(item => {
    if (hasId(item)) valid.push({ ...item, isCustom: false });
  });
  // 自定义项：有图或有标签才导出
  (gridData?.custom || []).forEach(item => {
    if (!item) return;
    if (hasId(item) || (item.label && item.label.trim())) valid.push({ ...item, isCustom: true });
  });
  return valid;
}

function hasGridContent(gridData, gridKind, footerText) {
  if (getValidGridItems(gridData, gridKind).length > 0) return true;
  if ((footerText || '').trim()) return true;
  return false;
}

// ===================== 高度计算（需在图片加载后调用） =====================
function calcStatsHeight(ctx, targetW, annualData, config, imageCache) {
  const wrapW = getWrapW(targetW);
  let h = getBodyPad() + TITLE_SIZE + getTitleMb(); // 大标题（含顶部边距）
  let contentH = 0;
  const parts = getStatsParts(annualData);
  if (parts.length > 0) {
    const bgInfo = STATS_BG_CONFIG[parts.join('')];
    if (bgInfo) {
      const bgUrl = toCanvasUrl(bgInfo.file);
      const bgImg = bgUrl ? imageCache.get(bgUrl) : null;
      const dims = getImgSize(bgImg);
      if (dims.w > 0 && dims.h > 0) {
        contentH += Math.round(wrapW * dims.h / dims.w);
      } else {
        contentH += 300;
      }
    }
  }
  h += contentH;
  return h;
}

function calcTopItemHeight(ctx, targetW, item, itemType, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = 0;

  // ---- NO + 名称行 ----
  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${NO_SIZE}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  const nameMaxW = innerW - noW - 12;
  const nameH = measureWrappedHeight(ctx, nameText, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, true);
  const noLineH = NO_SIZE * 1.3;
  h += Math.max(noLineH, nameH) + LABEL_ROW_MB;

  // ---- 封面 + 感想行 ----
  let coverH;
  let coverAreaW;
  if (itemType === 'game') {
    const img = imageCache.get(toCanvasUrl(item.coverSrc));
    coverH = calcGameCoverHeight(img) + COVER_CARD_PAD * 2;
    coverAreaW = GAME_COVER_W + COVER_CARD_PAD * 2;
  } else if (itemType === 'char') {
    coverH = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
    coverAreaW = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
  } else {
    coverH = CP_COVER_SIZE + COVER_CARD_PAD * 2;
    coverAreaW = (CP_COVER_SIZE + COVER_CARD_PAD * 2) * 2 + CP_GAP;
  }
  let textBoxH = 0;
  const text = (item.text || '').trim();
  if (text) {
    const textAreaW = innerW - coverAreaW - COVER_TEXT_GAP;
    const textSize = config.customTextFontSize || 16;
    const textH = measureWrappedHeight(ctx, text, textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    textBoxH = textH + TEXT_BOX_PAD * 2;
  }

  h += Math.max(coverH, textBoxH);
  return h;
}

function calcModuleHeight(ctx, targetW, moduleType, moduleTitle, annualData, config, imageCache) {
  if (moduleType === 'other') {
    return calcOtherHeight(ctx, targetW, annualData, config, imageCache);
  }
  if (moduleType === 'gameGrid') {
    return calcGridHeight(ctx, targetW, annualData.gameGrid, 'game', annualData.gameGrid?.nextYearExpect, config, imageCache);
  }
  if (moduleType === 'charGrid') {
    return calcGridHeight(ctx, targetW, annualData.charGrid, 'char', annualData.charGrid?.extraThoughts, config, imageCache);
  }
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  if (moduleTitle) {
    contentH += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  }
  const items = getValidItems(moduleType, annualData);
  if (items.length > 0) {
    const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
    items.forEach((item, i) => {
      item._no = i;
      contentH += calcTopItemHeight(ctx, targetW, item, itemType, config, imageCache);
      if (i < items.length - 1) contentH += ITEM_GAP;
    });
  }
  h += CARD_INNER_PAD * 2 + contentH;
  return h;
}

// ===================== 五、其他模块高度计算 =====================
function calcOtherHeight(ctx, targetW, annualData, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  const o = annualData.other || {};
  const labelColor = config.subtitle || '#b85878';
  const alsoList = o.alsoPlayed || [];
  if (alsoList.length > 0) {
    contentH += OTHER_SECTION_TITLE_SIZE + 12;
    const coverW = OTHER_ALSO_COVER_W;
    const cols = Math.max(1, Math.floor((innerW + OTHER_ALSO_COVER_GAP) / (coverW + OTHER_ALSO_COVER_GAP)));
    const rows = Math.ceil(alsoList.length / cols);
    for (let r = 0; r < rows; r++) {
      let rowMaxH = 0;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= alsoList.length) break;
        const img = imageCache.get(toCanvasUrl(alsoList[idx].coverSrc));
        rowMaxH = Math.max(rowMaxH, calcGameCoverHeight(img));
      }
      contentH += rowMaxH;
      if (r < rows - 1) contentH += OTHER_ALSO_COVER_GAP;
    }
    contentH += OTHER_SECTION_GAP;
  }
  const cards = getOtherCards(annualData);
  if (cards.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + OTHER_CARD_GAP) / (OTHER_CARD_W + OTHER_CARD_GAP)));
    const rows = Math.ceil(cards.length / cols);
    const textSize = config.customTextFontSize || 16;
    const cardHeights = cards.map(card => {
      // ✅修复：自定义标签过长时动态测量标题换行高度，避免固定高度导致下方内容遮住标题
      const titleMaxW = OTHER_CARD_W - OTHER_CARD_PAD * 2;
      const titleActualH = measureCenteredTextHeight(ctx, card.title || '', titleMaxW, OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE);
      let ch = OTHER_CARD_PAD * 2 + titleActualH + OTHER_CARD_TITLE_MB;
      if (card.type === 'cp') {
        ch += OTHER_CP_COVER_SIZE;
      } else if (card.type === 'support' || card.type === 'heroine' || card.type === 'customChar') {
        ch += OTHER_SUPPORT_COVER_SIZE;
      } else {
        const textAreaW = OTHER_CARD_W - OTHER_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
        const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, textSize * 1.55, textSize);
        ch += Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
      }
      return ch;
    });
    let gridH = 0;
    for (let r = 0; r < rows; r++) {
      let rowMax = 0;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx < cardHeights.length) rowMax = Math.max(rowMax, cardHeights[idx]);
      }
      gridH += rowMax;
      if (r < rows - 1) gridH += OTHER_CARD_GAP;
    }
    contentH += gridH;
  }
  h += CARD_INNER_PAD * 2 + contentH;
  return h;
}

// ===================== 六、七宫格高度计算 =====================
function calcGridHeight(ctx, targetW, gridData, gridKind, footerText, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  const items = getValidGridItems(gridData, gridKind);
  const coverW = getGridCoverW(gridKind);
  const labelLineH = GRID_LABEL_SIZE * 1.4;
  if (items.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + GRID_GAP) / (coverW + GRID_GAP)));
    const rows = Math.ceil(items.length / cols);
    for (let r = 0; r < rows; r++) {
      let rowMaxH = 0;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= items.length) break;
        const item = items[idx];
        const coverH = getGridCoverH(item, gridKind, imageCache);
        const labelText = item.label || (gridKind === 'game' ? (item.gameName || '') : (item.charName || ''));
        const labelH = measureCenteredTextHeight(ctx, labelText, coverW, labelLineH, GRID_LABEL_SIZE);
        const cellH = coverH + GRID_LABEL_GAP + Math.max(labelH, labelLineH);
        rowMaxH = Math.max(rowMaxH, cellH);
      }
      contentH += rowMaxH;
      if (r < rows - 1) contentH += GRID_GAP;
    }
  }
  if ((footerText || '').trim()) {
    if (items.length > 0) contentH += GRID_FOOTER_GAP;
    const textSize = config.customTextFontSize || 16;
    const boxInnerW = innerW - FOOTER_PAD * 2;
    const textH = measureWrappedHeight(ctx, footerText, boxInnerW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    const textBoxH = Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
    contentH += FOOTER_PAD * 2 + OTHER_SECTION_TITLE_SIZE + FOOTER_TITLE_GAP + textBoxH;
  }
  h += CARD_INNER_PAD * 2 + contentH;
  return h;
}

// ===================== 绘制函数 =====================
function drawBigTitle(painter, targetW, config, annualData) {
  const titleAreaH = getBodyPad() + TITLE_SIZE + getTitleMb();
  const titleY = (titleAreaH - TITLE_SIZE) / 2;
  let titleText;
  if (config.useSummaryTitle) {
    titleText = 'Otome Summary Report';
  } else {
    // 标题年份固定取当前系统年份，不受数据统计中 reportYear 输入框影响
    const year = String(new Date().getFullYear());
    titleText = `${year} Otome Annual Report`;
  }
  painter.drawTextCenter(titleText, targetW / 2, titleY, TITLE_SIZE, config.title || '#b33a3a', 'sans-serif', true);
  if (config.reporterName && String(config.reporterName).trim()) {
    const reporterText = '填表人：' + String(config.reporterName).trim();
    const reporterSize = 16;
    const reporterY = titleY + TITLE_SIZE + 4;
    const ctx = painter.ctx;
    ctx.save();
    ctx.font = 'bold ' + reporterSize + 'px ' + FONT_SIYUAN;
    ctx.fillStyle = config.reporterColor || '#b33a3a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(reporterText, targetW - getBodyPad(), reporterY);
    ctx.restore();
  }
  painter.y = titleAreaH;
}

function drawModuleTitle(painter, centerX, y, title, config) {
  painter.drawTextCenter(title, centerX, y, MODULE_TITLE_SIZE, config.subtitle || '#b85878', FONT_SIYUAN, true);
}

function drawCoverCard(painter, x, y, cardW, cardH, img, srcUrl, radius) {
  painter.drawRoundRect(x, y, cardW, cardH, SUB_CARD_RADIUS, '#ffffff', SUB_CARD_BORDER, 1);
  if (img) {
    const imgX = x + COVER_CARD_PAD;
    const imgY = y + COVER_CARD_PAD;
    const imgW = cardW - COVER_CARD_PAD * 2;
    const imgH = cardH - COVER_CARD_PAD * 2;
    const ctx = painter.ctx;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.moveTo(imgX + radius, imgY);
      ctx.lineTo(imgX + imgW - radius, imgY);
      ctx.quadraticCurveTo(imgX + imgW, imgY, imgX + imgW, imgY + radius);
      ctx.lineTo(imgX + imgW, imgY + imgH - radius);
      ctx.quadraticCurveTo(imgX + imgW, imgY + imgH, imgX + imgW - radius, imgY + imgH);
      ctx.lineTo(imgX + radius, imgY + imgH);
      ctx.quadraticCurveTo(imgX, imgY + imgH, imgX, imgY + imgH - radius);
      ctx.lineTo(imgX, imgY + radius);
      ctx.quadraticCurveTo(imgX, imgY, imgX + radius, imgY);
      ctx.closePath();
      ctx.clip();
      const resInfo = rawImageResourceCache.get(srcUrl);
      const drawTarget = resInfo?.type === 'image' ? resInfo.data : img;
      ctx.drawImage(drawTarget, imgX, imgY, imgW, imgH);
    } finally {
      ctx.restore();
    }
  }
}

function drawTextBox(painter, x, y, boxW, boxH, text, config, noBorder, centerText) {
  painter.drawRoundRect(x, y, boxW, boxH, SUB_CARD_RADIUS, '#ffffff',
    noBorder ? null : (config.customborder || '#eee'), noBorder ? 0 : 1);
  if (text) {
    const textSize = config.customTextFontSize || 16;
    if (centerText) {
      drawCenteredText(painter.ctx, text, x + boxW / 2, y + TEXT_BOX_PAD,
        boxW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize,
        config.customtext || '#c98fac', false);
    } else {
      wrapText(
        painter.ctx, text,
        x + TEXT_BOX_PAD, y + TEXT_BOX_PAD,
        boxW - TEXT_BOX_PAD * 2,
        textSize * 1.55, textSize,
        config.customtext || '#c98fac'
      );
    }
  }
}

// ===================== 新增辅助函数 =====================
function drawCenteredText(ctx, text, centerX, y, maxWidth, lineHeight, fontSize, color, bold) {
  if (!text) return 0;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_SIYUAN}`;
  ctx.fillStyle = color;
  // ✅修复：与 wrapText 保持一致，行空隙上限12px，避免调大字号后模块五行间距与其他模块不一致
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  const lines = [];
  for (let n = 0; n < chars.length; n++) {
    const ch = chars[n];
    // ✅新增：遇到手动换行符 \n 时强制换行
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    // ✅新增：遇到 \r 时强制换行，兼容 \r\n
    if (ch === '\r') {
      if (chars[n + 1] === '\n') {
        n++;
      }
      lines.push(line);
      line = '';
      continue;
    }
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width;
    ctx.fillText(l, centerX - w / 2, y + i * safeLineHeight);
  });
  return lines.length * safeLineHeight;
}

function measureCenteredTextHeight(ctx, text, maxWidth, lineHeight, fontSize) {
  if (!text) return 0;
  ctx.font = `bold ${fontSize}px ${FONT_SIYUAN}`;
  // ✅修复：与 measureWrappedHeight 保持一致，行空隙上限12px，确保测高与绘制行数一致
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  let lines = 1;
  for (let n = 0; n < chars.length; n++) {
    const ch = chars[n];
    // ✅新增：遇到手动换行符 \n 时强制换行
    if (ch === '\n') {
      lines++;
      line = '';
      continue;
    }
    // ✅新增：遇到 \r 时强制换行，兼容 \r\n
    if (ch === '\r') {
      if (chars[n + 1] === '\n') {
        n++;
      }
      lines++;
      line = '';
      continue;
    }
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines++;
      line = ch;
    } else {
      line += ch;
    }
  }
  return lines * safeLineHeight;
}

function getGridCoverW(gridKind) {
  return gridKind === 'game' ? GAME_COVER_W : CHAR_COVER_SIZE;
}

function getGridCoverH(item, gridKind, imageCache) {
  if (gridKind === 'game') {
    const src = toCanvasUrl(item.coverSrc);
    const img = src ? imageCache.get(src) : null;
    return calcGameCoverHeight(img);
  }
  return CHAR_COVER_SIZE;
}

function buildStatsParts(annualData) {
  const parts = [];
  for (const [key, label] of STAT_LABELS) {
    const val = annualData[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      parts.push({ label: `${label}：`, value: String(val).trim() });
    }
  }
  return parts;
}

// ========== drawStatsContent：绘制底图+文字 ==========
function drawStatsContent(painter, x, y, innerW, annualData, config, imageCache) {
  const parts = getStatsParts(annualData);
  if (parts.length === 0) return;
  const bgInfo = STATS_BG_CONFIG[parts.join('')];
  if (!bgInfo) return;
  const ctx = painter.ctx;
  const bgUrl = toCanvasUrl(bgInfo.file);
  const bgImg = bgUrl ? imageCache.get(bgUrl) : null;
  const dims = getImgSize(bgImg);
  if (dims.w <= 0 || dims.h <= 0) return;
  const drawW = innerW;
  const drawH = Math.round(innerW * dims.h / dims.w);
  const resInfo = rawImageResourceCache.get(bgUrl);
  const drawTarget = (resInfo && resInfo.data) ? resInfo.data : bgImg;
  ctx.save();
  ctx.beginPath();
  const r = CARD_RADIUS;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + drawW - r, y);
  ctx.quadraticCurveTo(x + drawW, y, x + drawW, y + r);
  ctx.lineTo(x + drawW, y + drawH - r);
  ctx.quadraticCurveTo(x + drawW, y + drawH, x + drawW - r, y + drawH);
  ctx.lineTo(x + r, y + drawH);
  ctx.quadraticCurveTo(x, y + drawH, x, y + drawH - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(drawTarget, x, y, drawW, drawH);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = CARD_BORDER_W;
  ctx.strokeStyle = config.border || '#f6a5b8';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + drawW - r, y);
  ctx.quadraticCurveTo(x + drawW, y, x + drawW, y + r);
  ctx.lineTo(x + drawW, y + drawH - r);
  ctx.quadraticCurveTo(x + drawW, y + drawH, x + drawW - r, y + drawH);
  ctx.lineTo(x + r, y + drawH);
  ctx.quadraticCurveTo(x, y + drawH, x, y + drawH - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  const valueColor = config.statdata || '#b33a3a';
  const labelColor = config.stattext || '#b85878';
  for (const part of parts) {
    const box = bgInfo.boxes[part];
    if (!box) continue;
    const boxX = x + drawW * box.l;
    const boxY = y + drawH * box.t;
    const boxW = drawW * (box.r - box.l);
    const boxH = drawH * (box.b - box.t);
    const segments = buildStatPartSegments(part, annualData);
    drawStatPartCentered(ctx, segments, boxX, boxY, boxW, boxH,
      STAT_VALUE_SIZE, STAT_LABEL_SIZE, STAT_LINE_HEIGHT, valueColor, labelColor);
  }
}

function drawTopItem(painter, targetW, item, itemType, imageCache, config) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  const contentX = wrapX + CARD_INNER_PAD;
  const ctx = painter.ctx;

  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${NO_SIZE}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const nameX = contentX + noW + 12;
  const nameMaxW = innerW - noW - 12;
  const nameH = measureWrappedHeight(ctx, nameText, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, true);
  const noLineH = NO_SIZE * 1.3;
  const rowH = Math.max(noLineH, nameH);
  const nameTopY = painter.y + (rowH - nameH) / 2;
  wrapText(ctx, noText, contentX, nameTopY, noW + 10, NAME_SIZE * 1.3, NAME_SIZE, config.subtitle || '#b85878', FONT_SIYUAN, true);
  wrapText(ctx, nameText, nameX, nameTopY, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, config.gamename || '#000000', FONT_SIYUAN, true);
  painter.shiftY(rowH + LABEL_ROW_MB);

  const contentY = painter.y;
  let coverCardW, coverCardH, coverImg, coverSrc;

  if (itemType === 'game') {
    coverSrc = toCanvasUrl(item.coverSrc);
    coverImg = coverSrc ? imageCache.get(coverSrc) : null;
    const imgH = calcGameCoverHeight(coverImg);
    coverCardW = GAME_COVER_W + COVER_CARD_PAD * 2;
    coverCardH = imgH + COVER_CARD_PAD * 2;
    drawCoverCard(painter, contentX, contentY, coverCardW, coverCardH, coverImg, coverSrc, 6);
  } else if (itemType === 'char') {
    coverSrc = toCanvasUrl(item.coverSrc);
    coverImg = coverSrc ? imageCache.get(coverSrc) : null;
    coverCardW = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
    coverCardH = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
    drawCoverCard(painter, contentX, contentY, coverCardW, coverCardH, coverImg, coverSrc, 6);
  } else {
    const fSrc = toCanvasUrl(item.femaleCoverSrc);
    const mSrc = toCanvasUrl(item.maleCoverSrc);
    const fImg = fSrc ? imageCache.get(fSrc) : null;
    const mImg = mSrc ? imageCache.get(mSrc) : null;
    coverCardW = (CP_COVER_SIZE + COVER_CARD_PAD * 2) * 2 + CP_GAP;
    coverCardH = CP_COVER_SIZE + COVER_CARD_PAD * 2;
    drawCoverCard(painter, contentX, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, fImg, fSrc, 6);
    drawCoverCard(painter, contentX + CP_COVER_SIZE + COVER_CARD_PAD * 2 + CP_GAP, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, mImg, mSrc, 6);
  }

  const text = (item.text || '').trim();
  let finalTextBoxH = 0;
  if (text) {
    const textX = contentX + coverCardW + COVER_TEXT_GAP;
    const textW = innerW - coverCardW - COVER_TEXT_GAP;
    const textSize = config.customTextFontSize || 16;
    const textH = measureWrappedHeight(ctx, text, textW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    finalTextBoxH = textH + TEXT_BOX_PAD * 2;
    drawTextBox(painter, textX, contentY, textW, finalTextBoxH, text, config);
  }
  painter.shiftY(Math.max(coverCardH, finalTextBoxH));
}

// ===================== 五、其他模块绘制 =====================
function drawOtherContent(painter, targetW, annualData, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  const contentX = wrapX + CARD_INNER_PAD;
  const ctx = painter.ctx;
  const o = annualData.other || {};
  const labelColor = config.labelColor || config.subtitle || '#b85878';
  const alsoList = o.alsoPlayed || [];
  if (alsoList.length > 0) {
    drawCenteredText(ctx, '还玩了', contentX + innerW / 2, painter.y, innerW,
      OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE, labelColor, true);
    painter.shiftY(OTHER_SECTION_TITLE_SIZE + 12);
    const coverW = OTHER_ALSO_COVER_W;
    const cols = Math.max(1, Math.floor((innerW + OTHER_ALSO_COVER_GAP) / (coverW + OTHER_ALSO_COVER_GAP)));
    const rows = Math.ceil(alsoList.length / cols);
    for (let r = 0; r < rows; r++) {
      const rowStart = r * cols;
      const rowCount = Math.min(cols, alsoList.length - rowStart);
      const rowTotalW = rowCount * coverW + (rowCount - 1) * OTHER_ALSO_COVER_GAP;
      const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
      let rowMaxH = 0;
      for (let c = 0; c < rowCount; c++) {
        const idx = rowStart + c;
        const img = imageCache.get(toCanvasUrl(alsoList[idx].coverSrc));
        rowMaxH = Math.max(rowMaxH, calcGameCoverHeight(img));
      }
      for (let c = 0; c < rowCount; c++) {
        const idx = rowStart + c;
        const x = contentX + rowOffset + c * (coverW + OTHER_ALSO_COVER_GAP);
        const y = painter.y;
        const src = toCanvasUrl(alsoList[idx].coverSrc);
        const img = src ? imageCache.get(src) : null;
        const coverH = calcGameCoverHeight(img);
        drawCoverCard(painter, x, y, coverW, coverH, img, src, 6);
      }
      painter.shiftY(rowMaxH);
      if (r < rows - 1) painter.shiftY(OTHER_ALSO_COVER_GAP);
    }
    painter.shiftY(OTHER_SECTION_GAP);
  }
  const cards = getOtherCards(annualData);
  if (cards.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + OTHER_CARD_GAP) / (OTHER_CARD_W + OTHER_CARD_GAP)));
    const rows = Math.ceil(cards.length / cols);
    const textSize = config.customTextFontSize || 16;
    const rowHeights = [];
    for (let r = 0; r < rows; r++) {
      let rowMax = 0;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= cards.length) continue;
        const card = cards[idx];
        // ✅修复：与 calcOtherHeight 保持一致，标题高度动态测量
        const titleMaxW = OTHER_CARD_W - OTHER_CARD_PAD * 2;
        const titleActualH = measureCenteredTextHeight(ctx, card.title || '', titleMaxW, OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE);
        let ch = OTHER_CARD_PAD * 2 + titleActualH + OTHER_CARD_TITLE_MB;
        if (card.type === 'cp') ch += OTHER_CP_COVER_SIZE;
        else if (card.type === 'support' || card.type === 'heroine' || card.type === 'customChar') ch += OTHER_SUPPORT_COVER_SIZE;
        else {
          const textAreaW = OTHER_CARD_W - OTHER_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, textSize * 1.55, textSize);
          ch += Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
        }
        rowMax = Math.max(rowMax, ch);
      }
      rowHeights.push(rowMax);
    }
    for (let r = 0; r < rows; r++) {
      const rowH = rowHeights[r];
      const rowStart = r * cols;
      const rowCount = Math.min(cols, cards.length - rowStart);
      const rowTotalW = rowCount * OTHER_CARD_W + (rowCount - 1) * OTHER_CARD_GAP;
      const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
      for (let c = 0; c < rowCount; c++) {
        const idx = rowStart + c;
        const card = cards[idx];
        const x = contentX + rowOffset + c * (OTHER_CARD_W + OTHER_CARD_GAP);
        const y = painter.y;
        painter.drawRoundRect(x, y, OTHER_CARD_W, rowH, 12, config.boxBgColor || '#fff7f9', '#eee', 1);
        const titleY = y + OTHER_CARD_PAD;
        // ✅修复：drawCenteredText 返回实际绘制高度（含自动换行），下方内容从标题底部开始
        const titleActualH = drawCenteredText(ctx, card.title, x + OTHER_CARD_W / 2, titleY,
          OTHER_CARD_W - OTHER_CARD_PAD * 2, OTHER_SECTION_TITLE_SIZE * 1.4,
          OTHER_SECTION_TITLE_SIZE, labelColor, true);
        const contentY = titleY + titleActualH + OTHER_CARD_TITLE_MB;
        if (card.type === 'cp') {
          const fSrc = toCanvasUrl(card.data.femaleCoverSrc);
          const mSrc = toCanvasUrl(card.data.maleCoverSrc);
          const fImg = fSrc ? imageCache.get(fSrc) : null;
          const mImg = mSrc ? imageCache.get(mSrc) : null;
          const totalW = OTHER_CP_COVER_SIZE * 2 + CP_GAP;
          const startX = x + (OTHER_CARD_W - totalW) / 2;
          drawCoverCard(painter, startX, contentY, OTHER_CP_COVER_SIZE, OTHER_CP_COVER_SIZE, fImg, fSrc, 6);
          drawCoverCard(painter, startX + OTHER_CP_COVER_SIZE + CP_GAP, contentY, OTHER_CP_COVER_SIZE, OTHER_CP_COVER_SIZE, mImg, mSrc, 6);
        } else if (card.type === 'support' || card.type === 'heroine' || card.type === 'customChar') {
          const src = toCanvasUrl(card.data.coverSrc);
          const img = src ? imageCache.get(src) : null;
          const sx = x + (OTHER_CARD_W - OTHER_SUPPORT_COVER_SIZE) / 2;
          drawCoverCard(painter, sx, contentY, OTHER_SUPPORT_COVER_SIZE, OTHER_SUPPORT_COVER_SIZE, img, src, 6);
        } else {
          const textAreaW = OTHER_CARD_W - OTHER_CARD_PAD * 2;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
          // ✅修复：白框高度填满卡片剩余空间（从contentY到卡片底部内边距），
          // 当同行卡片因自定义标签换行而拉长对齐时，白框也相应拉长，避免底部留白
          const availableH = (y + rowH - OTHER_CARD_PAD) - contentY;
          const boxH = Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2, availableH);
          drawTextBox(painter, x + OTHER_CARD_PAD, contentY, textAreaW, boxH, card.text || '', config, true, true);
        }
      }
      painter.shiftY(rowH);
      if (r < rows - 1) painter.shiftY(OTHER_CARD_GAP);
    }
  }
}

// ===================== 六、七宫格绘制 =====================
function drawGridContent(painter, targetW, items, gridKind, footerLabel, footerText, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  const contentX = wrapX + CARD_INNER_PAD;
  const ctx = painter.ctx;
  const labelColor = config.labelColor || config.subtitle || '#b85878';
  const coverW = getGridCoverW(gridKind);
  const labelLineH = GRID_LABEL_SIZE * 1.4;
  if (items.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + GRID_GAP) / (coverW + GRID_GAP)));
    const rows = Math.ceil(items.length / cols);
    for (let r = 0; r < rows; r++) {
      const rowStart = r * cols;
      const rowCount = Math.min(cols, items.length - rowStart);
      const rowTotalW = rowCount * coverW + (rowCount - 1) * GRID_GAP;
      const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
      let rowMaxH = 0;
      let rowMaxCoverH = 0;  // ✅新增：记录该行最大封面高度，用于标签位置统一对齐
      const cellHeights = [];
      for (let c = 0; c < rowCount; c++) {
        const idx = rowStart + c;
        const item = items[idx];
        const covH = getGridCoverH(item, gridKind, imageCache);
        rowMaxCoverH = Math.max(rowMaxCoverH, covH);
        const labelText = item.label || (gridKind === 'game' ? (item.gameName || '') : (item.charName || ''));
        const labH = measureCenteredTextHeight(ctx, labelText, coverW, labelLineH, GRID_LABEL_SIZE);
        const cellH = covH + GRID_LABEL_GAP + Math.max(labH, labelLineH);
        cellHeights.push(cellH);
        rowMaxH = Math.max(rowMaxH, cellH);
      }
      for (let c = 0; c < rowCount; c++) {
        const idx = rowStart + c;
        const item = items[idx];
        const x = contentX + rowOffset + c * (coverW + GRID_GAP);
        const y = painter.y;
        const covH = getGridCoverH(item, gridKind, imageCache);
        const src = toCanvasUrl(item.coverSrc);
        const img = src ? imageCache.get(src) : null;
        drawCoverCard(painter, x, y, coverW, covH, img, src, 6);
        const labelText = item.label || (gridKind === 'game' ? (item.gameName || '') : (item.charName || ''));
        // ✅修复：标签Y坐标统一对齐到该行最高封面底部，而非各自封面底部
        const labelY = y + rowMaxCoverH + GRID_LABEL_GAP;
        drawCenteredText(ctx, labelText, x + coverW / 2, labelY, coverW,
          labelLineH, GRID_LABEL_SIZE, labelColor, true);
      }
      painter.shiftY(rowMaxH);
      if (r < rows - 1) painter.shiftY(GRID_GAP);
    }
  }
  if ((footerText || '').trim()) {
    if (items.length > 0) painter.shiftY(GRID_FOOTER_GAP);
    const textSize = config.customTextFontSize || 16;
    const boxInnerW = innerW - FOOTER_PAD * 2;
    const textH = measureWrappedHeight(ctx, footerText, boxInnerW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    const textBoxH = Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
    const outerBoxH = FOOTER_PAD * 2 + OTHER_SECTION_TITLE_SIZE + FOOTER_TITLE_GAP + textBoxH;
    painter.drawRoundRect(contentX, painter.y, innerW, outerBoxH, 12, config.boxBgColor || '#fff7f9', '#eee', 1);
    const titleY = painter.y + FOOTER_PAD;
    drawCenteredText(ctx, footerLabel, contentX + innerW / 2, titleY, innerW - FOOTER_PAD * 2,
      OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE, labelColor, true);
    const boxY = titleY + OTHER_SECTION_TITLE_SIZE + FOOTER_TITLE_GAP;
    drawTextBox(painter, contentX + FOOTER_PAD, boxY, boxInnerW, textBoxH, footerText, config, true);
    painter.shiftY(outerBoxH);
  }
}

// ===================== 主入口：单模块导出 =====================
export async function renderAnnualModuleCanvas(designW, moduleType, moduleTitle, annualData, config, dpr) {
  DPR = dpr || 2;
  setCurrentDPR(DPR);
  if (IS_IOS_WEBKIT) {
    for (const [, res] of rawImageResourceCache.entries()) {
      if (res?.type === 'bitmap' && res.data && typeof res.data.close === 'function') {
        try { res.data.close(); } catch (e) {}
      }
    }
    roundImageCache.clear();
    rawImageResourceCache.clear();
  }

  if (moduleType === 'stats') {
    if (getStatsParts(annualData).length === 0) return null;
  } else if (moduleType === 'other') {
    if (!hasOtherContent(annualData)) return null;
  } else if (moduleType === 'gameGrid') {
    if (!hasGridContent(annualData.gameGrid, 'game', annualData.gameGrid?.nextYearExpect)) return null;
  } else if (moduleType === 'charGrid') {
    if (!hasGridContent(annualData.charGrid, 'char', annualData.charGrid?.extraThoughts)) return null;
  } else {
    const validItems = getValidItems(moduleType, annualData);
    if (validItems.length === 0) return null;
  }

  emitRenderProgress(5);

  let imageUrls = collectModuleImages(moduleType, annualData);
  const SAFE_URL_PATTERN = /^(http|https):\/\//;
  const BLOCK_RAW_PATTERN = /raw\.githubusercontent\.com/;
  const BLOCK_R2_PUB_PATTERN = /^https:\/\/pub-/;
  imageUrls = imageUrls.filter(src => {
    if (!src) return false;
    if (!SAFE_URL_PATTERN.test(src)) return false;
    if (BLOCK_R2_PUB_PATTERN.test(src)) return false;
    if (BLOCK_RAW_PATTERN.test(src)) return false;
    return true;
  });
  imageUrls = [...new Set(imageUrls)];
  const loadRet = await loadImagesWithLimit(imageUrls, MAX_IMAGE_CONCURRENCY);
  const imageCache = loadRet.resultMap;

  await new Promise(r => setTimeout(r, 30));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  emitRenderProgress(65);

  const vCanvas = document.createElement('canvas');
  const vCtx = vCanvas.getContext('2d');
  const totalH = moduleType === 'stats'
    ? calcStatsHeight(vCtx, designW, annualData, config, imageCache)
    : calcModuleHeight(vCtx, designW, moduleType, moduleTitle, annualData, config, imageCache);
  vCanvas.width = 0; vCanvas.height = 0;

  if (IS_IOS_WEBKIT) {
    const totalPixel = (designW * DPR) * (totalH * DPR);
    if (totalPixel > 32 * 1024 * 1024) {
      console.warn(`⚠️ annual IOS画布像素超限风险：${totalPixel}，模块=${moduleType}，可能toBlob返回null`);
    }
  }
  const canvasHeight = totalH + getBodyPad();
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, canvasHeight, config.bg || '#fff7f9');

  drawBigTitle(painter, designW, config, annualData);

  const wrapW = getWrapW(designW);
  const wrapX = getWrapX(designW, wrapW);
  const cardTop = painter.y;
  const cardInnerW = wrapW - CARD_INNER_PAD * 2;

  let cardContentH = 0;
  if (moduleType === 'other') {
    const totalH = calcOtherHeight(painter.ctx, designW, annualData, config, imageCache);
    cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_INNER_PAD * 2;
  } else if (moduleType === 'gameGrid' || moduleType === 'charGrid') {
    const gridData = moduleType === 'gameGrid' ? annualData.gameGrid : annualData.charGrid;
    const gridKind = moduleType === 'gameGrid' ? 'game' : 'char';
    const footer = moduleType === 'gameGrid' ? annualData.gameGrid?.nextYearExpect : annualData.charGrid?.extraThoughts;
    const totalH = calcGridHeight(painter.ctx, designW, gridData, gridKind, footer, config, imageCache);
    cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_INNER_PAD * 2;
  } else {
    if (moduleTitle && moduleType !== 'stats') {
      cardContentH += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
    }
    if (moduleType === 'stats') {
      const parts = getStatsParts(annualData);
      if (parts.length > 0) {
        const bgInfo = STATS_BG_CONFIG[parts.join('')];
        if (bgInfo) {
          const bgUrl = toCanvasUrl(bgInfo.file);
          const bgImg = bgUrl ? imageCache.get(bgUrl) : null;
          const dims = getImgSize(bgImg);
          if (dims.w > 0 && dims.h > 0) {
            cardContentH += Math.round(wrapW * dims.h / dims.w);
          } else {
            cardContentH += 300;
          }
        }
      }
    } else {
      const items = getValidItems(moduleType, annualData);
      const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
      items.forEach((item, i) => {
        item._no = i;
        cardContentH += calcTopItemHeight(painter.ctx, designW, item, itemType, config, imageCache);
        if (i < items.length - 1) cardContentH += ITEM_GAP;
      });
    }
  }

  const cardH = (moduleType === 'stats') ? cardContentH : (CARD_INNER_PAD * 2 + cardContentH);

  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', CARD_BORDER_W);

  let contentY = cardTop + CARD_INNER_PAD;
  if (moduleTitle && moduleType !== 'other' && moduleType !== 'stats') {
    drawModuleTitle(painter, wrapX + wrapW / 2, contentY, moduleTitle, config);
    contentY += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  }

  if (moduleType === 'stats') {
    drawStatsContent(painter, wrapX, cardTop, wrapW, annualData, config, imageCache);
    painter.y = cardTop + cardH;
  } else if (moduleType === 'other') {
    painter.y = cardTop + CARD_INNER_PAD;
    drawOtherContent(painter, designW, annualData, config, imageCache);
    painter.shiftY(CARD_INNER_PAD);
  } else if (moduleType === 'gameGrid' || moduleType === 'charGrid') {
    const gridData = moduleType === 'gameGrid' ? annualData.gameGrid : annualData.charGrid;
    const gridKind = moduleType === 'gameGrid' ? 'game' : 'char';
    const footer = moduleType === 'gameGrid' ? annualData.gameGrid?.nextYearExpect : annualData.charGrid?.extraThoughts;
    const footerLabel = moduleType === 'gameGrid' ? '明年最期待' : '还想说';
    const items = getValidGridItems(gridData, gridKind);
    painter.y = contentY;
    drawGridContent(painter, designW, items, gridKind, footerLabel, footer, config, imageCache);
    painter.shiftY(CARD_INNER_PAD);
  } else {
    const items = getValidItems(moduleType, annualData);
    const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
    painter.y = contentY;
    items.forEach((item, i) => {
      item._no = i;
      drawTopItem(painter, designW, item, itemType, imageCache, config);
      if (i < items.length - 1) painter.shiftY(ITEM_GAP);
      emitRenderProgress(65 + ((i + 1) / items.length) * 30);
    });
    painter.shiftY(CARD_INNER_PAD);
  }

  emitRenderProgress(100);

  const finalH = painter.getY() + getBodyPad();
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = designW * DPR;
  outputCanvas.height = Math.max(finalH, designW * 0.4) * DPR;
  const oCtx = outputCanvas.getContext('2d');
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = "high";
  oCtx.fillStyle = config.bg || '#fff7f9';
  oCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  oCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

  let blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png', 1));
  if (IS_IOS_WEBKIT && !blob) {
    await new Promise(r => setTimeout(r, 100));
    blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png', 1));
  }

  if (IS_IOS_WEBKIT) {
    canvas.width = 0; canvas.height = 0;
    outputCanvas.width = 0; outputCanvas.height = 0;
  }
  return blob;
}

// ===================== 批量导出所有模块 =====================
export async function renderAllAnnualModules(designW, annualData, config, titleMap, dpr) {
  const modules = [
    { type: 'stats', title: titleMap?.stats || '' },
    { type: 'gameTop', title: titleMap?.gameTop || 'ゲームTOP' },
    { type: 'charTop', title: titleMap?.charTop || 'キャラTOP' },
    { type: 'cpTop', title: titleMap?.cpTop || 'カップルTOP' },
    { type: 'other', title: '' },
    { type: 'gameGrid', title: titleMap?.gameGrid || 'ゲーム宫格' },
    { type: 'charGrid', title: titleMap?.charGrid || 'キャラ宫格' },
  ];
  const results = [];
  for (const mod of modules) {
    const blob = await renderAnnualModuleCanvas(designW, mod.type, mod.title, annualData, config, dpr);
    if (blob) {
      results.push({ moduleType: mod.type, moduleTitle: mod.title, blob });
    }
  }
  return results;
}

if (typeof window !== 'undefined') {
  window.renderAnnualModuleCanvas = renderAnnualModuleCanvas;
  window.renderAllAnnualModules = renderAllAnnualModules;
}
