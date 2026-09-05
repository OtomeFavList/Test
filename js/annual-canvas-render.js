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
const SUBTITLE_COLOR = '#f6a5b8';      // 模块小标题颜色（用户指定）
const NO_COLOR = '#b85878';            // NO标签颜色（对齐网页.annual-top-label）
const LABEL_ROW_MB = 12;               // NO+名称行底部间距
const ITEM_GAP = 24;                   // TOP条目间间距
const MODULE_GAP = 30;                 // 模块卡片间间距（单模块图中不涉及，预留）
const CARD_INNER_PAD = 20;             // 模块卡片内边距（对齐BIG_CARD_PADDING）
const COVER_CARD_PAD = 8;              // 封面卡片内边距（对齐CHAR_CARD_INNER_PADDING）
const TEXT_BOX_PAD = 10;               // 感想文字框内边距
const GAME_COVER_W = 140;              // 游戏封面固定宽度
const CHAR_COVER_SIZE = 120;           // 角色封面固定正方形
const CP_COVER_SIZE = 100;             // CP封面固定正方形
const CP_GAP = 10;                     // CP双图间距
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
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = "high";
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
  return resultMap;
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
  if (moduleType === 'gameTop') {
    safeEach(annualData.topList, item => {
      if (!item.gameId) return;
      const u = toCanvasUrl(item.coverSrc);
      if (u) urls.push(u);
    });
  } else if (moduleType === 'charTop') {
    safeEach(annualData.charTopList, item => {
      if (!item.charId) return;
      const u = toCanvasUrl(item.coverSrc);
      if (u) urls.push(u);
    });
  } else if (moduleType === 'cpTop') {
    safeEach(annualData.cpTopList, item => {
      if (!item.femaleId || !item.maleId) return;
      const fu = toCanvasUrl(item.femaleCoverSrc);
      const mu = toCanvasUrl(item.maleCoverSrc);
      if (fu) urls.push(fu);
      if (mu) urls.push(mu);
    });
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

// ===================== 高度计算（需在图片加载后调用） =====================
function calcStatsHeight(ctx, targetW, annualData, config) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = TITLE_SIZE + getTitleMb(); // 大标题
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
  h += Math.max(NO_SIZE, nameH) + LABEL_ROW_MB;

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
    coverAreaW = CP_COVER_SIZE * 2 + CP_GAP + COVER_CARD_PAD * 2;
  }

  // 感想框（仅当有文字时计算）
  let textBoxH = 0;
  const text = (item.text || '').trim();
  if (text) {
    const textAreaW = innerW - coverAreaW - 16;
    const textSize = config.customTextFontSize || 16;
    const textH = measureWrappedHeight(ctx, text, textAreaW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    textBoxH = textH + TEXT_BOX_PAD * 2;
  }

  h += Math.max(coverH, textBoxH);
  return h;
}

function calcModuleHeight(ctx, targetW, moduleType, moduleTitle, annualData, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  let h = TITLE_SIZE + getTitleMb(); // 大标题

  // 模块卡片
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

// ===================== 绘制函数 =====================
function drawBigTitle(painter, targetW, config) {
  painter.drawTextCenter('Otome Annual Report', targetW / 2, painter.y, TITLE_SIZE, config.title || '#b33a3a', 'sans-serif', true);
  painter.shiftY(TITLE_SIZE + getTitleMb());
}

function drawModuleTitle(painter, x, y, title) {
  painter.drawText(title, x, y, MODULE_TITLE_SIZE, SUBTITLE_COLOR, FONT_SIYUAN, true);
}

// 绘制封面卡片（白色底+#eee边框+圆角，内含圆角图片）
function drawCoverCard(painter, x, y, cardW, cardH, img, srcUrl, radius) {
  // 卡片背景+边框
  painter.drawRoundRect(x, y, cardW, cardH, SUB_CARD_RADIUS, '#ffffff', SUB_CARD_BORDER, 1);
  if (img) {
    const roundC = createRoundImageCanvas(img, srcUrl, radius);
    if (roundC) {
      painter.drawImageRound(roundC, x + COVER_CARD_PAD, y + COVER_CARD_PAD, cardW - COVER_CARD_PAD * 2, cardH - COVER_CARD_PAD * 2);
    }
  }
}

// 绘制感想文字框（白色底+#f6a5b8边框+圆角）
function drawTextBox(painter, x, y, boxW, boxH, text, config) {
  painter.drawRoundRect(x, y, boxW, boxH, SUB_CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', 1);
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

function drawStatsContent(painter, x, y, innerW, annualData, config) {
  const statsText = buildStatsText(annualData);
  if (statsText) {
    wrapText(painter.ctx, statsText, x, y, innerW, STAT_SIZE * 1.8, STAT_SIZE, config.customtext || '#c98fac');
  }
}

function drawTopItem(painter, targetW, item, itemType, imageCache, config) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_INNER_PAD * 2;
  const contentX = wrapX + CARD_INNER_PAD;
  const ctx = painter.ctx;

  // ---- NO + 名称行 ----
  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${NO_SIZE}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  ctx.fillStyle = NO_COLOR;
  ctx.fillText(noText, contentX, painter.y);

  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const nameX = contentX + noW + 12;
  const nameMaxW = innerW - noW - 12;
  const nameH = wrapText(ctx, nameText, nameX, painter.y, nameMaxW, NAME_SIZE * 1.3, NAME_SIZE, config.gamename || '#000000', true);
  const rowH = Math.max(NO_SIZE, nameH);
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
    coverCardW = CP_COVER_SIZE * 2 + CP_GAP + COVER_CARD_PAD * 2;
    coverCardH = CP_COVER_SIZE + COVER_CARD_PAD * 2;
    // 女主卡片
    drawCoverCard(painter, contentX, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, fImg, fSrc, 6);
    // 男主卡片
    drawCoverCard(painter, contentX + CP_COVER_SIZE + COVER_CARD_PAD * 2 + CP_GAP, contentY, CP_COVER_SIZE + COVER_CARD_PAD * 2, coverCardH, mImg, mSrc, 6);
  }

  // 感想框（仅当有文字时绘制）
  const text = (item.text || '').trim();
  if (text) {
    const textX = contentX + coverCardW + 16;
    const textW = innerW - coverCardW - 16;
    const textSize = config.customTextFontSize || 16;
    const textH = measureWrappedHeight(ctx, text, textW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize);
    const textBoxH = textH + TEXT_BOX_PAD * 2;
    drawTextBox(painter, textX, contentY, textW, textBoxH, text, config);
  }

  painter.shiftY(Math.max(coverCardH, text ? (measureWrappedHeight(ctx, text, innerW - coverCardW - 16 - TEXT_BOX_PAD * 2, (config.customTextFontSize || 16) * 1.55, config.customTextFontSize || 16) + TEXT_BOX_PAD * 2) : 0));
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
  } else {
    const validItems = getValidItems(moduleType, annualData);
    if (validItems.length === 0) return null;
  }

  emitRenderProgress(5);

  // 第一步：加载图片（游戏封面高度依赖图片尺寸，必须先加载）
  const imageUrls = collectModuleImages(moduleType, annualData);
  const imageCache = await loadImagesWithLimit(imageUrls, MAX_IMAGE_CONCURRENCY);

  // 预生成圆角画布
  const roundTasks = imageUrls.map(src => ({ src, radius: 6 }));
  await preGenerateAllRoundCanvas(imageCache, roundTasks);
  await new Promise(r => setTimeout(r, 50));
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
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, totalH, config.bg || '#fff7f9');

  // 大标题
  drawBigTitle(painter, designW, config);

  // 模块卡片
  const wrapW = getWrapW(designW);
  const wrapX = getWrapX(designW, wrapW);
  const cardTop = painter.y;
  const cardInnerW = wrapW - CARD_INNER_PAD * 2;

  // 计算卡片内容高度
  let cardContentH = 0;
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
  const cardH = CARD_INNER_PAD * 2 + cardContentH;

  // 绘制卡片背景+边框
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', CARD_BORDER_W);

  // 绘制模块标题
  let contentY = cardTop + CARD_INNER_PAD;
  if (moduleTitle) {
    drawModuleTitle(painter, wrapX + CARD_INNER_PAD, contentY, moduleTitle);
    contentY += MODULE_TITLE_SIZE + (LAYOUT_SPACE.BIG_CARD_H2_MB || 16);
  }

  // 绘制内容
  if (moduleType === 'stats') {
    drawStatsContent(painter, wrapX + CARD_INNER_PAD, contentY, cardInnerW, annualData, config);
  } else {
    const items = getValidItems(moduleType, annualData);
    const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
    painter.y = contentY; // 从内容区开始绘制条目
    items.forEach((item, i) => {
      item._no = i;
      drawTopItem(painter, designW, item, itemType, imageCache, config);
      if (i < items.length - 1) painter.shiftY(ITEM_GAP);
      emitRenderProgress(65 + ((i + 1) / items.length) * 30);
    });
  }

  emitRenderProgress(100);

  // 裁剪到实际高度
  const finalH = painter.getY() + getBodyPad();
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = designW * DPR;
  outputCanvas.height = Math.max(finalH, designW * 0.4) * DPR;
  const oCtx = outputCanvas.getContext('2d');
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = "high";
  oCtx.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);

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
