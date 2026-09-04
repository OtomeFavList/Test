// ===================== export-canvas-render.js =====================
// 纯 Canvas 绘制导出图，数据驱动，无 DOM 依赖
import {
  LAYOUT_SPACE,
  LAYOUT_STYLE,
  getAvailableCharImages,
  preloadAndDecodeImage,
  preloadImageBitmap,
  convertR2ToJsDelivr,
  getCharDisplayName
} from './main.js';

// 最大并发图片加载数量，降低并发减少移动端解码资源竞争
const MAX_IMAGE_CONCURRENCY = 4;
// ===================== 【补丁新增：渲染进度上报 开始】 =====================
/**
 * 派发渲染进度事件，percent:0~100
 * 不修改原有业务逻辑，仅向外抛出自定义事件供UI层展示
 */
function emitRenderProgress(percent) {
  const evt = new CustomEvent('canvas-render-progress', {
    detail: {
      percent: Math.min(100, Math.max(0, Number(percent)))
    }
  });
  window.dispatchEvent(evt);
}
// ===================== 【补丁新增：渲染进度上报 结束】 =====================

//【IOS环境检测：Safari / iOS Chrome(WebKit内核)】
const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

//【优化】圆角离屏画布缓存：key = `${url}||${sourceW}x${sourceH}||${radius}||${dpr}`
const roundImageCache = new Map();
// 新增：图片资源缓存，区分 ImageBitmap / HTMLImageElement 降级对象
const rawImageResourceCache = new Map();

// ========== 字体规范 ==========
const FONT_SIYUAN = "Noto Sans SC, sans-serif";

// ============================ 固定 DPR = 2 ============================
let currentDPR = 2;

function getExportDPR(width) {
  return 2;
}

// ============================ 工具函数 ============================

export function wrapText(ctx, text, x, y, maxWidth, lineHeight, fontSize, color, font = FONT_SIYUAN, bold = false) {
  if (!text) return 0;
  const fontStr = bold ? `bold ${fontSize}px ${font}` : `${fontSize}px ${font}`;
  ctx.font = fontStr;
  ctx.fillStyle = color;
  // ==========【新增补丁】行空隙上限12px ==========
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

export function measureWrappedHeight(ctx, text, maxWidth, lineHeight, fontSize, bold = false) {
  if (!text) return 0;
  const fontStr = bold ? `bold ${fontSize}px ${FONT_SIYUAN}` : `${fontSize}px ${FONT_SIYUAN}`;
  ctx.font = fontStr;
  // ==========【新增补丁】行空隙上限12px，和绘制逻辑保持一致 ==========
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

/**
 * 离屏画布生成圆角图片，增加判空、清理和异常捕获
 * 兼容 ImageBitmap / HTMLImageElement，修复移动端 scale+clip 空洞问题
 * 移除 visualW/visualH 参数，缓存只依赖于原图尺寸、圆角半径和 DPR
 */
function createRoundImageCanvas(img, srcUrl, radius) {
  if (!img) return null;
  const sourceW = (img.naturalWidth ?? img.width) || 1;
  const sourceH = (img.naturalHeight ?? img.height) || 1;
  if (sourceW <= 0 || sourceH <= 0) return null;
  const dpr = currentDPR;
  // =========【补丁3‑1】仅IOS安全熔断：单张离屏画布像素上限阈值，超过直接不生成缓存，走实时clip降级 ==========
  if(IS_IOS_WEBKIT){
    const MAX_OFFSCREEN_PX = 4096 * 4096;
    const pxTotal = (sourceW * dpr) * (sourceH * dpr);
    if(pxTotal > MAX_OFFSCREEN_PX){
      console.warn("离屏画布像素超限(IOS)，跳过圆角缓存，使用实时绘制", srcUrl);
      return null;
    }
  }
  const cacheKey = `${srcUrl}||${sourceW}x${sourceH}||${radius}||${dpr}`;
  if (roundImageCache.has(cacheKey)) {
    return roundImageCache.get(cacheKey);
  }
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sourceW * dpr;
  offCanvas.height = sourceH * dpr;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return null;
  offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = "high";
  offCtx.webkitImageSmoothingEnabled = true;
  try {
    offCtx.save();
    offCtx.scale(dpr, dpr);
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
    console.warn("离屏画布绘制异常", srcUrl, e);
    // =========【补丁3‑2】异常时销毁失败画布，不要留在内存 ==========
    offCanvas.width = 0;
    offCanvas.height = 0;
    return null;
  }
  roundImageCache.set(cacheKey, offCanvas);
  return offCanvas;
}

// ============================================================
// 预生成所有圆角画布函数（放在 loadImagesWithLimit 上方）
// ============================================================
/**
 * 根据图片缓存，预生成所有需要用到的圆角离屏画布
 * 提前一次性全部生成，绘制阶段不再实时计算
 * @param {Map<string, ImageBitmap>} imageCache
 * @param {Array<{src:string, radius:number}>} roundTaskList
 */
async function preGenerateAllRoundCanvas(imageCache, roundTaskList) {
  // 去重任务，只保留 src 和 radius
  const taskMap = new Map();
  for (const task of roundTaskList) {
    const { src, radius } = task;
    const img = imageCache.get(src);
    if (!img) {
      console.warn("预生成圆角画布跳过：图片不存在", src);
      continue;
    }
    const sourceW = (img.naturalWidth ?? img.width) || 1;
    const sourceH = (img.naturalHeight ?? img.height) || 1;
    const dpr = currentDPR;
    const cacheKey = `${src}||${sourceW}x${sourceH}||${radius}||${dpr}`;
    if (!taskMap.has(cacheKey)) {
      taskMap.set(cacheKey, { src, radius });
    }
  }
  // 串行预生成（移动端避免并发离屏画布抢占GPU）
  let roundTaskIndex = 0;
  const totalRoundTask = taskMap.size;
  for (const task of taskMap.values()) {
    const { src, radius } = task;
    const img = imageCache.get(src);
    const canvas = createRoundImageCanvas(img, src, radius);
    if (!canvas) {
      console.warn("预生成圆角画布创建失败，运行时尝试实时生成", src);
    }
    // IOS加大离屏画布生成间隔，缓解GPU队列拥堵
    const delayMs = IS_IOS_WEBKIT ? 30 : 12;
    await new Promise(r => setTimeout(r, delayMs));
    // ===================== 【补丁新增：圆角画布阶段进度】 =====================
    roundTaskIndex += 1;
    if(totalRoundTask > 0){
      // 图片加载占45，本阶段区间：45 ~ 60
      const roundStagePercent = 45 + (roundTaskIndex / totalRoundTask) * 15;
      emitRenderProgress(roundStagePercent);
    }
    // ===================== 补丁结束 =====================
  }
  // 多层帧等待，低性能移动端充分刷新渲染队列
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 50));
  // =========【补丁7】仅IOS：限制圆角离屏缓存最大数量，防止IOS内存爆炸 ==========
  if(IS_IOS_WEBKIT){
    const MAX_ROUND_CACHE = 80;
    if(roundImageCache.size > MAX_ROUND_CACHE){
      const needDelete = roundImageCache.size - MAX_ROUND_CACHE;
      let delCount = 0;
      for(const [key, c] of roundImageCache){
        if(delCount >= needDelete) break;
        c.width = 0;
        c.height = 0;
        roundImageCache.delete(key);
        delCount++;
      }
    }
  }
}

// ============================================================
// 重写 loadImagesWithLimit：增加重试、尺寸校验、帧等待
// 移动端容错模式：失败图片不阻断渲染，控制台警告
// ============================================================
async function loadImagesWithLimit(urlList, limit) {
  const uniqueUrls = [...new Set(urlList)];
  const resultMap = new Map();
  let index = 0;

  // 单张图片加载，最多重试2次，拉长重试间隔，适配国内网络抖动
  async function loadSingleUrl(url, retryCount = 2) {
    try {
      const bitmap = await preloadImageBitmap(url);
      // 移动端严格校验bitmap有效尺寸
      if (!bitmap || bitmap.width === 0 || bitmap.height === 0) {
        throw new Error("bitmap empty size");
      }
      // IOS额外帧等待，解决bitmap resolve但显存未就绪绘制空白
      if(IS_IOS_WEBKIT){
        await new Promise(r => requestAnimationFrame(r));
      }
      rawImageResourceCache.set(url, { type: 'bitmap', data: bitmap });
      return bitmap;
    } catch (err) {
      if (retryCount > 0) {
        console.warn(`图片加载重试[剩余${retryCount}次]:`, url, err);
        await new Promise(r => setTimeout(r, 600));
        return loadSingleUrl(url, retryCount - 1);
      }
      console.warn('ImageBitmap加载失败，尝试降级HTML Image：', url, err);
      // 移动端降级：使用传统Image对象，规避各类浏览器bitmap渲染bug
      try {
        const img = await preloadAndDecodeImage(url);
        await new Promise(resolve => requestAnimationFrame(resolve));
        rawImageResourceCache.set(url, { type: 'image', data: img });
        return img;
      } catch (imgErr) {
        console.error('图片最终加载失败：', url, imgErr);
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
      // ===================== 【补丁新增：图片加载阶段进度】 =====================
      const doneCount = resultMap.size;
      const totalImg = uniqueUrls.length;
      if(totalImg > 0){
        const imgStagePercent = (doneCount / totalImg) * 45;
        emitRenderProgress(imgStagePercent);
      }
      // ===================== 补丁结束 =====================
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);

  // ==========【移动端容错模式】失败图片不阻断渲染 ==========
  const failList = [];
  for (const [u, val] of resultMap.entries()) {
    if (!val) failList.push(u);
  }
  // 将失败列表附加到返回对象，上层可以拿到失败url
  const returnObj = {
    resultMap,
    failList
  };
  if (failList.length > 0) {
    console.warn("⚠️ 部分图片加载失败，继续渲染（空白占位）：", failList);
  }
  // 多层帧等待，给浏览器完成光栅化，解决bitmap resolve但绘制空白
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 30));
  return returnObj;
}

// ============================ Canvas 布局绘制器 ============================

export class CanvasLayoutPainter {
  constructor(canvas, designWidth, designHeight, bgColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.designWidth = designWidth;
    this.designHeight = designHeight;
    this.baseWidth = designWidth;
    this.y = LAYOUT_SPACE.BODY_PADDING;
    this.bgColor = bgColor;

    const dpr = currentDPR;
    this.canvas.width = designWidth * dpr;
    this.canvas.height = designHeight * dpr;
    this.canvas.style.width = `${designWidth}px`;
    this.canvas.style.height = `${designHeight}px`;

    this.ctx.scale(dpr, dpr);
    this.ctx.textBaseline = 'top';

    // 图像平滑兼容补齐（移动端各浏览器）
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.webkitImageSmoothingEnabled = true;
    this.ctx.msImageSmoothingEnabled = true;
    this.ctx.mozImageSmoothingEnabled = true;

    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.designWidth, this.designHeight);
  }

  resetY() {
    this.y = LAYOUT_SPACE.BODY_PADDING;
  }

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
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  drawText(text, x, y, size, color, font = FONT_SIYUAN, bold = false) {
    const fontStr = bold ? `bold ${size}px ${font}` : `${size}px ${font}`;
    this.ctx.font = fontStr;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }

  drawTextCenter(text, centerX, y, size, color, font = FONT_SIYUAN, bold = false) {
    const fontStr = bold ? `bold ${size}px ${font}` : `${size}px ${font}`;
    this.ctx.font = fontStr;
    const w = this.ctx.measureText(text).width;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, centerX - w / 2, y);
  }

  drawTextWrapCenterInBox(text, boxX, boxY, boxW, boxH, fontSize, color, lineHeight = fontSize * 1.4) {
    const ctx = this.ctx;
    ctx.font = `${fontSize}px ${FONT_SIYUAN}`;
    ctx.fillStyle = color;
    const chars = Array.from(text);
    let line = '';
    const lines = [];
    for (let n = 0; n < chars.length; n++) {
      const testLine = line + chars[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > boxW && n > 0) {
        lines.push(line);
        line = chars[n];
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    const totalTextH = lines.length * lineHeight;
    const startY = boxY + (boxH - totalTextH) / 2;
    let currentY = startY;
    for (const l of lines) {
      const mt = ctx.measureText(l);
      const lw = Number.isFinite(mt.width) ? mt.width : 0;
      const lx = boxX + (boxW - lw) / 2;
      ctx.fillText(l, lx, currentY);
      currentY += lineHeight;
    }
  }

  drawImageRound(roundCanvas, x, y, w, h) {
    this.ctx.drawImage(
      roundCanvas,
      0, 0, roundCanvas.width, roundCanvas.height,
      x, y, w, h
    );
  }

  drawHeartRate(x, y, rate, heartSize = 26, gap = 6, activeColor, grayColor) {
    const ctx = this.ctx;
    let currentX = x;
    const createHeartPath = (scale) => {
      const path = new Path2D();
      const s = scale / 24;
      path.moveTo(12 * s, 21.35 * s);
      path.bezierCurveTo(
        5.4 * s, 15.36 * s,
        2 * s, 12.28 * s,
        2 * s, 8.5 * s
      );
      path.bezierCurveTo(
        2 * s, 5.42 * s,
        4.42 * s, 3 * s,
        7.5 * s, 3 * s
      );
      path.bezierCurveTo(
        9.24 * s, 3 * s,
        10.91 * s, 3.81 * s,
        12 * s, 5.09 * s
      );
      path.bezierCurveTo(
        13.09 * s, 3.81 * s,
        14.76 * s, 3 * s,
        16.5 * s, 3 * s
      );
      path.bezierCurveTo(
        19.58 * s, 3 * s,
        22 * s, 5.42 * s,
        22 * s, 8.5 * s
      );
      path.bezierCurveTo(
        22 * s, 12.28 * s,
        18.6 * s, 15.36 * s,
        12 * s, 21.35 * s
      );
      path.closePath();
      return path;
    };

    const heartPath = createHeartPath(heartSize);
    for (let i = 1; i <= 5; i++) {
      ctx.save();
      ctx.translate(currentX, y);
      ctx.fillStyle = i <= rate ? activeColor : grayColor;
      ctx.fill(heartPath);
      ctx.restore();
      currentX += heartSize + gap;
    }
  }

  shiftY(px) {
    this.y += px;
  }

  getY() {
    return this.y;
  }
}

// ============================ 高度计算辅助 ============================

function calcCharCardHeight(ctx, charName, cardWidth, fontSize = 14) {
  const innerPad = LAYOUT_SPACE.CHAR_CARD_INNER_PADDING;
  const imgSize = cardWidth - innerPad * 2;
  const nameMaxWidth = cardWidth - innerPad * 2;
  const nameHeight = measureWrappedHeight(ctx, charName, nameMaxWidth, fontSize * 1.4, fontSize);
  const totalHeight = innerPad * 2 + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB + nameHeight + innerPad;
  return Math.max(totalHeight, LAYOUT_SPACE.CHAR_CARD_MIN_H);
}

function calcCardsPerRow(cardWidth, gap, containerWidth) {
  return Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
}

function calcCharAreaHeight(ctx, charItems, containerWidth, cardWidth, gap, fontSize, hasTitle, titleHeight, titleMarginBottom) {
  if (!charItems || charItems.length === 0) return { height: 0, rows: 0 };
  const cardsPerRow = calcCardsPerRow(cardWidth, gap, containerWidth);
  const rows = Math.ceil(charItems.length / cardsPerRow);
  let maxCardHeight = LAYOUT_SPACE.CHAR_CARD_MIN_H;
  charItems.forEach(item => {
    const h = calcCharCardHeight(ctx, item.displayName || item.name, cardWidth, fontSize);  // ✅补丁
    if (h > maxCardHeight) maxCardHeight = h;
  });
  let height = rows * maxCardHeight + (rows - 1) * gap;
  if (hasTitle) {
    height += titleHeight + titleMarginBottom;
  }
  return { height, rows, maxCardHeight };
}

// ============================ 预计算高度（用于分页） ============================

function calcHeaderVirtualHeight(targetWidth, appData) {
  const { baseInfo } = appData;
  const virtualCanvas = document.createElement('canvas');
  const vCtx = virtualCanvas.getContext('2d');
  let cursorY = LAYOUT_SPACE.BODY_PADDING;

  const BODY_PAD = LAYOUT_SPACE.BODY_PADDING;
  const WRAP_MAX_W = 1200;
  const wrapW = Math.min(WRAP_MAX_W, targetWidth - BODY_PAD * 2);

  cursorY += 42 + LAYOUT_SPACE.SITE_TITLE_MT + LAYOUT_SPACE.SITE_TITLE_MB;

  const baseLines = [];
  if (baseInfo.nick?.trim()) baseLines.push(`昵称：${baseInfo.nick.trim()}`);
  if (baseInfo.count?.trim()) baseLines.push(`游玩总数：${baseInfo.count.trim()}`);
  if (baseInfo.story?.trim()) baseLines.push(`入坑时间：${baseInfo.story.trim()}`);
  if (baseInfo.firstgame?.trim()) baseLines.push(`入坑作品：${baseInfo.firstgame.trim()}`);

  if (baseLines.length > 0) {
    const innerPad = LAYOUT_SPACE.BIG_CARD_PADDING;
    const h2FontSize = 24;
    const lineFontSize = 16;
    const lineHeight = 26;
    const maxLineWidth = wrapW - innerPad * 2;

    let contentHeight = 0;
    baseLines.forEach(line => {
      contentHeight += measureWrappedHeight(vCtx, line, maxLineWidth, lineHeight, lineFontSize);
    });
    const h2Height = h2FontSize + LAYOUT_SPACE.BIG_CARD_H2_MB;
    const cardH = innerPad * 2 + h2Height + contentHeight;
    cursorY += cardH;
    cursorY += LAYOUT_SPACE.WRAP_GAP;
  }

  cursorY += LAYOUT_SPACE.WRAP_GAP;
  // ==========【补丁2‑1】用完销毁虚拟画布，释放IOS显存 ==========
  virtualCanvas.width = 0;
  virtualCanvas.height = 0;
  return cursorY;
}

// ========== 【修改后】测量游戏标题行（含爱心）高度，自动处理名称换行 + 爱心换行 ==========
function measureGameTitleWithHeartHeight(vCtx, cardX, gameCardW, gameName) {
  const nameFontSize = 22;
  const HEART_SIZE = 26;
  const HEART_GAP = 6;
  const cardInnerPad = LAYOUT_SPACE.ADDED_GAME_CARD_PADDING;
  const fontStr = `bold ${nameFontSize}px ${FONT_SIYUAN}`;
  vCtx.font = fontStr;
  const textMaxWidth = gameCardW - cardInnerPad * 2;
  // 【新增】先测量游戏名称自动换行高度
  const nameLineHeight = nameFontSize * 1.3;
  const nameWrapHeight = measureWrappedHeight(vCtx, gameName, textMaxWidth, nameLineHeight, nameFontSize, true);

  const nameX = cardX + cardInnerPad;
  const nameTextWidth = vCtx.measureText(gameName).width;
  const heartStartX = nameX + nameTextWidth + 14;
  const rightLimit = gameCardW + cardX - cardInnerPad;
  const heartTotalWidth = HEART_SIZE * 5 + HEART_GAP * 4;
  const heartWrap = heartStartX + heartTotalWidth > rightLimit;

  let totalTitleHeight = nameWrapHeight;
  // 爱心换行，追加一行爱心高度
  if (heartWrap) {
    totalTitleHeight += HEART_SIZE;
  }
  // 追加标题底部间距
  totalTitleHeight += LAYOUT_SPACE.GAME_CARD_HEAD_MB;
  return totalTitleHeight;
}

// ============================ 【修改后】calcSingleGameBlockHeight ============================
function calcSingleGameBlockHeight(targetWidth, renderData) {
  const { gameInfo, charItems, cpItems, gameItem } = renderData;
  const virtualCanvas = document.createElement('canvas');
  const vCtx = virtualCanvas.getContext('2d');

  const BODY_PAD = LAYOUT_SPACE.BODY_PADDING;
  const WRAP_MAX_W = 1200;
  const wrapW = Math.min(WRAP_MAX_W, targetWidth - BODY_PAD * 2);
  const wrapX = Math.max(BODY_PAD, (targetWidth - wrapW) / 2);
  const cardX = wrapX;

  const cardInnerPad = LAYOUT_SPACE.ADDED_GAME_CARD_PADDING;
  const gameCardW = wrapW;
  const textMaxW = gameCardW - cardInnerPad * 2;

  // =========【修改：读取自定义导出文本字号，默认16px】=========
  const textSize = renderData.appData.exportCustomTextFontSize ?? 16;
  const lineHeight = textSize * 1.45;

  // =========【修改：动态计算标题高度】=========
  const nameHeight = measureGameTitleWithHeartHeight(vCtx, cardX, gameCardW, gameInfo.name);
  const HEART_AREA_HEIGHT = 0;

  // =========【补丁：固定间隔，间隔不再随字号变化】=========
  const FIX_GAMEHEAD_TOP = -5;
  const FIX_GAMEHEAD_BOTTOM = 12;
  const FIX_CHARSEC_TOP = 14;
  const FIX_CHARSEC_BOTTOM = 6;
  const FIX_CPSEC_TOP = 14;
  // cpSectionText特殊：底部间距0px
  const FIX_CPSEC_BOTTOM = 0;

  let headTextHeight = 0;
  if (gameItem.gameHeadText?.trim()) {
    headTextHeight = measureWrappedHeight(vCtx, gameItem.gameHeadText.trim(), textMaxW, lineHeight, textSize);
    headTextHeight += FIX_GAMEHEAD_TOP + FIX_GAMEHEAD_BOTTOM;
  }

  let charSectionTextHeight = 0;
  if (gameItem.charSectionText?.trim()) {
    charSectionTextHeight = measureWrappedHeight(vCtx, gameItem.charSectionText.trim(), textMaxW, lineHeight, textSize);
    charSectionTextHeight += FIX_CHARSEC_TOP + FIX_CHARSEC_BOTTOM;
  }

  let cpSectionTextHeight = 0;
  if (gameItem.cpSectionText?.trim()) {
    cpSectionTextHeight = measureWrappedHeight(vCtx, gameItem.cpSectionText.trim(), textMaxW, lineHeight, textSize);
    cpSectionTextHeight += FIX_CPSEC_TOP + FIX_CPSEC_BOTTOM;
  }

  let charAreaHeight = 0;
  if (charItems.length > 0) {
    const titleH = 18 + 4;
    const titleMb = 8;
    const area = calcCharAreaHeight(
      vCtx,
      charItems,
      gameCardW - cardInnerPad * 2,
      LAYOUT_SPACE.CHAR_CARD_W,
      LAYOUT_SPACE.CHAR_ROW_GAP,
      14,
      true,
      titleH,
      titleMb
    );
    charAreaHeight = area.height;
  }

  let cpAreaHeight = 0;
  if (cpItems.length > 0) {
    const titleH = 18 + 8;
    let totalCpHeight = titleH;
    if (charItems.length > 0) {
      totalCpHeight += 8;
    }
    const femaleCardWidth = LAYOUT_SPACE.CHAR_CARD_W;
    const maleCardWidth = LAYOUT_SPACE.CHAR_CARD_W;
    const maleGap = LAYOUT_SPACE.CP_MALE_GAP;
    const colGap = LAYOUT_SPACE.CP_COLUMN_GAP;
    const maleContainerWidth = (gameCardW - cardInnerPad * 2) - femaleCardWidth - colGap;

    for (const cp of cpItems) {
      const fHeight = calcCharCardHeight(vCtx, cp.femaleDisplayName || cp.femaleName, femaleCardWidth, 14);  // ✅补丁
      let maxMaleH = LAYOUT_SPACE.CHAR_CARD_MIN_H;
      cp.maleItems.forEach(m => {
        const h = calcCharCardHeight(vCtx, m.displayName || m.name, maleCardWidth, 14);  // ✅补丁
        if (h > maxMaleH) maxMaleH = h;
      });
      const perRow = calcCardsPerRow(maleCardWidth, maleGap, maleContainerWidth);
      const maleRows = Math.ceil(cp.maleItems.length / perRow);
      const maleAreaH = maleRows * maxMaleH + (maleRows - 1) * maleGap;
      // ----- 将间距移入 totalCpHeight 累加 -----
      const rowH = Math.max(fHeight, maleAreaH);
      totalCpHeight += rowH + (LAYOUT_SPACE.CP_ROW_MARGIN || 16);
    }
    cpAreaHeight = totalCpHeight;
  }

  // =========【修改：叠加三处自定义文本高度】=========
  const totalCardH = cardInnerPad * 2
    + nameHeight + HEART_AREA_HEIGHT
    + headTextHeight
    + charAreaHeight
    + charSectionTextHeight
    + cpAreaHeight
    + cpSectionTextHeight;
  // ==========【补丁2‑2】测量完成销毁虚拟画布 ==========
  virtualCanvas.width = 0;
  virtualCanvas.height = 0;
  return totalCardH;
}

function preCalcLayoutHeight(targetWidth, appData, gameTemplateList, renderDataList) {
  const headerHeight = calcHeaderVirtualHeight(targetWidth, appData);
  const gameBlockHeights = renderDataList.map(data => calcSingleGameBlockHeight(targetWidth, data));
  return { headerHeight, gameBlockHeights };
}

function splitPagesByHeight(headerHeight, gameBlockHeights, maxH) {
  const pages = [];
  let ptr = 0;
  const totalGame = gameBlockHeights.length;
  const CARD_GAP = LAYOUT_SPACE.ADDED_GAME_CARD_MB;
  if (totalGame === 0) return pages;

  const firstPageAvailableH = maxH - headerHeight;
  const accumulateList = [];
  let sumH = 0;
  for (let i = ptr; i < totalGame; i++) {
    const blockH = gameBlockHeights[i];
    if (i > ptr) sumH += CARD_GAP;
    sumH += blockH;
    accumulateList.push(sumH);
  }

  const candidates = [];
  for (let count = 1; count <= accumulateList.length; count++) {
    const usedH = accumulateList[count - 1];
    candidates.push({
      count,
      usedH,
      diff: Math.abs(usedH - firstPageAvailableH),
      isOver: usedH > firstPageAvailableH
    })
  }

  const fitCandidates = candidates.filter(c => !c.isOver);
  let targetCandidates;
  if (fitCandidates.length > 0) {
    targetCandidates = fitCandidates.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return b.count - a.count;
    });
  } else {
    targetCandidates = candidates.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return b.count - a.count;
    });
  }

  const bestItem = targetCandidates[0];
  bestItem.count = Math.max(1, Math.min(bestItem.count, totalGame - ptr));

  const firstPageGameIndexes = [];
  for (let i = 0; i < bestItem.count; i++) {
    firstPageGameIndexes.push(ptr + i);
  }
  pages.push({ isFirstPage: true, gameIndexes: firstPageGameIndexes });
  // console.log("【第一页分页计算】参考可用高度：", firstPageAvailableH, "选中卡片数量：", bestItem.count, "占用高度：", bestItem.usedH, "差值：", bestItem.diff);
  ptr += bestItem.count;

  while (ptr < totalGame) {
    const accumulateList2 = [];
    let sumH2 = 0;
    for (let i = ptr; i < totalGame; i++) {
      const blockH = gameBlockHeights[i];
      if (i > ptr) sumH2 += CARD_GAP;
      sumH2 += blockH;
      accumulateList2.push(sumH2);
    }

    const candidates2 = [];
    for (let count = 1; count <= accumulateList2.length; count++) {
      const usedH = accumulateList2[count - 1];
      candidates2.push({
        count,
        usedH,
        diff: Math.abs(usedH - maxH),
        isOver: usedH > maxH
      })
    }

    const fitCandidates2 = candidates2.filter(c => !c.isOver);
    let targetCandidates2;
    if (fitCandidates2.length > 0) {
      targetCandidates2 = fitCandidates2.sort((a, b) => {
        if (a.diff !== b.diff) return a.diff - b.diff;
        return b.count - a.count;
      });
    } else {
      targetCandidates2 = candidates2.sort((a, b) => {
        if (a.diff !== b.diff) return a.diff - b.diff;
        return b.count - a.count;
      });
    }

    const bestItem2 = targetCandidates2[0];
    const remainGame = totalGame - ptr;
    bestItem2.count = Math.max(1, Math.min(bestItem2.count, remainGame));

    // console.log("【后续页面分页计算】参考高度：", maxH, "选中卡片数量：", bestItem2.count, "占用高度：", bestItem2.usedH, "差值：", bestItem2.diff);

    const pageGameIndexes = [];
    for (let i = 0; i < bestItem2.count; i++) {
      pageGameIndexes.push(ptr + i);
    }
    pages.push({ isFirstPage: false, gameIndexes: pageGameIndexes });
    // console.log(`ptr推进：${ptr} → ${ptr + bestItem2.count}`);
    ptr += bestItem2.count;
  }

  // console.log("✅ 最终分页方案：", JSON.parse(JSON.stringify(pages)));
  return pages;
}

// ============================ 绘制函数 ============================

async function drawHeaderBlock(painter, targetWidth, appData) {
  const { exportColor, baseInfo } = appData;

  const BODY_PAD = LAYOUT_SPACE.BODY_PADDING;
  const WRAP_MAX_W = 1200;
  const wrapW = Math.min(WRAP_MAX_W, targetWidth - BODY_PAD * 2);
  const wrapX = Math.max(BODY_PAD, (targetWidth - wrapW) / 2);

  painter.drawTextCenter('Otome FavList', targetWidth / 2, painter.y, 42, exportColor.title, 'sans-serif', true);
  painter.shiftY(42 + LAYOUT_SPACE.SITE_TITLE_MT + LAYOUT_SPACE.SITE_TITLE_MB);

  const baseLines = [];
  if (baseInfo.nick?.trim()) baseLines.push(`昵称：${baseInfo.nick.trim()}`);
  if (baseInfo.count?.trim()) baseLines.push(`游玩总数：${baseInfo.count.trim()}`);
  if (baseInfo.story?.trim()) baseLines.push(`入坑时间：${baseInfo.story.trim()}`);
  if (baseInfo.firstgame?.trim()) baseLines.push(`入坑作品：${baseInfo.firstgame.trim()}`);

  if (baseLines.length > 0) {
    const cardTop = painter.y;
    const cardX = wrapX;
    const cardW = wrapW;
    const innerPad = LAYOUT_SPACE.BIG_CARD_PADDING;
    const h2FontSize = 24;
    const lineFontSize = 16;
    const lineHeight = 26;
    const maxLineWidth = cardW - innerPad * 2;

    let contentHeight = 0;
    baseLines.forEach(line => {
      contentHeight += measureWrappedHeight(painter.ctx, line, maxLineWidth, lineHeight, lineFontSize);
    });
    const h2Height = h2FontSize + LAYOUT_SPACE.BIG_CARD_H2_MB;
    const cardH = innerPad * 2 + h2Height + contentHeight;

    painter.drawRoundRect(
      cardX, cardTop, cardW, cardH,
      LAYOUT_STYLE.BIG_CARD_RADIUS,
      '#ffffff',
      exportColor.border,
      LAYOUT_STYLE.BIG_CARD_BORDER_WIDTH
    );

    let y = cardTop + innerPad;
    painter.drawText('基础信息', cardX + innerPad, y, h2FontSize, exportColor.subTitle, FONT_SIYUAN, true);
    y += h2FontSize + LAYOUT_SPACE.BIG_CARD_H2_MB;

    baseLines.forEach(line => {
      const usedH = wrapText(painter.ctx, line, cardX + innerPad, y, maxLineWidth, lineHeight, lineFontSize, exportColor.baseInfoText);
      y += usedH;
    });

    painter.shiftY(cardH);
    painter.shiftY(LAYOUT_SPACE.WRAP_GAP);
  }
}

// ============================ 【修改后】drawSingleGameCard ============================
async function drawSingleGameCard(painter, targetWidth, renderData, imageCache, isLastCard = false) {
  const { gameInfo, charItems, cpItems, gameItem } = renderData;
  const { exportColor } = renderData.appData || {};

  const BODY_PAD = LAYOUT_SPACE.BODY_PADDING;
  const WRAP_MAX_W = 1200;
  const wrapW = Math.min(WRAP_MAX_W, targetWidth - BODY_PAD * 2);
  const wrapX = Math.max(BODY_PAD, (targetWidth - wrapW) / 2);

  const cardInnerPad = LAYOUT_SPACE.ADDED_GAME_CARD_PADDING;
  const gameCardW = wrapW;
  const cardX = wrapX;
  const cardTop = painter.y;

  const nameFontSize = 22;
  const HEART_SIZE = 26;
  const HEART_GAP = 6;
  const nameLineHeight = nameFontSize * 1.3;
  const textMaxWidth = gameCardW - cardInnerPad * 2;

  let charAreaHeight = 0;
  let charCardHeight = LAYOUT_SPACE.CHAR_CARD_MIN_H;
  if (charItems.length > 0) {
    const titleH = 18 + 4;
    const titleMb = 8;
    const area = calcCharAreaHeight(
      painter.ctx,
      charItems,
      gameCardW - cardInnerPad * 2,
      LAYOUT_SPACE.CHAR_CARD_W,
      LAYOUT_SPACE.CHAR_ROW_GAP,
      14,
      true,
      titleH,
      titleMb
    );
    charAreaHeight = area.height;
    charCardHeight = area.maxCardHeight;
  }

  let cpAreaHeight = 0;
  if (cpItems.length > 0) {
    const titleH = 18 + 8;
    let totalCpHeight = titleH;
    const femaleCardWidth = LAYOUT_SPACE.CHAR_CARD_W;
    const maleCardWidth = LAYOUT_SPACE.CHAR_CARD_W;
    const maleGap = LAYOUT_SPACE.CP_MALE_GAP;
    const colGap = LAYOUT_SPACE.CP_COLUMN_GAP;
    const maleContainerWidth = (gameCardW - cardInnerPad * 2) - femaleCardWidth - colGap;

    for (const cp of cpItems) {
      const fHeight = calcCharCardHeight(painter.ctx, cp.femaleDisplayName || cp.femaleName, femaleCardWidth, 14);  // ✅补丁
      let maxMaleH = LAYOUT_SPACE.CHAR_CARD_MIN_H;
      cp.maleItems.forEach(m => {
        const h = calcCharCardHeight(painter.ctx, m.displayName || m.name, maleCardWidth, 14);  // ✅补丁
        if (h > maxMaleH) maxMaleH = h;
      });
      const perRow = calcCardsPerRow(maleCardWidth, maleGap, maleContainerWidth);
      const maleRows = Math.ceil(cp.maleItems.length / perRow);
      const maleAreaH = maleRows * maxMaleH + (maleRows - 1) * maleGap;
      const rowH = Math.max(fHeight, maleAreaH) + (LAYOUT_SPACE.CP_ROW_MARGIN || 16);
      totalCpHeight += rowH;
    }
    cpAreaHeight = totalCpHeight;
  }

  const cardH = calcSingleGameBlockHeight(targetWidth, renderData);

  painter.drawRoundRect(
    cardX, cardTop, gameCardW, cardH,
    LAYOUT_STYLE.GAME_CARD_RADIUS,
    '#ffffff',
    exportColor.border,
    1
  );

  let drawY = cardTop + cardInnerPad;

  const nameX = cardX + cardInnerPad;
  const nameBaselineY = drawY;

  // ========== 【修改】绘制游戏标题，自动换行 ==========
  const usedNameHeight = wrapText(
    painter.ctx,
    gameInfo.name,
    nameX,
    nameBaselineY,
    textMaxWidth,
    nameLineHeight,
    nameFontSize,
    exportColor.gameName,
    FONT_SIYUAN,
    true
  );

  // 判断爱心是否需要换行
  painter.ctx.font = `bold ${nameFontSize}px ${FONT_SIYUAN}`;
  const nameTextWidth = painter.ctx.measureText(gameInfo.name).width;
  const heartStartX = nameX + nameTextWidth + 14;
  const rightLimit = gameCardW + cardX - cardInnerPad;
  const heartTotalWidth = HEART_SIZE * 5 + HEART_GAP * 4;

  let heartDrawY;
  if (heartStartX + heartTotalWidth > rightLimit) {
    // 爱心换行：绘制在名称下方
    heartDrawY = nameBaselineY + usedNameHeight;
    painter.drawHeartRate(
      nameX, heartDrawY,
      gameItem.loveRate || 0,
      HEART_SIZE, HEART_GAP,
      '#e895a8', '#cccccc'
    );
  } else {
    // 爱心同行：垂直居中在第一行
    heartDrawY = nameBaselineY + (nameFontSize - HEART_SIZE) / 2;
    painter.drawHeartRate(
      heartStartX, heartDrawY,
      gameItem.loveRate || 0,
      HEART_SIZE, HEART_GAP,
      '#e895a8', '#cccccc'
    );
  }

  // ========== 【关键】drawY 移动真实总标题高度 ==========
  const totalTitleHeight = measureGameTitleWithHeartHeight(painter.ctx, cardX, gameCardW, gameInfo.name);
  drawY += totalTitleHeight;

  // ========== 绘制【游戏标题爱心下方自定义文字】 ==========
  if (renderData.gameItem.gameHeadText?.trim()) {
      const FIX_GAMEHEAD_TOP = -5;
      const FIX_GAMEHEAD_BOTTOM = 12;
      const textX = cardX + cardInnerPad;
      const textMaxW = gameCardW - cardInnerPad * 2;
      const textSize = renderData.appData.exportCustomTextFontSize ?? 16;
      const lineHeight = textSize * 1.45;
      // 上方固定间隔
      drawY += FIX_GAMEHEAD_TOP;
      wrapText(
          painter.ctx,
          renderData.gameItem.gameHeadText.trim(),
          textX,
          drawY,
          textMaxW,
          lineHeight,
          textSize,
          exportColor.customText
      );
      const textH = measureWrappedHeight(
          painter.ctx,
          renderData.gameItem.gameHeadText.trim(),
          textMaxW,
          lineHeight,
          textSize
      );
      drawY += textH;
      // 下方固定间隔
      drawY += FIX_GAMEHEAD_BOTTOM;
  }

  // ---- Character ----
  if (charItems.length > 0) {
    painter.drawText('Character', cardX + cardInnerPad, drawY, 18, '#000');
    drawY += 18 + 8;

    const cardW = LAYOUT_SPACE.CHAR_CARD_W;
    const gap = LAYOUT_SPACE.CHAR_ROW_GAP;
    const innerPad = LAYOUT_SPACE.CHAR_CARD_INNER_PADDING;
    const imgSize = cardW - innerPad * 2;
    const maxRowW = gameCardW - cardInnerPad * 2;
    const perRow = calcCardsPerRow(cardW, gap, maxRowW);
    let xPos = cardX + cardInnerPad;
    let yPos = drawY;

    for (let i = 0; i < charItems.length; i++) {
      const item = charItems[i];
      const img = imageCache.get(item.src);
      painter.drawRoundRect(xPos, yPos, cardW, charCardHeight, LAYOUT_STYLE.CHAR_CARD_RADIUS, '#ffffff', '#eee', 1);
      if (img) {
        const imgY = yPos + innerPad;
        const sourceW = (img.naturalWidth ?? img.width) || 1;
        const sourceH = (img.naturalHeight ?? img.height) || 1;
        const dpr = currentDPR;
        const radius = LAYOUT_STYLE.CHAR_IMG_RADIUS;
        const cacheKey = `${item.src}||${sourceW}x${sourceH}||${radius}||${dpr}`;
        let roundCanvas = roundImageCache.get(cacheKey);
        if (!roundCanvas) {
          roundCanvas = createRoundImageCanvas(img, item.src, radius);
        }
        if (roundCanvas) {
          try {
            painter.drawImageRound(roundCanvas, xPos + innerPad, imgY, imgSize, imgSize);
          } catch(e) {
            if(IS_IOS_WEBKIT) console.warn("IOS绘制圆角离屏画布异常，回退clip", e);
            roundCanvas = null;
          }
        }
        if (!roundCanvas) {
          // =========【补丁4】降级clip分支强制try-finally保证restore ==========
          painter.ctx.save();
          try {
            painter.ctx.beginPath();
            painter.ctx.moveTo(xPos + innerPad + radius, imgY);
            painter.ctx.lineTo(xPos + innerPad + imgSize - radius, imgY);
            painter.ctx.quadraticCurveTo(xPos + innerPad + imgSize, imgY, xPos + innerPad + imgSize, imgY + radius);
            painter.ctx.lineTo(xPos + innerPad + imgSize, imgY + imgSize - radius);
            painter.ctx.quadraticCurveTo(xPos + innerPad + imgSize, imgY + imgSize, xPos + innerPad + imgSize - radius, imgY + imgSize);
            painter.ctx.lineTo(xPos + innerPad + radius, imgY + imgSize);
            painter.ctx.quadraticCurveTo(xPos + innerPad, imgY + imgSize, xPos + innerPad, imgY + imgSize - radius);
            painter.ctx.lineTo(xPos + innerPad, imgY + radius);
            painter.ctx.quadraticCurveTo(xPos + innerPad, imgY, xPos + innerPad + radius, imgY);
            painter.ctx.closePath();
            painter.ctx.clip();
            const resourceInfo = rawImageResourceCache.get(item.src);
            const drawTarget = resourceInfo?.type === 'image' ? resourceInfo.data : img;
            painter.ctx.drawImage(drawTarget, xPos + innerPad, imgY, imgSize, imgSize);
          } finally {
            painter.ctx.restore();
          }
        }
      }
      const nameBoxY = yPos + innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB;
      const nameBoxH = charCardHeight - (innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB) - innerPad;
      
      const needDrawName = !(item.isHidden || item.isFD) || renderData.appData.exportShowHiddenFDName;
      if (needDrawName) {
        painter.drawTextWrapCenterInBox(
          item.displayName || item.name,  // ✅补丁：使用用户选择的显示名
          xPos + innerPad,
          nameBoxY,
          cardW - innerPad * 2,
          nameBoxH,
          14,
          '#222'
        );
      }

      xPos += cardW + gap;
      if ((i + 1) % perRow === 0 && i < charItems.length - 1) {
        xPos = cardX + cardInnerPad;
        yPos += charCardHeight + gap;
      }
    }
    drawY = yPos + charCardHeight;
  }

  // ========== 绘制【Character区域下方自定义文字】 ==========
  if (renderData.gameItem.charSectionText?.trim()) {
      const FIX_CHARSEC_TOP = 14;
      const FIX_CHARSEC_BOTTOM = 6;
      const textX = cardX + cardInnerPad;
      const textMaxW = gameCardW - cardInnerPad * 2;
      const textSize = renderData.appData.exportCustomTextFontSize ?? 16;
      const lineHeight = textSize * 1.45;
      drawY += FIX_CHARSEC_TOP;
      wrapText(
          painter.ctx,
          renderData.gameItem.charSectionText.trim(),
          textX,
          drawY,
          textMaxW,
          lineHeight,
          textSize,
          exportColor.customText
      );
      const textH = measureWrappedHeight(
          painter.ctx,
          renderData.gameItem.charSectionText.trim(),
          textMaxW,
          lineHeight,
          textSize
      );
      drawY += textH;
      drawY += FIX_CHARSEC_BOTTOM;
  }

  // ---- Couple ----
  if (cpItems.length > 0) {
    if (charItems.length > 0) {
      drawY += 8;
    }
    painter.drawText('Couple', cardX + cardInnerPad, drawY, 18, '#000');
    drawY += 18 + 8;

    const femaleCardW = LAYOUT_SPACE.CHAR_CARD_W;
    const maleCardW = LAYOUT_SPACE.CHAR_CARD_W;
    const maleGap = LAYOUT_SPACE.CP_MALE_GAP;
    const colGap = LAYOUT_SPACE.CP_COLUMN_GAP;
    const innerPad = LAYOUT_SPACE.CHAR_CARD_INNER_PADDING;
    const imgSize = femaleCardW - innerPad * 2;

    for (const cp of cpItems) {
      const fHeight = calcCharCardHeight(painter.ctx, cp.femaleDisplayName || cp.femaleName, femaleCardW, 14);  // ✅补丁
      const maleContainerW = (gameCardW - cardInnerPad * 2) - femaleCardW - colGap;
      const perRow = calcCardsPerRow(maleCardW, maleGap, maleContainerW);
      const maleRows = Math.ceil(cp.maleItems.length / perRow);
      let maxMaleH = LAYOUT_SPACE.CHAR_CARD_MIN_H;
      cp.maleItems.forEach(m => {
        const h = calcCharCardHeight(painter.ctx, m.displayName || m.name, maleCardW, 14);  // ✅补丁
        if (h > maxMaleH) maxMaleH = h;
      });
      const rowH = Math.max(fHeight, maxMaleH);

      const femaleX = cardX + cardInnerPad;
      const femaleY = drawY;
      painter.drawRoundRect(femaleX, femaleY, femaleCardW, rowH, LAYOUT_STYLE.CHAR_CARD_RADIUS, '#ffffff', '#eee', 1);
      const femaleImg = imageCache.get(cp.femaleSrc);
      if (femaleImg) {
        const imgY = femaleY + innerPad;
        const sourceW = (femaleImg.naturalWidth ?? femaleImg.width) || 1;
        const sourceH = (femaleImg.naturalHeight ?? femaleImg.height) || 1;
        const dpr = currentDPR;
        const radius = LAYOUT_STYLE.CHAR_IMG_RADIUS;
        const cacheKey = `${cp.femaleSrc}||${sourceW}x${sourceH}||${radius}||${dpr}`;
        let roundCanvas = roundImageCache.get(cacheKey);
        if (!roundCanvas) {
          roundCanvas = createRoundImageCanvas(femaleImg, cp.femaleSrc, radius);
        }
        if (roundCanvas) {
          try {
            painter.drawImageRound(roundCanvas, femaleX + innerPad, imgY, imgSize, imgSize);
          } catch(e) {
            if(IS_IOS_WEBKIT) console.warn("IOS绘制圆角离屏画布异常，回退clip", e);
            roundCanvas = null;
          }
        }
        if (!roundCanvas) {
          painter.ctx.save();
          try {
            painter.ctx.beginPath();
            painter.ctx.moveTo(femaleX + innerPad + radius, imgY);
            painter.ctx.lineTo(femaleX + innerPad + imgSize - radius, imgY);
            painter.ctx.quadraticCurveTo(femaleX + innerPad + imgSize, imgY, femaleX + innerPad + imgSize, imgY + radius);
            painter.ctx.lineTo(femaleX + innerPad + imgSize, imgY + imgSize - radius);
            painter.ctx.quadraticCurveTo(femaleX + innerPad + imgSize, imgY + imgSize, femaleX + innerPad + imgSize - radius, imgY + imgSize);
            painter.ctx.lineTo(femaleX + innerPad + radius, imgY + imgSize);
            painter.ctx.quadraticCurveTo(femaleX + innerPad, imgY + imgSize, femaleX + innerPad, imgY + imgSize - radius);
            painter.ctx.lineTo(femaleX + innerPad, imgY + radius);
            painter.ctx.quadraticCurveTo(femaleX + innerPad, imgY, femaleX + innerPad + radius, imgY);
            painter.ctx.closePath();
            painter.ctx.clip();
            const resourceInfo = rawImageResourceCache.get(cp.femaleSrc);
            const drawTarget = resourceInfo?.type === 'image' ? resourceInfo.data : femaleImg;
            painter.ctx.drawImage(drawTarget, femaleX + innerPad, imgY, imgSize, imgSize);
          } finally {
            painter.ctx.restore();
          }
        }
      }
      const fNameBoxY = femaleY + innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB;
      const fNameBoxH = rowH - (innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB) - innerPad;
      painter.drawTextWrapCenterInBox(
        cp.femaleDisplayName || cp.femaleName,  // ✅补丁
        femaleX + innerPad,
        fNameBoxY,
        femaleCardW - innerPad * 2,
        fNameBoxH,
        14,
        '#222'
      );

      const maleStartX = femaleX + femaleCardW + colGap;
      let mx = maleStartX;
      let my = drawY;
      for (let i = 0; i < cp.maleItems.length; i++) {
        const m = cp.maleItems[i];
        const mImg = imageCache.get(m.src);
        painter.drawRoundRect(mx, my, maleCardW, rowH, LAYOUT_STYLE.CHAR_CARD_RADIUS, '#ffffff', '#eee', 1);
        if (mImg) {
          const imgY = my + innerPad;
          const sourceW = (mImg.naturalWidth ?? mImg.width) || 1;
          const sourceH = (mImg.naturalHeight ?? mImg.height) || 1;
          const dpr = currentDPR;
          const radius = LAYOUT_STYLE.CHAR_IMG_RADIUS;
          const cacheKey = `${m.src}||${sourceW}x${sourceH}||${radius}||${dpr}`;
          let roundCanvas = roundImageCache.get(cacheKey);
          if (!roundCanvas) {
            roundCanvas = createRoundImageCanvas(mImg, m.src, radius);
          }
          if (roundCanvas) {
            try {
              painter.drawImageRound(roundCanvas, mx + innerPad, imgY, imgSize, imgSize);
            } catch(e) {
              if(IS_IOS_WEBKIT) console.warn("IOS绘制圆角离屏画布异常，回退clip", e);
              roundCanvas = null;
            }
          }
          if (!roundCanvas) {
            painter.ctx.save();
            try {
              painter.ctx.beginPath();
              painter.ctx.moveTo(mx + innerPad + radius, imgY);
              painter.ctx.lineTo(mx + innerPad + imgSize - radius, imgY);
              painter.ctx.quadraticCurveTo(mx + innerPad + imgSize, imgY, mx + innerPad + imgSize, imgY + radius);
              painter.ctx.lineTo(mx + innerPad + imgSize, imgY + imgSize - radius);
              painter.ctx.quadraticCurveTo(mx + innerPad + imgSize, imgY + imgSize, mx + innerPad + imgSize - radius, imgY + imgSize);
              painter.ctx.lineTo(mx + innerPad + radius, imgY + imgSize);
              painter.ctx.quadraticCurveTo(mx + innerPad, imgY + imgSize, mx + innerPad, imgY + imgSize - radius);
              painter.ctx.lineTo(mx + innerPad, imgY + radius);
              painter.ctx.quadraticCurveTo(mx + innerPad, imgY, mx + innerPad + radius, imgY);
              painter.ctx.closePath();
              painter.ctx.clip();
              const resourceInfo = rawImageResourceCache.get(m.src);
              const drawTarget = resourceInfo?.type === 'image' ? resourceInfo.data : mImg;
              painter.ctx.drawImage(drawTarget, mx + innerPad, imgY, imgSize, imgSize);
            } finally {
              painter.ctx.restore();
            }
          }
        }
        const mNameBoxY = my + innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB;
        const mNameBoxH = rowH - (innerPad + imgSize + LAYOUT_SPACE.CHAR_IMG_BOX_MB) - innerPad;
        
        const needDrawName = !(m.isHidden || m.isFD) || renderData.appData.exportShowHiddenFDName;
        if (needDrawName) {
          painter.drawTextWrapCenterInBox(
            m.displayName || m.name,  // ✅补丁
            mx + innerPad,
            mNameBoxY,
            maleCardW - innerPad * 2,
            mNameBoxH,
            14,
            '#222'
          );
        }

        mx += maleCardW + maleGap;
        if ((i + 1) % perRow === 0 && i < cp.maleItems.length - 1) {
          mx = maleStartX;
          my += rowH + maleGap;
        }
      }
      drawY = my + rowH;
      // ----- 移除多余固定留白，消除couple有无文字时上下间距不一致问题 -----
    }
  }

  // ========== 绘制【Couple区域下方自定义文字】 ==========
  if (renderData.gameItem.cpSectionText?.trim()) {
      const FIX_CPSEC_TOP = 14;
      const FIX_CPSEC_BOTTOM = 0; // couple自定义文本底部无额外间距
      const textX = cardX + cardInnerPad;
      const textMaxW = gameCardW - cardInnerPad * 2;
      const textSize = renderData.appData.exportCustomTextFontSize ?? 16;
      const lineHeight = textSize * 1.45;
      drawY += FIX_CPSEC_TOP;
      wrapText(
          painter.ctx,
          renderData.gameItem.cpSectionText.trim(),
          textX,
          drawY,
          textMaxW,
          lineHeight,
          textSize,
          exportColor.customText
      );
      const textH = measureWrappedHeight(
          painter.ctx,
          renderData.gameItem.cpSectionText.trim(),
          textMaxW,
          lineHeight,
          textSize
      );
      drawY += textH;
      drawY += FIX_CPSEC_BOTTOM;
  }

  painter.shiftY(cardH);
  if (!isLastCard) {
    painter.shiftY(LAYOUT_SPACE.ADDED_GAME_CARD_MB);
  }
}

async function drawFullContent(
  painter,
  targetWidth,
  drawHeader,
  gameIndexList,
  renderDataList,
  appData,
  imageCache
) {
  painter.resetY();

  if (drawHeader) {
    await drawHeaderBlock(painter, targetWidth, appData);
  }

  for (let i = 0; i < gameIndexList.length; i++) {
    const idx = gameIndexList[i];
    const data = renderDataList[idx];
    const isLast = (i === gameIndexList.length - 1);
    await drawSingleGameCard(painter, targetWidth, data, imageCache, isLast);
    // ===================== 【补丁新增：绘制阶段进度 长图/分页共用】 =====================
    const drawDone = i + 1;
    const drawTotal = gameIndexList.length;
    if(drawTotal > 0){
      // 绘制阶段权重40，区间60‑100
      const drawPercent = 60 + (drawDone / drawTotal) * 40;
      emitRenderProgress(drawPercent);
    }
    // ===================== 补丁结束 =====================
  }
}

function cropCanvas(sourceCanvas, designW, designH) {
  const dpr = currentDPR;
  const outputW = designW * dpr;
  const outputH = designH * dpr;

  const cropped = document.createElement('canvas');
  cropped.width = outputW;
  cropped.height = outputH;

  const ctx = cropped.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(sourceCanvas, 0, 0, outputW, outputH, 0, 0, outputW, outputH);
  return cropped;
}

// ============================ 长图高度计算 ============================

function calcTotalVirtualHeight(targetWidth, appData, gameTemplateList, renderDataList) {
  const headerH = calcHeaderVirtualHeight(targetWidth, appData);
  let total = headerH;
  renderDataList.forEach((data, idx) => {
    const cardH = calcSingleGameBlockHeight(targetWidth, data);
    total += cardH;
    if (idx !== renderDataList.length - 1) {
      total += LAYOUT_SPACE.ADDED_GAME_CARD_MB;
    }
  });
  total += LAYOUT_SPACE.BODY_PADDING;
  total += 50;
  total += 20;
  return total;
}

// ============================ 主渲染函数 ============================

export async function renderExportCanvas(
  targetWidth,
  isLongMode,
  maxPageHeight,
  appData,
  gameTemplateList
) {
  const { exportColor, gameList } = appData;

  currentDPR = getExportDPR(targetWidth);
  // ==========【补丁1】仅IOS：释放ImageBitmap资源，避免IOS内存泄漏 ==========
  if(IS_IOS_WEBKIT){
    for (const [k, res] of rawImageResourceCache.entries()) {
      if(res?.type === 'bitmap' && res.data && typeof res.data.close === 'function'){
        try { res.data.close(); } catch(e){}
      }
    }
    roundImageCache.clear();
    rawImageResourceCache.clear();
  }

  let allImageSrcList = [];
  const renderDataList = [];

  for (const gameItem of gameList) {
    if (!appData.exportFoldContent && gameItem.fold === true) {
      continue;
    }

    const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
    if (!gameInfo) continue;

    const globalHide = appData.globalHideChar;
    const globalFD = appData.globalFD;
    const localHide = gameItem.localHideChar;
    const localFD = gameItem.localFD;
    // ✅新增次要角色开关
    const showSub = appData.globalSubChar || (gameItem.localSubChar ?? false);
    // ✅补丁新增：续作/FD次要角色开关
    const showFdSub = appData.globalFdSubChar || (gameItem.localFdSubChar ?? false);
    const charItems = [];
    if (Array.isArray(gameItem.selectChars)) {
      for (const cid of gameItem.selectChars) {
        const char = gameInfo.charList?.find(c => c.id === cid);
        if (!char) continue;
        // ========== ✅改为OR逻辑：统一过滤，角色有多个状态true时任一对应开关开启即显示 ==========
        const isSub = char.isSub ?? false;
        const isHidden = !!char.isHidden;
        const isFD = !!char.isFD;
        const isFdSub = !!char.isFdSub;
        // 普通角色（无任何特殊标记）直接保留
        if (isSub || isHidden || isFD || isFdSub) {
            const pass = (isSub && showSub) || (isHidden && globalHide) || (isFD && globalFD) || (isFdSub && showFdSub);
            if (!pass) continue;
        }
        // ========== 修改结束 ==========
        const avail = getAvailableCharImages(char, globalHide, globalFD, localHide, localFD);
        let allSrc = [];
        avail.forEach(u => allSrc.push(...u.srcList));
        if (allSrc.length === 0) continue;
        const stored = gameItem.selectCharItems?.find(s => s.charId === cid);
        const idx = Number(stored?.imgIndex ?? 0);
        const nameIdx = Number(stored?.nameIndex ?? 0);  // ✅补丁新增
        const src = allSrc[idx] || allSrc[0];
        const canvasSrc = convertR2ToJsDelivr(src);
        // =========【修改点A-1】防火墙：禁止空值、非http、R2 pub地址、github raw地址进入图片队列 ==========
        const isBlockedUrl = (!canvasSrc)
          || (!canvasSrc.startsWith('http'))
          || canvasSrc.startsWith('https://pub-')
          || canvasSrc.includes('raw.githubusercontent.com');
        if (isBlockedUrl) {
          console.error("❌ 禁止加入R2/raw地址到Canvas加载队列，已跳过", canvasSrc);
          continue;
        }
        // ✅补丁新增：计算用户选择的显示名
        const showHide = globalHide || localHide;
        const hasHiddenName = !!char.hiddenName;
        const displayName = (hasHiddenName && showHide && nameIdx === 1) ? (char.hiddenName || char.name || "") : (char.name || "");
        charItems.push({
          id: char.id,
          name: char.name,
          displayName: displayName,  // ✅补丁新增
          src: canvasSrc,
          isHidden: !!char.isHidden,
          isFD: !!char.isFD
        });
        allImageSrcList.push(canvasSrc);
      }
    }

    const cpItems = [];
    if (Array.isArray(gameItem.cpList)) {
      for (const cp of gameItem.cpList) {
        const fChar = gameInfo.charList?.find(c => c.id === cp.femaleId);
        if (!fChar) continue;
        const fAvail = getAvailableCharImages(fChar, globalHide, globalFD, localHide, localFD);
        let fAllSrc = [];
        fAvail.forEach(u => fAllSrc.push(...u.srcList));
        if (fAllSrc.length === 0) continue;
        const fIdx = Number(cp.femaleImgIndex ?? 0);
        const fNameIdx = Number(cp.femaleNameIndex ?? 0);  // ✅补丁新增
        const fSrc = fAllSrc[fIdx] || fAllSrc[0];
        const canvasFSrc = convertR2ToJsDelivr(fSrc);
        // =========【修改点A-2】防火墙：禁止空值、非http、R2 pub地址、github raw地址进入图片队列 ==========
        const isBlockedUrlF = (!canvasFSrc)
          || (!canvasFSrc.startsWith('http'))
          || canvasFSrc.startsWith('https://pub-')
          || canvasFSrc.includes('raw.githubusercontent.com');
        if (isBlockedUrlF) {
          console.error("❌ 禁止加入R2/raw地址到Canvas加载队列，已跳过", canvasFSrc);
          continue;
        }

        const maleItems = [];
        if (Array.isArray(cp.maleItems)) {
          for (const mi of cp.maleItems) {
            const mChar = gameInfo.charList?.find(c => c.id === mi.charId);
            if (!mChar) continue;
            // ========== ✅改为OR逻辑：统一过滤，角色有多个状态true时任一对应开关开启即显示 ==========
            const isSub = mChar.isSub ?? false;
            const isHidden = !!mChar.isHidden;
            const isFD = !!mChar.isFD;
            const isFdSub = !!mChar.isFdSub;
            // 普通角色（无任何特殊标记）直接保留
            if (isSub || isHidden || isFD || isFdSub) {
                const pass = (isSub && showSub) || (isHidden && globalHide) || (isFD && globalFD) || (isFdSub && showFdSub);
                if (!pass) continue;
            }
            // ========== 修改结束 ==========
            const mAvail = getAvailableCharImages(mChar, globalHide, globalFD, localHide, localFD);
            let mAllSrc = [];
            mAvail.forEach(u => mAllSrc.push(...u.srcList));
            if (mAllSrc.length === 0) continue;
            const mIdx = Number(mi.imgIndex ?? 0);
            const mNameIdx = Number(mi.nameIndex ?? 0);  // ✅补丁新增
            const mSrc = mAllSrc[mIdx] || mAllSrc[0];
            const canvasMSrc = convertR2ToJsDelivr(mSrc);
            // =========【修改点A-3】防火墙：禁止空值、非http、R2 pub地址、github raw地址进入图片队列 ==========
            const isBlockedUrlM = (!canvasMSrc)
              || (!canvasMSrc.startsWith('http'))
              || canvasMSrc.startsWith('https://pub-')
              || canvasMSrc.includes('raw.githubusercontent.com');
            if (isBlockedUrlM) {
              console.error("❌ 禁止加入R2/raw地址到Canvas加载队列，已跳过", canvasMSrc);
              continue;
            }
            // ✅补丁新增：男主显示名
            const mShowHide = globalHide || localHide;
            const mHasHiddenName = !!mChar.hiddenName;
            const mDisplayName = (mHasHiddenName && mShowHide && mNameIdx === 1) ? (mChar.hiddenName || mChar.name || "") : (mChar.name || "");
            maleItems.push({
              id: mChar.id,
              name: mChar.name,
              displayName: mDisplayName,  // ✅补丁新增
              src: canvasMSrc,
              isHidden: !!mChar.isHidden,
              isFD: !!mChar.isFD
            });
            allImageSrcList.push(canvasMSrc);
          }
        }
        // ✅补丁新增：女主显示名
        const fShowHide = globalHide || localHide;
        const fHasHiddenName = !!fChar.hiddenName;
        const fDisplayName = (fHasHiddenName && fShowHide && fNameIdx === 1) ? (fChar.hiddenName || fChar.name || "") : (fChar.name || "");
        if (maleItems.length > 0) {
          cpItems.push({
            femaleName: fChar.name,
            femaleDisplayName: fDisplayName,  // ✅补丁新增
            femaleSrc: canvasFSrc,
            maleItems: maleItems
          });
          allImageSrcList.push(canvasFSrc);
        }
      }
    }

    if (charItems.length === 0 && cpItems.length === 0) continue;
    renderDataList.push({
      gameInfo,
      charItems,
      cpItems,
      gameItem,
      appData
    });
  }

  // =========【补丁8】兜底防火墙：再次清洗图片源列表，剔除null/空/R2/raw地址，防止上层逻辑穿透 ==========
  const SAFE_URL_PATTERN = /^(http|https):\/\//;
  const BLOCK_RAW_PATTERN = /raw\.githubusercontent\.com/;
  const BLOCK_R2_PUB_PATTERN = /^https:\/\/pub-/;
  allImageSrcList = allImageSrcList.filter(src => {
    if(!src) return false;
    if(!SAFE_URL_PATTERN.test(src)) return false;
    if(BLOCK_R2_PUB_PATTERN.test(src)) return false;
    if(BLOCK_RAW_PATTERN.test(src)) return false;
    return true;
  });
  // 去重
  allImageSrcList = [...new Set(allImageSrcList)];

  // ===================== 收集所有圆角图片绘制任务（只记录 src 和 radius） =====================
  const roundCanvasTasks = [];
  for (const data of renderDataList) {
    for (const item of data.charItems) {
      // 防御过滤
      if(item.src && SAFE_URL_PATTERN.test(item.src) && !BLOCK_R2_PUB_PATTERN.test(item.src) && !BLOCK_RAW_PATTERN.test(item.src)){
        roundCanvasTasks.push({
          src: item.src,
          radius: LAYOUT_STYLE.CHAR_IMG_RADIUS
        });
      }
    }
    for (const cp of data.cpItems) {
      if(cp.femaleSrc && SAFE_URL_PATTERN.test(cp.femaleSrc) && !BLOCK_R2_PUB_PATTERN.test(cp.femaleSrc) && !BLOCK_RAW_PATTERN.test(cp.femaleSrc)){
        roundCanvasTasks.push({
          src: cp.femaleSrc,
          radius: LAYOUT_STYLE.CHAR_IMG_RADIUS
        });
      }
      for (const m of cp.maleItems) {
        if(m.src && SAFE_URL_PATTERN.test(m.src) && !BLOCK_R2_PUB_PATTERN.test(m.src) && !BLOCK_RAW_PATTERN.test(m.src)){
          roundCanvasTasks.push({
            src: m.src,
            radius: LAYOUT_STYLE.CHAR_IMG_RADIUS
          });
        }
      }
    }
  }
  // ==========================================================================

  if (renderDataList.length === 0) {
    console.warn("没有可导出的游戏卡片");
    return [];
  }

  // 长图模式
  if (isLongMode) {
    const totalHeight = calcTotalVirtualHeight(targetWidth, appData, gameTemplateList, renderDataList);
    const dpr = currentDPR;
    const realCanvasW = targetWidth * dpr;
    const realCanvasH = totalHeight * dpr;
    const totalPixel = realCanvasW * realCanvasH;
    // =========【补丁5】仅IOS长图画布像素预警，超过阈值控制台警告，建议使用分页模式 ==========
    if(IS_IOS_WEBKIT){
      const SAFARI_MAX_PX = 32 * 1024 * 1024;
      if(totalPixel > SAFARI_MAX_PX){
        console.warn(`⚠️ IOS画布总像素超限风险：${totalPixel}，建议切换分页导出，长图可能渲染失败/toBlob返回null`);
      }
    }
    const canvas = document.createElement('canvas');
    const painter = new CanvasLayoutPainter(canvas, targetWidth, totalHeight, exportColor.bg);

    const loadRet = await loadImagesWithLimit(allImageSrcList, MAX_IMAGE_CONCURRENCY);
    const imageCache = loadRet.resultMap;
    const imageFailList = loadRet.failList;

    await preGenerateAllRoundCanvas(imageCache, roundCanvasTasks);
    await new Promise(r => setTimeout(r, 50));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const allIndexes = renderDataList.map((_, idx) => idx);
    await drawFullContent(
      painter,
      targetWidth,
      true,
      allIndexes,
      renderDataList,
      appData,
      imageCache
    );

    const finalHeight = painter.getY() + LAYOUT_SPACE.BODY_PADDING;
    const finalCanvas = cropCanvas(canvas, targetWidth, finalHeight);
    let blob = await new Promise((resolve) => finalCanvas.toBlob(resolve, 'image/png', 1));
    // IOS toBlob null 简易重试
    if(IS_IOS_WEBKIT && !blob){
      console.warn("IOS toBlob 返回null，进行重试");
      await new Promise(r => setTimeout(r, 100));
      blob = await new Promise((resolve) => finalCanvas.toBlob(resolve, 'image/png', 1));
    }
    // ===================== 【补丁新增：强制100%】 =====================
    emitRenderProgress(100);
    const res = [blob];
    res.imageFailList = imageFailList;
    return res;
  }

  // 固定尺寸分页模式
  if (!maxPageHeight || maxPageHeight <= 0) {
    throw new Error('分页模式必须传入有效页面高度');
  }

  const { headerHeight, gameBlockHeights } = preCalcLayoutHeight(
    targetWidth,
    appData,
    gameTemplateList,
    renderDataList
  );

  const pagePlanList = splitPagesByHeight(headerHeight, gameBlockHeights, maxPageHeight);

  const loadRet = await loadImagesWithLimit(allImageSrcList, MAX_IMAGE_CONCURRENCY);
  const imageCache = loadRet.resultMap;
  const imageFailList = loadRet.failList;

  await preGenerateAllRoundCanvas(imageCache, roundCanvasTasks);
  await new Promise(r => setTimeout(r, 50));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const blobList = [];
  let pageIndex = 0;
  const totalPageCount = pagePlanList.length;
  for (const pagePlan of pagePlanList) {
    pageIndex += 1;
    let safeTempHeight = Math.max(maxPageHeight * 4, 6000);
    // IOS临时画布高度硬上限，防止canvas尺寸被WebKit静默置0
    if(IS_IOS_WEBKIT){
      const IOS_TEMP_CANVAS_MAX = 12000;
      if(safeTempHeight > IOS_TEMP_CANVAS_MAX){
        console.warn("IOS分页临时高度超出安全上限，截断", safeTempHeight);
        safeTempHeight = IOS_TEMP_CANVAS_MAX;
      }
    }
    const canvas = document.createElement('canvas');
    const painter = new CanvasLayoutPainter(canvas, targetWidth, safeTempHeight, exportColor.bg);

    await drawFullContent(
      painter,
      targetWidth,
      pagePlan.isFirstPage,
      pagePlan.gameIndexes,
      renderDataList,
      appData,
      imageCache
    );

    const usedHeight = painter.getY() + LAYOUT_SPACE.BODY_PADDING;
    const finalCanvas = cropCanvas(canvas, targetWidth, usedHeight);
    let blob = await new Promise((resolve) => {
      finalCanvas.toBlob((b) => resolve(b), 'image/png', 1);
    });
    // IOS toBlob null 简易重试
    if(IS_IOS_WEBKIT && !blob){
      console.warn("IOS分页toBlob 返回null，进行重试");
      await new Promise(r => setTimeout(r,100));
      blob = await new Promise((resolve) => {
        finalCanvas.toBlob((b) => resolve(b), 'image/png', 1);
      });
    }
    if (blob) blobList.push(blob);
    // =========【补丁6】仅IOS：单页绘制完成立刻释放临时画布，降低IOS多页内存峰值 ==========
    if(IS_IOS_WEBKIT){
      canvas.width = 0;
      canvas.height = 0;
      finalCanvas.width = 0;
      finalCanvas.height = 0;
    }
    // ===================== 【补丁新增：分页模式总进度上报】 =====================
    if(totalPageCount > 0){
      const pagePercent = 60 + (pageIndex / totalPageCount) * 40;
      emitRenderProgress(pagePercent);
    }
    // ===================== 补丁结束 =====================
  }
  // ===================== 【补丁新增：强制100%】 =====================
  emitRenderProgress(100);
  blobList.imageFailList = imageFailList;
  return blobList;
}
