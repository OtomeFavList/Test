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
import { wrapText, measureWrappedHeight, CanvasLayoutPainter } from './export-canvas-render.js';

// ===================== 常量 =====================
const MAX_IMAGE_CONCURRENCY = 4;
const FONT_SIYUAN = "Noto Sans SC, sans-serif";
const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const DPR = 2;
const WRAP_MAX_W = 1200;

// ---- 固定尺寸（对齐FavList，不随宽度等比缩放）----
const TITLE_SIZE = 42;                 // 大标题（对齐FavList）
const MODULE_TITLE_SIZE = 24;          // 模块小标题（对齐FavList"基础信息"24px）
const NO_SIZE = 22;                    // NO.标签
const NAME_SIZE = 22;                  // 游戏/角色/CP名称
const STAT_SIZE = 16;                  // 统计文字
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
const OTHER_SECTION_TITLE_SIZE = 16;   // "还玩了"等区域标题字号
const OTHER_CARD_W = 200;              // 其他模块卡片宽度
const OTHER_CARD_GAP = 16;             // 其他模块卡片间距
const OTHER_CARD_PAD = 14;             // 其他模块卡片内边距
const OTHER_CARD_TITLE_MB = 10;        // 卡片标题底部间距
const OTHER_ALSO_COVER_W = 100;        // "还玩了"封面宽度
const OTHER_ALSO_COVER_GAP = 16;       // "还玩了"封面间距
const OTHER_CP_COVER_SIZE = 80;        // 最喜欢的CP封面尺寸
const OTHER_SUPPORT_COVER_SIZE = 90;   // 最喜欢的配角封面尺寸
const OTHER_TEXT_BOX_MIN_H = 80;       // 其他模块文本框最小高度
const OTHER_SECTION_GAP = 20;          // "还玩了"区域与卡片区间距
// ========== 六、七宫格模块 ==========
const GRID_CELL_W = 140;               // 宫格单元格宽度
const GRID_CELL_H = 140;               // 宫格单元格高度（角色）
const GRID_GAME_CELL_H = 186;          // 游戏宫格单元格高度（竖版）
const GRID_GAP = 16;                   // 宫格间距
const GRID_LABEL_SIZE = 15;            // 宫格标签字号
const GRID_LABEL_GAP = 8;              // 封面与标签间距
const GRID_FOOTER_GAP = 20;            // 宫格与底部文本框间距
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
    // 还玩了
    safeEach(annualData.other?.alsoPlayed, item => pushUrl(item.coverSrc));
    // 最喜欢的CP
    const cp = annualData.other?.favCp;
    if (cp && cp.femaleId && cp.maleId) { pushUrl(cp.femaleCoverSrc); pushUrl(cp.maleCoverSrc); }
    // 最喜欢的配角
    const sup = annualData.other?.favSupport;
    if (sup && sup.charId) pushUrl(sup.coverSrc);
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
  if (o.favCp && o.favCp.femaleId && o.favCp.maleId) {
    cards.push({ type: 'cp', title: '最喜欢的CP', data: o.favCp });
  }
  if (o.favSupport && o.favSupport.charId) {
    cards.push({ type: 'support', title: '最喜欢的配角', data: o.favSupport });
  }
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
function calcStatsHeight(ctx, targetW, annualData, config) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  // ✅修复：CanvasLayoutPainter从y=BODY_PADDING开始绘制，画布高度必须包含顶部边距，否则底部内容超出画布被裁
  let h = getBodyPad() + TITLE_SIZE + getTitleMb(); // 大标题（含顶部边距）
  // 模块卡片
  let contentH = MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  const statsText = buildStatsText(annualData);
  if (statsText) {
    contentH += measureWrappedHeight(ctx, statsText, innerW, STAT_SIZE * 1.8, STAT_SIZE);
  }
  h += CARD_INNER_PAD * 2 + contentH;
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
  // ✅NO行高使用 NO_SIZE*1.3（与名称行高一致），不再用裸NO_SIZE=22
  const noLineH = NO_SIZE * 1.3;
  h += Math.max(noLineH, nameH) + LABEL_ROW_MB;

  // ---- 封面 + 感想行 ----
  let coverH; // 封面卡片总高度（含内边距）
  let coverAreaW;
  if (itemType === 'game') {
    const img = imageCache.get(toCanvasUrl(item.coverSrc));
    coverH = calcGameCoverHeight(img) + COVER_CARD_PAD * 2;
    coverAreaW = GAME_COVER_W + COVER_CARD_PAD * 2;
  } else if (itemType === 'char') {
    coverH = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
    coverAreaW = CHAR_COVER_SIZE + COVER_CARD_PAD * 2;
  } else { // cp
    coverH = CP_COVER_SIZE + COVER_CARD_PAD * 2;
    coverAreaW = (CP_COVER_SIZE + COVER_CARD_PAD * 2) * 2 + CP_GAP;  // ✅修复：两张卡片各含左右内边距
  }
  // 感想框（仅当有文字时计算）
  let textBoxH = 0;
  const text = (item.text || '').trim();
  if (text) {
    const textAreaW = innerW - coverAreaW - COVER_TEXT_GAP;  // ✅统一间距常量
    const textSize = config.customTextFontSize || 16;
    const textH = measureWrappedHeight(ctx, text, textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    textBoxH = textH + TEXT_BOX_PAD * 2;
  }

  h += Math.max(coverH, textBoxH);
  return h;
}

function calcModuleHeight(ctx, targetW, moduleType, moduleTitle, annualData, config, imageCache) {
  // 五、其他模块独立计算（无模块标题）
  if (moduleType === 'other') {
    return calcOtherHeight(ctx, targetW, annualData, config, imageCache);
  }
  // 六、七宫格独立计算
  if (moduleType === 'gameGrid') {
    return calcGridHeight(ctx, targetW, annualData.gameGrid, 'game', annualData.gameGrid?.nextYearExpect, config);
  }
  if (moduleType === 'charGrid') {
    return calcGridHeight(ctx, targetW, annualData.charGrid, 'char', annualData.charGrid?.extraThoughts, config);
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
  let h = getBodyPad() + TITLE_SIZE + getTitleMb(); // 大标题
  let contentH = 0;
  const o = annualData.other || {};

  // ---- "还玩了"区域 ----
  const alsoList = o.alsoPlayed || [];
  if (alsoList.length > 0) {
    contentH += OTHER_SECTION_TITLE_SIZE + 12; // 标题+底部间距
    // 封面横向排列，自动换行
    const cols = Math.max(1, Math.floor((innerW + OTHER_ALSO_COVER_GAP) / (OTHER_ALSO_COVER_W + OTHER_ALSO_COVER_GAP)));
    const rows = Math.ceil(alsoList.length / cols);
    // 计算每行最大封面高度
    let rowH = 0;
    for (let i = 0; i < alsoList.length; i++) {
      const img = imageCache.get(toCanvasUrl(alsoList[i].coverSrc));
      const coverH = calcGameCoverHeight(img);
      if ((i % cols) === cols - 1 || i === alsoList.length - 1) {
        rowH = Math.max(rowH, coverH);
      }
    }
    // 简化：用第一个封面高度作为行高基准
    const firstImg = imageCache.get(toCanvasUrl(alsoList[0]?.coverSrc));
    const baseCoverH = calcGameCoverHeight(firstImg);
    contentH += rows * baseCoverH + (rows - 1) * OTHER_ALSO_COVER_GAP;
    contentH += OTHER_SECTION_GAP; // 与下方卡片区间距
  }

  // ---- 卡片区域 ----
  const cards = getOtherCards(annualData);
  if (cards.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + OTHER_CARD_GAP) / (OTHER_CARD_W + OTHER_CARD_GAP)));
    const rows = Math.ceil(cards.length / cols);
    const textSize = config.customTextFontSize || 16;
    // 计算每个卡片高度
    const cardHeights = cards.map(card => {
      let ch = OTHER_CARD_PAD * 2 + OTHER_SECTION_TITLE_SIZE + OTHER_CARD_TITLE_MB;
      if (card.type === 'cp') {
        ch += OTHER_CP_COVER_SIZE;
      } else if (card.type === 'support') {
        ch += OTHER_SUPPORT_COVER_SIZE;
      } else {
        // text / custom
        const textAreaW = OTHER_CARD_W - OTHER_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
        const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, textSize * 1.55, textSize);
        ch += Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
      }
      return ch;
    });
    // 每行取最大高度
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
function calcGridHeight(ctx, targetW, gridData, gridKind, footerText, config) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb(); // 大标题
  let contentH = MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16); // 模块标题

  const items = getValidGridItems(gridData, gridKind);
  const cellH = gridKind === 'game' ? GRID_GAME_CELL_H : GRID_CELL_H;
  if (items.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + GRID_GAP) / (GRID_CELL_W + GRID_GAP)));
    const rows = Math.ceil(items.length / cols);
    const labelH = GRID_LABEL_SIZE * 1.4 + GRID_LABEL_GAP;
    contentH += rows * (cellH + labelH) + (rows - 1) * GRID_GAP;
  }

  // 底部文本框
  if ((footerText || '').trim()) {
    if (items.length > 0) contentH += GRID_FOOTER_GAP;
    contentH += OTHER_SECTION_TITLE_SIZE + 10; // "明年最期待"/"还想说"标题
    const textSize = config.customTextFontSize || 16;
    const textAreaW = innerW - OTHER_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
    const textH = measureWrappedHeight(ctx, footerText, textAreaW, textSize * 1.55, textSize);
    contentH += Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2) + OTHER_CARD_PAD * 2;
  }

  h += CARD_INNER_PAD * 2 + contentH;
  return h;
}

// ===================== 绘制函数 =====================
function drawBigTitle(painter, targetW, config, annualData) {
  // ✅大标题在"画布上沿→第一个框上沿"区域内垂直居中，与export逻辑一致
  const titleAreaH = getBodyPad() + TITLE_SIZE + getTitleMb();
  const titleY = (titleAreaH - TITLE_SIZE) / 2;
  // ✅新增：根据 useSummaryTitle 开关决定标题文本
  let titleText;
  if (config.useSummaryTitle) {
    titleText = 'Otome Summary Report';
  } else {
    const year = (annualData && annualData.reportYear && String(annualData.reportYear).trim())
      ? String(annualData.reportYear).trim()
      : String(new Date().getFullYear());
    titleText = `${year} Otome Annual Report`;
  }
  painter.drawTextCenter(titleText, targetW / 2, titleY, TITLE_SIZE, config.title || '#b33a3a', 'sans-serif', true);
  painter.y = titleAreaH;  // 第一个框从区域底部开始，总高度与原逻辑一致
}

function drawModuleTitle(painter, x, y, title, config) {
  // ✅模块小标题颜色由"小标题文字色"控制，不再硬编码
  painter.drawText(title, x, y, MODULE_TITLE_SIZE, config.subtitle || '#b85878', FONT_SIYUAN, true);
}

// 绘制封面卡片（白色底+#eee边框+圆角，内含圆角图片）
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
      // 圆角裁剪路径
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
      // ✅直接完整缩放绘制（不再使用drawImageRound的cover裁剪模式），
      // 确保图片底部不被裁剪，完整显示在目标区域内
      const resInfo = rawImageResourceCache.get(srcUrl);
      const drawTarget = resInfo?.type === 'image' ? resInfo.data : img;
      ctx.drawImage(drawTarget, imgX, imgY, imgW, imgH);
    } finally {
      ctx.restore();
    }
  }
}

// 绘制感想文字框（白色底+#eee边框+圆角）
function drawTextBox(painter, x, y, boxW, boxH, text, config) {
  // ✅文本框边框色由"自定义文本边框色"控制，默认#eee
  painter.drawRoundRect(x, y, boxW, boxH, SUB_CARD_RADIUS, '#ffffff', config.customborder || '#eee', 1);
  if (text) {
    const textSize = config.customTextFontSize || 16;
    wrapText(
      painter.ctx, text,
      x + TEXT_BOX_PAD, y + TEXT_BOX_PAD,
      boxW - TEXT_BOX_PAD * 2,
      textSize * 1.55, textSize,
      config.customtext || '#c98fac'
    );
  }
}

// ✅新增：返回结构化的标签+数据对，供Canvas分别着色
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

function drawStatsContent(painter, x, y, innerW, annualData, config) {
  const parts = buildStatsParts(annualData);
  if (parts.length === 0) return;
  const ctx = painter.ctx;
  const fontSize = STAT_SIZE;
  const lineHeight = STAT_SIZE * 1.8;
  const labelColor = config.stattext || '#b85878';   // ✅数据统计文字色（标签）
  const dataColor = config.statdata || '#b33a3a';     // ✅数据统计数据色（用户填写内容）
  ctx.font = `${fontSize}px ${FONT_SIYUAN}`;
  let curX = x;
  let curY = y;
  const gap = '  ';
  const gapW = ctx.measureText(gap).width;
  // 逐字符绘制，标签用labelColor，数据用dataColor，超宽自动换行
  for (let i = 0; i < parts.length; i++) {
    const { label, value } = parts[i];
    // 绘制标签
    ctx.fillStyle = labelColor;
    for (const ch of Array.from(label)) {
      const chW = ctx.measureText(ch).width;
      if (curX + chW > x + innerW) { curX = x; curY += lineHeight; }
      ctx.fillText(ch, curX, curY);
      curX += chW;
    }
    // 绘制数据
    ctx.fillStyle = dataColor;
    for (const ch of Array.from(value)) {
      const chW = ctx.measureText(ch).width;
      if (curX + chW > x + innerW) { curX = x; curY += lineHeight; }
      ctx.fillText(ch, curX, curY);
      curX += chW;
    }
    // 段间空格
    if (i < parts.length - 1) {
      if (curX + gapW > x + innerW) { curX = x; curY += lineHeight; }
      else { curX += gapW; }
    }
  }
}

function drawTopItem(painter, targetW, item, itemType, imageCache, config) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  const contentX = wrapX + CARD_INNER_PAD;
  const ctx = painter.ctx;

  // ---- NO + 名称行（统一用wrapText绘制，确保基线完全一致；整体垂直居中）----
  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${NO_SIZE}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const nameX = contentX + noW + 12;
  const nameMaxW = innerW - noW - 12;
  // 先测量名称高度
  const nameH = measureWrappedHeight(ctx, nameText, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, true);
  // ✅NO行高与名称统一使用 NO_SIZE*1.3
  const noLineH = NO_SIZE * 1.3;
  const rowH = Math.max(noLineH, nameH);
  // ✅NO和名称从同一顶部坐标nameTopY开始绘制，两者字号相同(22px)、行高相同，自然上下对齐
  const nameTopY = painter.y + (rowH - nameH) / 2;
  // ✅NO也用wrapText绘制（单行），与名称使用完全相同的基线逻辑，彻底消除fillText与wrapText基线不一致问题
  // ✅NO标签颜色由"小标题文字色"控制，不再硬编码NO_COLOR
  wrapText(ctx, noText, contentX, nameTopY, noW + 10, NAME_SIZE * 1.3, NAME_SIZE, config.subtitle || '#b85878', FONT_SIYUAN, true);
  wrapText(ctx, nameText, nameX, nameTopY, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, config.gamename || '#000000', FONT_SIYUAN, true);
  painter.shiftY(rowH + LABEL_ROW_MB);

  // ---- 封面 + 感想行 ----
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
  } else { // cp
    const fSrc = toCanvasUrl(item.femaleCoverSrc);
    const mSrc = toCanvasUrl(item.maleCoverSrc);
    const fImg = fSrc ? imageCache.get(fSrc) : null;
    const mImg = mSrc ? imageCache.get(mSrc) : null;
    coverCardW = (CP_COVER_SIZE + COVER_CARD_PAD * 2) * 2 + CP_GAP;  // ✅修复：与calcTopItemHeight一致
    coverCardH = CP_COVER_SIZE + COVER_CARD_PAD * 2;
    // 女主卡片
    drawCoverCard(painter, contentX, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, fImg, fSrc, 6);
    // 男主卡片
    drawCoverCard(painter, contentX + CP_COVER_SIZE + COVER_CARD_PAD * 2 + CP_GAP, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, mImg, mSrc, 6);
  }

  // 感想框（仅当有文字时绘制）✅统一使用 COVER_TEXT_GAP 间距
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

  // ---- "还玩了"区域 ----
  const alsoList = o.alsoPlayed || [];
  if (alsoList.length > 0) {
    // 标题
    wrapText(ctx, '还玩了', contentX, painter.y, innerW, OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE,
      config.subtitle || '#b85878', FONT_SIYUAN, true);
    painter.shiftY(OTHER_SECTION_TITLE_SIZE + 12);

    // 封面横向排列
    const cols = Math.max(1, Math.floor((innerW + OTHER_ALSO_COVER_GAP) / (OTHER_ALSO_COVER_W + OTHER_ALSO_COVER_GAP)));
    const firstImg = imageCache.get(toCanvasUrl(alsoList[0]?.coverSrc));
    const rowH = calcGameCoverHeight(firstImg);
    alsoList.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = contentX + col * (OTHER_ALSO_COVER_W + OTHER_ALSO_COVER_GAP);
      const y = painter.y + row * (rowH + OTHER_ALSO_COVER_GAP);
      const src = toCanvasUrl(item.coverSrc);
      const img = src ? imageCache.get(src) : null;
      const coverH = calcGameCoverHeight(img);
      drawCoverCard(painter, x, y, OTHER_ALSO_COVER_W, coverH, img, src, 6);
    });
    const rows = Math.ceil(alsoList.length / cols);
    painter.shiftY(rows * rowH + (rows - 1) * OTHER_ALSO_COVER_GAP + OTHER_SECTION_GAP);
  }

  // ---- 卡片区域 ----
  const cards = getOtherCards(annualData);
  if (cards.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + OTHER_CARD_GAP) / (OTHER_CARD_W + OTHER_CARD_GAP)));
    const rows = Math.ceil(cards.length / cols);
    const textSize = config.customTextFontSize || 16;

    // 先计算每行高度
    const rowHeights = [];
    for (let r = 0; r < rows; r++) {
      let rowMax = 0;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= cards.length) continue;
        const card = cards[idx];
        let ch = OTHER_CARD_PAD * 2 + OTHER_SECTION_TITLE_SIZE + OTHER_CARD_TITLE_MB;
        if (card.type === 'cp') ch += OTHER_CP_COVER_SIZE;
        else if (card.type === 'support') ch += OTHER_SUPPORT_COVER_SIZE;
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
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= cards.length) continue;
        const card = cards[idx];
        const x = contentX + c * (OTHER_CARD_W + OTHER_CARD_GAP);
        const y = painter.y;
        // 卡片背景
        painter.drawRoundRect(x, y, OTHER_CARD_W, rowH, 12, '#fff7f9', '#eee', 1);
        // 卡片标题
        const titleY = y + OTHER_CARD_PAD;
        wrapText(ctx, card.title, x + OTHER_CARD_PAD, titleY, OTHER_CARD_W - OTHER_CARD_PAD * 2,
          OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE, config.subtitle || '#b85878', FONT_SIYUAN, true);
        const contentY = titleY + OTHER_SECTION_TITLE_SIZE + OTHER_CARD_TITLE_MB;

        if (card.type === 'cp') {
          const fSrc = toCanvasUrl(card.data.femaleCoverSrc);
          const mSrc = toCanvasUrl(card.data.maleCoverSrc);
          const fImg = fSrc ? imageCache.get(fSrc) : null;
          const mImg = mSrc ? imageCache.get(mSrc) : null;
          const totalW = OTHER_CP_COVER_SIZE * 2 + 8;
          const startX = x + (OTHER_CARD_W - totalW) / 2;
          drawCoverCard(painter, startX, contentY, OTHER_CP_COVER_SIZE, OTHER_CP_COVER_SIZE, fImg, fSrc, 6);
          drawCoverCard(painter, startX + OTHER_CP_COVER_SIZE + 8, contentY, OTHER_CP_COVER_SIZE, OTHER_CP_COVER_SIZE, mImg, mSrc, 6);
        } else if (card.type === 'support') {
          const src = toCanvasUrl(card.data.coverSrc);
          const img = src ? imageCache.get(src) : null;
          const sx = x + (OTHER_CARD_W - OTHER_SUPPORT_COVER_SIZE) / 2;
          drawCoverCard(painter, sx, contentY, OTHER_SUPPORT_COVER_SIZE, OTHER_SUPPORT_COVER_SIZE, img, src, 6);
        } else {
          // text / custom
          const textAreaW = OTHER_CARD_W - OTHER_CARD_PAD * 2;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
          const boxH = Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
          drawTextBox(painter, x + OTHER_CARD_PAD, contentY, textAreaW, boxH, card.text || '', config);
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
  const cellH = gridKind === 'game' ? GRID_GAME_CELL_H : GRID_CELL_H;

  if (items.length > 0) {
    const cols = Math.max(1, Math.floor((innerW + GRID_GAP) / (GRID_CELL_W + GRID_GAP)));
    const rows = Math.ceil(items.length / cols);
    const labelH = GRID_LABEL_SIZE * 1.4;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= items.length) continue;
        const item = items[idx];
        const x = contentX + c * (GRID_CELL_W + GRID_GAP);
        const y = painter.y;
        // 封面框
        const src = toCanvasUrl(item.coverSrc);
        const img = src ? imageCache.get(src) : null;
        // 封面框背景+边框
        painter.drawRoundRect(x, y, GRID_CELL_W, cellH, 8, '#ffffff', item.gameId || item.charId ? '#eeeeee' : '#f6a5b8', 1);
        if (img && src) {
          // 图片绘制（contain模式）
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x + 8, y);
          ctx.lineTo(x + GRID_CELL_W - 8, y);
          ctx.quadraticCurveTo(x + GRID_CELL_W, y, x + GRID_CELL_W, y + 8);
          ctx.lineTo(x + GRID_CELL_W, y + cellH - 8);
          ctx.quadraticCurveTo(x + GRID_CELL_W, y + cellH, x + GRID_CELL_W - 8, y + cellH);
          ctx.lineTo(x + 8, y + cellH);
          ctx.quadraticCurveTo(x, y + cellH, x, y + cellH - 8);
          ctx.lineTo(x, y + 8);
          ctx.quadraticCurveTo(x, y, x + 8, y);
          ctx.closePath();
          ctx.clip();
          const resInfo = rawImageResourceCache.get(src);
          const drawTarget = resInfo?.type === 'image' ? resInfo.data : img;
          // contain 缩放
          const iw = drawTarget.naturalWidth || drawTarget.width || 0;
          const ih = drawTarget.naturalHeight || drawTarget.height || 0;
          if (iw > 0 && ih > 0) {
            const scale = Math.min(GRID_CELL_W / iw, cellH / ih);
            const dw = iw * scale;
            const dh = ih * scale;
            ctx.drawImage(drawTarget, x + (GRID_CELL_W - dw) / 2, y + (cellH - dh) / 2, dw, dh);
          }
          ctx.restore();
        }
        // 标签
        const labelY = y + cellH + GRID_LABEL_GAP;
        const labelText = item.label || (gridKind === 'game' ? (item.gameName || '') : (item.charName || ''));
        wrapText(ctx, labelText, x, labelY, GRID_CELL_W, labelH, GRID_LABEL_SIZE,
          '#b85878', FONT_SIYUAN, true);
      }
      painter.shiftY(cellH + GRID_LABEL_GAP + labelH);
      if (r < rows - 1) painter.shiftY(GRID_GAP);
    }
  }

  // 底部文本框
  if ((footerText || '').trim()) {
    if (items.length > 0) painter.shiftY(GRID_FOOTER_GAP);
    // 标题
    wrapText(ctx, footerLabel, contentX, painter.y, innerW, OTHER_SECTION_TITLE_SIZE * 1.4, OTHER_SECTION_TITLE_SIZE,
      config.subtitle || '#b85878', FONT_SIYUAN, true);
    painter.shiftY(OTHER_SECTION_TITLE_SIZE + 10);
    // 文本框
    const textSize = config.customTextFontSize || 16;
    const textAreaW = innerW - OTHER_CARD_PAD * 2;
    const textH = measureWrappedHeight(ctx, footerText, textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    const boxH = Math.max(OTHER_TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
    // 底部框背景
    painter.drawRoundRect(contentX, painter.y, innerW, boxH + OTHER_CARD_PAD * 2 + OTHER_SECTION_TITLE_SIZE + 10, 12, '#fff7f9', '#eee', 1);
    // 重新定位标题和文本（因为上面画了背景，需要在背景内重绘标题）
    // 标题已在上方绘制，这里只画文本框
    drawTextBox(painter, contentX + OTHER_CARD_PAD, painter.y + OTHER_SECTION_TITLE_SIZE + 10, textAreaW, boxH, footerText, config);
    painter.shiftY(boxH + OTHER_CARD_PAD * 2);
  }
}

// ===================== 主入口：单模块导出 =====================
export async function renderAnnualModuleCanvas(designW, moduleType, moduleTitle, annualData, config) {
  // IOS内存清理
  if (IS_IOS_WEBKIT) {
    for (const [, res] of rawImageResourceCache.entries()) {
      if (res?.type === 'bitmap' && res.data && typeof res.data.close === 'function') {
        try { res.data.close(); } catch (e) {}
      }
    }
    roundImageCache.clear();
    rawImageResourceCache.clear();
  }

  // 空模块判断
  if (moduleType === 'stats') {
    if (!buildStatsText(annualData)) return null;
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

  // 第一步：加载图片（游戏封面高度依赖图片尺寸，必须先加载）
  let imageUrls = collectModuleImages(moduleType, annualData);
  // ✅兜底防火墙：再次清洗，剔除null/空/R2 pub/github raw（对齐export补丁8）
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

  // ✅离屏圆角画布方案已弃用（改为实时clip绘制），跳过预生成，直接进入绘制阶段
  await new Promise(r => setTimeout(r, 30));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  emitRenderProgress(65);

  // 第二步：基于加载后的图片计算高度
  const vCanvas = document.createElement('canvas');
  const vCtx = vCanvas.getContext('2d');
  const totalH = moduleType === 'stats'
    ? calcStatsHeight(vCtx, designW, annualData, config)
    : calcModuleHeight(vCtx, designW, moduleType, moduleTitle, annualData, config, imageCache);
  vCanvas.width = 0; vCanvas.height = 0;

  // 第三步：创建正式画布并绘制
  // ✅IOS画布总像素预警（对齐export补丁5）
  if (IS_IOS_WEBKIT) {
    const totalPixel = (designW * DPR) * (totalH * DPR);
    if (totalPixel > 32 * 1024 * 1024) {
      console.warn(`⚠️ annual IOS画布像素超限风险：${totalPixel}，模块=${moduleType}，可能toBlob返回null`);
    }
  }
  // ✅修复：画布高度预留底部getBodyPad()，否则卡片下边框外侧1px超出画布被裁，下边框比其余三边细
  const canvasHeight = totalH + getBodyPad();
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, canvasHeight, config.bg || '#fff7f9');

  // 大标题（传入annualData用于年份标题）
  drawBigTitle(painter, designW, config, annualData);

  // 模块卡片
  const wrapW = getWrapW(designW);
  const wrapX = getWrapX(designW, wrapW);
  const cardTop = painter.y;
  const cardInnerW = wrapW - CARD_INNER_PAD * 2;

  // 计算卡片内容高度
  let cardContentH = 0;
  if (moduleType === 'other') {
    // 五模块无模块标题，内容由drawOtherContent独立计算
    // 用calcOtherHeight反推contentH
    const totalH = calcOtherHeight(painter.ctx, designW, annualData, config, imageCache);
    cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_INNER_PAD * 2;
  } else if (moduleType === 'gameGrid' || moduleType === 'charGrid') {
    const gridData = moduleType === 'gameGrid' ? annualData.gameGrid : annualData.charGrid;
    const gridKind = moduleType === 'gameGrid' ? 'game' : 'char';
    const footer = moduleType === 'gameGrid' ? annualData.gameGrid?.nextYearExpect : annualData.charGrid?.extraThoughts;
    const totalH = calcGridHeight(painter.ctx, designW, gridData, gridKind, footer, config);
    cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_INNER_PAD * 2;
  } else {
    if (moduleTitle) {
      cardContentH += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
    }
    if (moduleType === 'stats') {
      const statsText = buildStatsText(annualData);
      if (statsText) {
        cardContentH += measureWrappedHeight(painter.ctx, statsText, cardInnerW, STAT_SIZE * 1.8, STAT_SIZE);
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

  const cardH = CARD_INNER_PAD * 2 + cardContentH;

  // 绘制卡片背景+边框
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', CARD_BORDER_W);

  // 绘制模块标题
  let contentY = cardTop + CARD_INNER_PAD;
  if (moduleTitle && moduleType !== 'other' && moduleType !== 'gameGrid' && moduleType !== 'charGrid') {
    drawModuleTitle(painter, wrapX + CARD_INNER_PAD, contentY, moduleTitle, config);
    contentY += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  }

  // 绘制内容
  if (moduleType === 'stats') {
    drawStatsContent(painter, wrapX + CARD_INNER_PAD, contentY, cardInnerW, annualData, config);
    painter.y = cardTop + cardH;
  } else if (moduleType === 'other') {
    // 五模块：无模块标题，从卡片顶部+内边距开始绘制
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

  // 裁剪到实际高度（对齐export-canvas-render.js的cropCanvas：先填背景色，再9参数1:1复制，不拉伸变形）
  const finalH = painter.getY() + getBodyPad();
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = designW * DPR;
  outputCanvas.height = Math.max(finalH, designW * 0.4) * DPR;
  const oCtx = outputCanvas.getContext('2d');
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = "high";
  // ✅先填充背景色，覆盖输出画布底部多出的边距区域
  oCtx.fillStyle = config.bg || '#fff7f9';
  oCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  // ✅9参数1:1复制源画布内容，不再用5参数整体拉伸导致图片变形
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
export async function renderAllAnnualModules(designW, annualData, config, titleMap) {
  const modules = [
    { type: 'stats', title: titleMap?.stats || '' },
    { type: 'gameTop', title: titleMap?.gameTop || 'ゲームTOP' },
    { type: 'charTop', title: titleMap?.charTop || 'キャラTOP' },
    { type: 'cpTop', title: titleMap?.cpTop || 'カップルTOP' },
    // ✅新增：五、其他（title传空，不导出"五、其他"标题）
    { type: 'other', title: '' },
    // ✅新增：六、ゲーム宫格
    { type: 'gameGrid', title: titleMap?.gameGrid || 'ゲーム宫格' },
    // ✅新增：七、キャラ宫格
    { type: 'charGrid', title: titleMap?.charGrid || 'キャラ宫格' },
  ];
  const results = [];
  for (const mod of modules) {
    const blob = await renderAnnualModuleCanvas(designW, mod.type, mod.title, annualData, config);
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
