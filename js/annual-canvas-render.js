// ================================================================
// annual-canvas-render.js
// 年度报告模式 纯Canvas绘制导出（参考 export-canvas-render.js）
// 每个模块单独生成一张图，支持 640/810/1080 三种设计宽度（DPR×2）
// ================================================================

import { getWebImageUrl, preloadImageBitmap, preloadAndDecodeImage, convertR2ToJsDelivr } from './main.js';

// ===================== 常量 =====================
const MAX_IMAGE_CONCURRENCY = 4;
const FONT_SIYUAN = "Noto Sans SC, sans-serif";
const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const DPR = 2;

// ===================== 缓存 =====================
const roundImageCache = new Map();
const rawImageResourceCache = new Map();

// ===================== 进度上报 =====================
function emitRenderProgress(percent) {
  window.dispatchEvent(new CustomEvent('annual-canvas-progress', {
    detail: { percent: Math.min(100, Math.max(0, Number(percent))) }
  }));
}

// ===================== 尺寸度量（基于设计宽度等比缩放） =====================
function getMetrics(designW) {
  const w = designW;
  return {
    padX: Math.round(w * 0.06),
    contentW: w - Math.round(w * 0.06) * 2,
    // 大标题
    titleSize: Math.round(w * 0.075),
    titleMb: Math.round(w * 0.05),
    // 模块标题
    moduleTitleSize: Math.round(w * 0.052),
    moduleTitleMb: Math.round(w * 0.045),
    // 条目行
    noSize: Math.round(w * 0.042),
    nameSize: Math.round(w * 0.038),
    nameLineH: Math.round(w * 0.038 * 1.35),
    labelRowMb: Math.round(w * 0.028),
    itemGap: Math.round(w * 0.055),
    // 封面
    gameCoverW: Math.round(w * 0.26),
    gameCoverH: Math.round(w * 0.26 * 1.35),
    charCoverSize: Math.round(w * 0.24),
    cpCoverSize: Math.round(w * 0.21),
    cpGap: Math.round(w * 0.018),
    coverRadius: Math.round(w * 0.012),
    // 感想文字
    textSize: Math.round(w * 0.03),
    textLineH: Math.round(w * 0.03 * 1.55),
    // 统计行
    statSize: Math.round(w * 0.032),
    statLineH: Math.round(w * 0.032 * 1.9),
  };
}

// ===================== 文字换行工具 =====================
function wrapText(ctx, text, x, y, maxWidth, lineHeight, fontSize, color, bold = false) {
  if (!text) return 0;
  ctx.font = bold ? `bold ${fontSize}px ${FONT_SIYUAN}` : `${fontSize}px ${FONT_SIYUAN}`;
  ctx.fillStyle = color;
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  let totalHeight = 0;
  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    const mWidth = Number.isFinite(metrics.width) ? metrics.width : 0;
    if (mWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y + totalHeight);
      line = chars[n];
      totalHeight += safeLineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + totalHeight);
    totalHeight += safeLineHeight;
  }
  return totalHeight;
}

function measureWrappedHeight(ctx, text, maxWidth, lineHeight, fontSize, bold = false) {
  if (!text) return 0;
  ctx.font = bold ? `bold ${fontSize}px ${FONT_SIYUAN}` : `${fontSize}px ${FONT_SIYUAN}`;
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  let lines = 1;
  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    const mWidth = Number.isFinite(metrics.width) ? metrics.width : 0;
    if (mWidth > maxWidth && n > 0) {
      lines++;
      line = chars[n];
    } else {
      line = testLine;
    }
  }
  return lines * safeLineHeight;
}

function drawTextCenter(ctx, text, centerX, y, fontSize, color, bold = false) {
  ctx.font = bold ? `bold ${fontSize}px ${FONT_SIYUAN}` : `${fontSize}px ${FONT_SIYUAN}`;
  ctx.fillStyle = color;
  const w = ctx.measureText(text).width;
  ctx.fillText(text, centerX - w / 2, y);
}

// ===================== 圆角离屏画布 =====================
function createRoundImageCanvas(img, srcUrl, radius) {
  if (!img) return null;
  const sourceW = (img.naturalWidth ?? img.width) || 1;
  const sourceH = (img.naturalHeight ?? img.height) || 1;
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
    offCanvas.width = 0;
    offCanvas.height = 0;
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
    const sourceW = (img.naturalWidth ?? img.width) || 1;
    const sourceH = (img.naturalHeight ?? img.height) || 1;
    const key = `${task.src}||${sourceW}x${sourceH}||${task.radius}||${DPR}`;
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
  // 若仍是R2地址，尝试转jsDelivr
  if (url && /^https:\/\/pub-/.test(url)) {
    const converted = convertR2ToJsDelivr(relativeSrc);
    if (converted && isSafeUrl(converted)) url = converted;
  }
  return isSafeUrl(url) ? url : '';
}

// ===================== Canvas绘制器 =====================
class AnnualCanvasPainter {
  constructor(canvas, designW, designH, bgColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.designW = designW;
    this.designH = designH;
    this.y = 0;
    canvas.width = designW * DPR;
    canvas.height = designH * DPR;
    canvas.style.width = `${designW}px`;
    canvas.style.height = `${designH}px`;
    this.ctx.scale(DPR, DPR);
    this.ctx.textBaseline = 'top';
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, designW, designH);
  }
  shiftY(px) { this.y += px; }
  getY() { return this.y; }
  resetY() { this.y = 0; }

  drawRoundRect(x, y, w, h, radius, fill, stroke, strokeWidth = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
  }

  drawImageRound(roundCanvas, x, y, w, h) {
    this.ctx.drawImage(roundCanvas, 0, 0, roundCanvas.width, roundCanvas.height, x, y, w, h);
  }
}

// ===================== 统计行文本拼接 =====================
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

// ===================== 高度计算 =====================
function calcStatsHeight(ctx, designW, annualData, config) {
  const m = getMetrics(designW);
  let h = m.padX; // 顶部padding
  h += m.titleSize + m.titleMb; // 大标题
  const statsText = buildStatsText(annualData);
  if (statsText) {
    h += measureWrappedHeight(ctx, statsText, m.contentW, m.statLineH, m.statSize);
  }
  h += m.padX; // 底部padding
  return h;
}

function calcTopItemHeight(ctx, designW, item, itemType, config) {
  const m = getMetrics(designW);
  let h = 0;
  // NO+名称行
  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${m.noSize}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  const nameMaxW = m.contentW - noW - Math.round(designW * 0.03);
  const nameH = measureWrappedHeight(ctx, nameText, nameMaxW, m.nameLineH, m.nameSize, true);
  h += Math.max(m.noSize, nameH);
  h += m.labelRowMb;
  // 封面+感想行
  let coverH;
  let textAreaX;
  let textAreaW;
  if (itemType === 'game') {
    coverH = m.gameCoverH;
    textAreaX = m.padX + m.gameCoverW + Math.round(designW * 0.03);
    textAreaW = m.contentW - m.gameCoverW - Math.round(designW * 0.03);
  } else if (itemType === 'char') {
    coverH = m.charCoverSize;
    textAreaX = m.padX + m.charCoverSize + Math.round(designW * 0.03);
    textAreaW = m.contentW - m.charCoverSize - Math.round(designW * 0.03);
  } else { // cp
    coverH = m.cpCoverSize;
    const totalCoverW = m.cpCoverSize * 2 + m.cpGap;
    textAreaX = m.padX + totalCoverW + Math.round(designW * 0.03);
    textAreaW = m.contentW - totalCoverW - Math.round(designW * 0.03);
  }
  const textH = measureWrappedHeight(ctx, item.text || '', textAreaW, m.textLineH, m.textSize);
  h += Math.max(coverH, textH);
  return h;
}

function calcModuleHeight(ctx, designW, moduleType, moduleTitle, annualData, config) {
  const m = getMetrics(designW);
  let h = m.padX; // 顶部padding
  h += m.titleSize + m.titleMb; // 大标题
  // 模块标题（stats模块无）
  if (moduleTitle) {
    h += m.moduleTitleSize + m.moduleTitleMb;
  }
  const list = moduleType === 'gameTop' ? annualData.topList
    : moduleType === 'charTop' ? annualData.charTopList
    : annualData.cpTopList;
  const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
  if (list && list.length > 0) {
    list.forEach((item, i) => {
      item._no = i;
      h += calcTopItemHeight(ctx, designW, item, itemType, config);
      if (i < list.length - 1) h += m.itemGap;
    });
  }
  h += m.padX; // 底部padding
  return h;
}

// ===================== 绘制函数 =====================
function drawBigTitle(painter, designW, config) {
  const m = getMetrics(designW);
  drawTextCenter(painter.ctx, 'Otome Annual Report', designW / 2, painter.y, m.titleSize, config.title, true);
  painter.shiftY(m.titleSize + m.titleMb);
}

function drawModuleTitle(painter, designW, title, config) {
  if (!title) return;
  const m = getMetrics(designW);
  drawTextCenter(painter.ctx, title, designW / 2, painter.y, m.moduleTitleSize, config.title, true);
  painter.shiftY(m.moduleTitleSize + m.moduleTitleMb);
}

function drawStatsModule(painter, designW, annualData, config) {
  const m = getMetrics(designW);
  const statsText = buildStatsText(annualData);
  if (statsText) {
    wrapText(painter.ctx, statsText, m.padX, painter.y, m.contentW, m.statLineH, m.statSize, config.customtext, false);
  }
}

function drawTopItem(painter, designW, item, itemType, imageCache, config) {
  const m = getMetrics(designW);
  const ctx = painter.ctx;
  const rowStartY = painter.y;

  // ---- NO + 名称行 ----
  const noText = `NO.${(item._no ?? 0) + 1}`;
  ctx.font = `bold ${m.noSize}px ${FONT_SIYUAN}`;
  const noW = ctx.measureText(noText).width;
  ctx.fillStyle = config.subtitle || '#b85878';
  ctx.fillText(noText, m.padX, painter.y);

  const nameText = itemType === 'cp'
    ? `${item.femaleName ?? ''}×${item.maleName ?? ''}`
    : (item.gameName || item.charName || '');
  const nameX = m.padX + noW + Math.round(designW * 0.03);
  const nameMaxW = m.contentW - noW - Math.round(designW * 0.03);
  const nameH = wrapText(ctx, nameText, nameX, painter.y, nameMaxW, m.nameLineH, m.nameSize, config.gamename, true);
  const rowH = Math.max(m.noSize, nameH);
  painter.shiftY(rowH + m.labelRowMb);

  // ---- 封面 + 感想行 ----
  const contentY = painter.y;

  if (itemType === 'game') {
    const url = toCanvasUrl(item.coverSrc);
    const img = url ? imageCache.get(url) : null;
    if (img) {
      const roundC = createRoundImageCanvas(img, url, m.coverRadius);
      if (roundC) painter.drawImageRound(roundC, m.padX, contentY, m.gameCoverW, m.gameCoverH);
    }
    const textX = m.padX + m.gameCoverW + Math.round(designW * 0.03);
    const textW = m.contentW - m.gameCoverW - Math.round(designW * 0.03);
    wrapText(ctx, item.text || '', textX, contentY, textW, m.textLineH, m.textSize, config.customtext);
    painter.shiftY(Math.max(m.gameCoverH, measureWrappedHeight(ctx, item.text || '', textW, m.textLineH, m.textSize)));
  } else if (itemType === 'char') {
    const url = toCanvasUrl(item.coverSrc);
    const img = url ? imageCache.get(url) : null;
    if (img) {
      const roundC = createRoundImageCanvas(img, url, m.coverRadius);
      if (roundC) painter.drawImageRound(roundC, m.padX, contentY, m.charCoverSize, m.charCoverSize);
    }
    const textX = m.padX + m.charCoverSize + Math.round(designW * 0.03);
    const textW = m.contentW - m.charCoverSize - Math.round(designW * 0.03);
    wrapText(ctx, item.text || '', textX, contentY, textW, m.textLineH, m.textSize, config.customtext);
    painter.shiftY(Math.max(m.charCoverSize, measureWrappedHeight(ctx, item.text || '', textW, m.textLineH, m.textSize)));
  } else { // cp
    const fUrl = toCanvasUrl(item.femaleCoverSrc);
    const mUrl = toCanvasUrl(item.maleCoverSrc);
    const fImg = fUrl ? imageCache.get(fUrl) : null;
    const mImg = mUrl ? imageCache.get(mUrl) : null;
    if (fImg) {
      const rc = createRoundImageCanvas(fImg, fUrl, m.coverRadius);
      if (rc) painter.drawImageRound(rc, m.padX, contentY, m.cpCoverSize, m.cpCoverSize);
    }
    if (mImg) {
      const rc = createRoundImageCanvas(mImg, mUrl, m.coverRadius);
      if (rc) painter.drawImageRound(rc, m.padX + m.cpCoverSize + m.cpGap, contentY, m.cpCoverSize, m.cpCoverSize);
    }
    const totalCoverW = m.cpCoverSize * 2 + m.cpGap;
    const textX = m.padX + totalCoverW + Math.round(designW * 0.03);
    const textW = m.contentW - totalCoverW - Math.round(designW * 0.03);
    wrapText(ctx, item.text || '', textX, contentY, textW, m.textLineH, m.textSize, config.customtext);
    painter.shiftY(Math.max(m.cpCoverSize, measureWrappedHeight(ctx, item.text || '', textW, m.textLineH, m.textSize)));
  }
}

// ===================== 收集模块图片URL =====================
function collectModuleImages(moduleType, annualData) {
  const urls = [];
  if (moduleType === 'gameTop') {
    (annualData.topList || []).forEach(item => {
      const u = toCanvasUrl(item.coverSrc);
      if (u) urls.push(u);
    });
  } else if (moduleType === 'charTop') {
    (annualData.charTopList || []).forEach(item => {
      const u = toCanvasUrl(item.coverSrc);
      if (u) urls.push(u);
    });
  } else if (moduleType === 'cpTop') {
    (annualData.cpTopList || []).forEach(item => {
      const fu = toCanvasUrl(item.femaleCoverSrc);
      const mu = toCanvasUrl(item.maleCoverSrc);
      if (fu) urls.push(fu);
      if (mu) urls.push(mu);
    });
  }
  return [...new Set(urls)];
}

// ===================== 主入口：单模块导出 =====================
/**
 * 为年度报告单个模块生成Canvas导出图
 * @param {number} designW 设计宽度（CSS像素），实际输出像素 = designW × 2
 * @param {string} moduleType 'stats' | 'gameTop' | 'charTop' | 'cpTop'
 * @param {string} moduleTitle 去掉序号后的模块标题（如"TOP"），stats传空字符串
 * @param {Object} annualData annual.js中的annualData
 * @param {Object} config annual.js中的annualExportConfig
 * @returns {Promise<Blob|null>}
 */
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
  const list = moduleType === 'gameTop' ? annualData.topList
    : moduleType === 'charTop' ? annualData.charTopList
    : moduleType === 'cpTop' ? annualData.cpTopList
    : null;
  if (list !== null && (!list || list.length === 0)) {
    if (moduleType !== 'stats') return null;
  }
  if (moduleType === 'stats') {
    const statsText = buildStatsText(annualData);
    if (!statsText) return null;
  }

  emitRenderProgress(5);

  // 虚拟画布计算高度
  const vCanvas = document.createElement('canvas');
  const vCtx = vCanvas.getContext('2d');
  const totalH = moduleType === 'stats'
    ? calcStatsHeight(vCtx, designW, annualData, config)
    : calcModuleHeight(vCtx, designW, moduleType, moduleTitle, annualData, config);
  vCanvas.width = 0; vCanvas.height = 0;

  emitRenderProgress(15);

  // 加载图片
  const imageUrls = collectModuleImages(moduleType, annualData);
  const imageCache = await loadImagesWithLimit(imageUrls, MAX_IMAGE_CONCURRENCY);

  // 预生成圆角画布
  const roundTasks = imageUrls.map(src => ({ src, radius: getMetrics(designW).coverRadius }));
  await preGenerateAllRoundCanvas(imageCache, roundTasks);

  await new Promise(r => setTimeout(r, 50));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  emitRenderProgress(65);

  // 创建正式画布
  const canvas = document.createElement('canvas');
  const painter = new AnnualCanvasPainter(canvas, designW, totalH, config.bg || '#fff7f9');

  // 绘制大标题
  drawBigTitle(painter, designW, config);

  // 绘制模块标题
  if (moduleTitle) drawModuleTitle(painter, designW, moduleTitle, config);

  // 绘制内容
  if (moduleType === 'stats') {
    drawStatsModule(painter, designW, annualData, config);
  } else {
    const itemType = moduleType === 'gameTop' ? 'game' : moduleType === 'charTop' ? 'char' : 'cp';
    const items = list;
    const m = getMetrics(designW);
    items.forEach((item, i) => {
      item._no = i;
      drawTopItem(painter, designW, item, itemType, imageCache, config);
      if (i < items.length - 1) painter.shiftY(m.itemGap);
      emitRenderProgress(65 + ((i + 1) / items.length) * 30);
    });
  }

  emitRenderProgress(100);

  // 裁剪到实际高度
  const finalH = painter.getY() + getMetrics(designW).padX;
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = designW * DPR;
  outputCanvas.height = Math.max(finalH, designW * 0.5) * DPR;
  const oCtx = outputCanvas.getContext('2d');
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = "high";
  oCtx.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);

  let blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png', 1));
  if (IS_IOS_WEBKIT && !blob) {
    await new Promise(r => setTimeout(r, 100));
    blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png', 1));
  }

  // IOS单模块完成后释放临时画布
  if (IS_IOS_WEBKIT) {
    canvas.width = 0; canvas.height = 0;
    outputCanvas.width = 0; outputCanvas.height = 0;
  }

  return blob;
}

// ===================== 批量导出所有模块 =====================
/**
 * 批量导出所有有内容的模块
 * @param {number} designW
 * @param {Object} annualData
 * @param {Object} config
 * @param {Object} titleMap { stats:'', gameTop:'TOP', charTop:'キャラTOP', cpTop:'カップルTOP' }
 * @returns {Promise<Array<{moduleType:string, moduleTitle:string, blob:Blob}>>}
 */
export async function renderAllAnnualModules(designW, annualData, config, titleMap) {
  const modules = [
    { type: 'stats', title: titleMap?.stats || '' },
    { type: 'gameTop', title: titleMap?.gameTop || 'TOP' },
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
