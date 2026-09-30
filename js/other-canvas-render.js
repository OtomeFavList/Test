// other-canvas-render.js
// Other 模式纯 Canvas 绘制导出
// 每个游戏单独生成一张图，固定设计宽度 720，DPR×2 高清输出
import {
  getWebImageUrl,
  preloadImageBitmap,
  preloadAndDecodeImage,
  convertR2ToJsDelivr,
  getAvailableCharImages,
  getCharNameList,
  getCharShowHide,
  LAYOUT_SPACE,
  LAYOUT_STYLE
} from './main.js';
import {
  wrapText,
  measureWrappedHeight,
  CanvasLayoutPainter,
  setCurrentDPR
} from './export-canvas-render.js';

// 常量
const MAX_IMAGE_CONCURRENCY = 4;
const FONT_SIYUAN = "Noto Sans SC, sans-serif";
const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
let DPR = 2;

const DESIGN_W = 720;

// 标题
const TITLE_SIZE = 32;
const GAME_NAME_SIZE = 20;

// 卡片
const CARD_PAD = 16;
const CARD_RADIUS = 12;
const CARD_BORDER_W = 1;

// 封面/子卡片
const COVER_W = 110;
const SUB_CARD_RADIUS = 8;
const SUB_CARD_BORDER = '#eee';

// 字段行
const LABEL_SIZE = 14;
const FIELD_VALUE_SIZE = 14;  // 新增：时长/开始日期/结束日期的填写值固定字号，不受滑块控制
const FIELD_ROW_GAP = 8;
const LABEL_VALUE_GAP = 10;
const GRADE_SIZE = 26;
const GRADE_GAP = 4;
const HEART_SIZE = 20;
const HEART_GAP = 4;

// 雷达图
const RADAR_BOX_W = 160;  // 180→160，移入主体行右侧
const RADAR_R = 55;
const RADAR_LEVELS = 5;
const RADAR_ANGLES = [-90, -18, 54, 126, 198];
const RADAR_LABEL_SIZE = 12;

// 文本字段区（优点/缺点/攻略顺序/好感顺序）
const TEXT_FIELD_GAP = 12;
const TEXT_BOX_PAD = 8;
const TEXT_BOX_MIN_H = 48;

// 角色卡片网格（略微缩小，正好一行5个）
const CHAR_CARD_SIZE = 112;  // 120→112
const CHAR_CARD_GAP = 12;    // 16→12
const CHAR_LABEL_SIZE = 14;  // 16→14，固定文字统一14px
const CHAR_LABEL_GAP = 6;    // 8→6

// 文本卡片网格（略微缩小，正好一行3个）
const TEXT_CARD_W = 200;      // 225→200
const TEXT_CARD_GAP = 12;     // 16→12
const TEXT_CARD_PAD = 12;     // 14→12
const TEXT_CARD_TITLE_MB = 8; // 10→8
const TEXT_CARD_TITLE_SIZE = 14; // 16→14，固定文字统一14px
const TEXT_CARD_BOX_MIN_H = 72; // 80→72
const CP_SIZE = 88;            // 100→88
const CP_GAP = 8;              // 10→8

// 感想
const IMPRESSION_MIN_H = 72;

// Impression 模块布局常量
const IMP_INFO_FADE_H = 50;       // 横板图底部淡出高度
const IMP_INFO_MB = 12;           // 横板图与下方内容间距
const IMP_CHAR_IMG_W = 70;        // 导出角色图宽度（参考网页815px下195px，按720px设计宽等比缩放）
const IMP_CHAR_IMG_H = 70;        // 导出角色图高度（正方形 1:1）
const IMP_CHAR_NAME_GAP = 6;      // 角色图与角色名间距（8→6，更紧凑）
const IMP_CHAR_NAME_H = 16;       // 角色名占用高度（20→16，配合11px字号）
const IMP_COL_LABEL_SIZE = 16;    // Before / After 列标签字号（对齐网页 16px）
const IMP_BLOCK_COLS = 2;         // 每行角色 block 数量
const IMP_BLOCK_GAP = 10;         // 角色 block 之间间距（与 IMP_CARD_PAD 一致：卡片框到大边框的间距）
const IMP_BLOCK_PAD = 8;          // 角色 block 内边距（12→8，压缩左右内边距，空间让给文本框）
const IMP_CARD_PAD = 10;          // Impression 卡片内容与外框的距离（独立于全局 CARD_PAD=16）
const IMP_COL_GAP = 8;            // 三列之间间距（与 IMP_BLOCK_PAD 一致：角色图到卡片框的间距）
const IMP_TEXTAREA_MIN_H = 72;    // Before/After 文本框最小高度

// 区块间距
const SECTION_GAP = 14;
const BODY_TO_TEXTFIELD_GAP = 8;  // 主体行（含五维图）与文本字段区（优点/缺点等）之间的额外间距
const RADAR_TO_CONTENT_GAP = 2;   // 有五维图时主体行底部到下方内容的紧凑间距（五维图到底部内容约20px，减半）
const GAME_NAME_MB = 12;
// 简评表
const BRIEF_GAMES_PER_PAGE = 3;  // 每张简评表至多放置3个游戏
const BRIEF_CARD_GAP = 16;       // 简评表中游戏卡片之间的间距

// 缓存
const roundImageCache = new Map();
const rawImageResourceCache = new Map();

// 工具函数
// 十六进制颜色转 rgba（用于淡出渐变的透明起始色，适配用户自定义背景色）
function hexToRgba(hex, alpha) {
  const h = (hex || '#fff7f9').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function emitRenderProgress(percent) {
  window.dispatchEvent(new CustomEvent('other-canvas-progress', {
    detail: { percent: Math.min(100, Math.max(0, Number(percent))) }
  }));
}

function isSafeUrl(url) {
  if (!url) return false;
  if (!/^https?:\/\//.test(url)) return false;
  if (/^https:\/\/pub-/.test(url)) return false;
  if (/raw\.githubusercontent\.com/.test(url)) return false;
  return true;
}

function toCanvasUrl(src) {
  if (!src) return '';
  let url;
  if (/^https?:\/\//.test(src)) {
    if (/^https:\/\/pub-/.test(src)) {
      const converted = convertR2ToJsDelivr(src);
      url = (converted && isSafeUrl(converted)) ? converted : '';
    } else {
      url = src;
    }
  } else {
    url = getWebImageUrl(src);
    if (url && /^https:\/\/pub-/.test(url)) {
      const converted = convertR2ToJsDelivr(src);
      if (converted && isSafeUrl(converted)) url = converted;
    }
  }
  return isSafeUrl(url) ? url : '';
}

function getImgSize(img) {
  if (!img) return { w: 0, h: 0 };
  return {
    w: img.naturalWidth ?? img.width ?? 0,
    h: img.naturalHeight ?? img.height ?? 0
  };
}

function calcGameCoverHeight(img, width) {
  const coverW = width || COVER_W;
  const { w, h } = getImgSize(img);
  if (w <= 0 || h <= 0) return Math.round(coverW * 1.4);
  return Math.round(coverW * h / w);
}

function getBodyPad() { return LAYOUT_SPACE.BODY_PADDING || 20; }
function getWrapW(targetW) { return Math.min(DESIGN_W, targetW - getBodyPad() * 2); }
function getWrapX(targetW, wrapW) { return Math.max(getBodyPad(), (targetW - wrapW) / 2); }
function getTitleMb() {
  return (LAYOUT_SPACE.SITE_TITLE_MT || 0) + (LAYOUT_SPACE.SITE_TITLE_MB || 20);
}

// 圆角离屏画布
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
  offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = "high";
  offCtx.webkitImageSmoothingEnabled = true;
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
    console.warn("other 离屏画布绘制异常", srcUrl, e);
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

// 图片加载
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
  const failList = [];
  for (const [u, val] of resultMap.entries()) {
    if (!val) failList.push(u);
  }
  if (failList.length > 0) {
    console.warn("⚠️ other 部分图片加载失败，继续渲染：", failList);
  }
  return { resultMap, failList };
}

// 绘制辅助函数
function drawCoverCard(painter, x, y, cardW, cardH, img, srcUrl, radius) {
  painter.drawRoundRect(x, y, cardW, cardH, SUB_CARD_RADIUS, '#ffffff', SUB_CARD_BORDER, 1);
  if (img) {
    const ctx = painter.ctx;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + cardW - radius, y);
      ctx.quadraticCurveTo(x + cardW, y, x + cardW, y + radius);
      ctx.lineTo(x + cardW, y + cardH - radius);
      ctx.quadraticCurveTo(x + cardW, y + cardH, x + cardW - radius, y + cardH);
      ctx.lineTo(x + radius, y + cardH);
      ctx.quadraticCurveTo(x, y + cardH, x, y + cardH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.clip();
      const resInfo = rawImageResourceCache.get(srcUrl);
      const drawTarget = resInfo?.type === 'image' ? resInfo.data : img;
      ctx.drawImage(drawTarget, x, y, cardW, cardH);
    } finally {
      ctx.restore();
    }
  }
}

function drawTextBox(painter, x, y, boxW, boxH, text, config, noBorder, centerText, textColor, textSize, verticalCenter) {
  painter.drawRoundRect(x, y, boxW, boxH, SUB_CARD_RADIUS, '#ffffff',
    noBorder ? null : (config.customborder || '#eee'), noBorder ? 0 : 1);
  if (text) {
    // textSize 未传时默认用自定义文本字号（文字卡片/感想）；
    // 优点/缺点/攻略顺序/好感顺序传入 inputSize（填写内容字号）
    const size = textSize || config.customTextFontSize || 16;
    const color = textColor || config.customtext || '#c98fac';
    const lineHeight = size * 1.55;
    const textAreaW = boxW - TEXT_BOX_PAD * 2;
    if (verticalCenter) {
      // 自行换行并用 top baseline 绘制，按实际视觉高度精确垂直居中
      const ctx = painter.ctx;
      ctx.save();
      ctx.font = `${size}px ${FONT_SIYUAN}`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'top';
      // 手动换行
      const chars = Array.from(text);
      let line = '';
      const lines = [];
      for (let n = 0; n < chars.length; n++) {
        const ch = chars[n];
        if (ch === '\n') { lines.push(line); line = ''; continue; }
        if (ch === '\r') { if (chars[n+1]==='\n') n++; lines.push(line); line=''; continue; }
        if (line && ctx.measureText(line + ch).width > textAreaW) {
          lines.push(line); line = ch;
        } else {
          line += ch;
        }
      }
      if (line) lines.push(line);
      // 实际视觉高度：最后一行用字号高度，行间用行高
      const visualH = lines.length > 1 ? (lines.length - 1) * lineHeight + size : size;
      const textY = y + Math.max(TEXT_BOX_PAD, (boxH - visualH) / 2);
      lines.forEach((l, i) => {
        ctx.fillText(l, x + TEXT_BOX_PAD, textY + i * lineHeight);
      });
      ctx.restore();
    } else if (centerText) {
      drawCenteredText(painter.ctx, text, x + boxW / 2, y + TEXT_BOX_PAD,
        textAreaW, lineHeight, size, color, false);
    } else {
      // 重置为左对齐，防止外部 ctx.textAlign='center' 残留导致文本以 padding 点为中心绘制、偏出文本框
      const prevAlign = painter.ctx.textAlign;
      painter.ctx.textAlign = 'left';
      wrapText(
        painter.ctx, text,
        x + TEXT_BOX_PAD, y + TEXT_BOX_PAD,
        textAreaW, lineHeight, size, color
      );
      painter.ctx.textAlign = prevAlign;
    }
  }
}

function drawCenteredText(ctx, text, centerX, y, maxWidth, lineHeight, fontSize, color, bold) {
  if (!text) return 0;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_SIYUAN}`;
  ctx.fillStyle = color;
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  const lines = [];
  for (let n = 0; n < chars.length; n++) {
    const ch = chars[n];
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (ch === '\r') { if (chars[n+1]==='\n') n++; lines.push(line); line=''; continue; }
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line); line = ch;
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
  const gap = Math.min(lineHeight - fontSize, 12);
  const safeLineHeight = fontSize + gap;
  const chars = Array.from(text);
  let line = '';
  let lines = 1;
  for (let n = 0; n < chars.length; n++) {
    const ch = chars[n];
    if (ch === '\n') { lines++; line = ''; continue; }
    if (ch === '\r') { if (chars[n+1]==='\n') n++; lines++; line=''; continue; }
    if (line && ctx.measureText(line + ch).width > maxWidth) { lines++; line = ch; }
    else line += ch;
  }
  return lines * safeLineHeight;
}

// SABCDE 评级方块组
function drawGradeGroup(ctx, x, y, value, config) {
  const grades = ['S','A','B','C','D','E'];
  grades.forEach((g, i) => {
    const bx = x + i * (GRADE_SIZE + GRADE_GAP);
    const isActive = value === g;
    ctx.beginPath();
    ctx.roundRect(bx, y, GRADE_SIZE, GRADE_SIZE, 6);
    if (isActive) {
      ctx.fillStyle = config.activeFillColor || '#e895a8';
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.font = `${14}px ${FONT_SIYUAN}`;
    ctx.fillStyle = isActive ? '#ffffff' : '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g, bx + GRADE_SIZE / 2, y + GRADE_SIZE / 2);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// 是/否按钮
function drawYnGroup(ctx, x, y, completed, config) {
  ['是','否'].forEach((txt, i) => {
    const bx = x + i * (GRADE_SIZE + GRADE_GAP);
    const isActive = (txt === '是' && completed === true) || (txt === '否' && completed === false);
    ctx.beginPath();
    ctx.roundRect(bx, y, GRADE_SIZE, GRADE_SIZE, 6);
    if (isActive) {
      ctx.fillStyle = config.activeFillColor || '#e895a8';
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.font = `${14}px ${FONT_SIYUAN}`;
    ctx.fillStyle = isActive ? '#ffffff' : '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, bx + GRADE_SIZE / 2, y + GRADE_SIZE / 2);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// 五维雷达图
function drawRadarChart(ctx, cx, cy, dims, config) {
  const radarColor = config.radarColor || '#e895a8';
  const labelColor = config.defaultTextColor || '#b85878';
  function pt(angleDeg, radius) {
    const rad = angleDeg * Math.PI / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }
  // 网格
  for (let l = 1; l <= RADAR_LEVELS; l++) {
    const r = RADAR_R * l / RADAR_LEVELS;
    ctx.beginPath();
    RADAR_ANGLES.forEach((a, i) => {
      const [px, py] = pt(a, r);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 轴线
  RADAR_ANGLES.forEach(a => {
    const [ex, ey] = pt(a, RADAR_R);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // 数据多边形
  const dataPts = dims.map((d, i) => pt(RADAR_ANGLES[i], RADAR_R * (d.level || 0) / RADAR_LEVELS));
  ctx.beginPath();
  dataPts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  });
  ctx.closePath();
  ctx.fillStyle = radarColor;
  ctx.globalAlpha = 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = radarColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  // 维度名标签
  dims.forEach((d, i) => {
    const [lx, ly] = pt(RADAR_ANGLES[i], RADAR_R + 22);
    ctx.font = `bold ${RADAR_LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.name || '', lx, ly);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// 图片收集
function collectRepoGameImages(gameData, gameInfo) {
  const urls = [];
  const push = (src) => { const u = toCanvasUrl(src); if (u) urls.push(u); };
  if (gameInfo?.cover) push(gameInfo.cover);
  (gameData.repoCharCards || []).forEach(c => { if (c.charId && c.coverSrc) push(c.coverSrc); });
  (gameData.repoCustomCharCards || []).forEach(c => { if (c.charId && c.coverSrc) push(c.coverSrc); });
  (gameData.repoTextCards || []).forEach(c => {
    if (c.type === 'cp') {
      if (c.femaleCoverSrc) push(c.femaleCoverSrc);
      if (c.maleCoverSrc) push(c.maleCoverSrc);
    }
  });
  (gameData.repoCustomTextCards || []).forEach(c => {
    if (c.type === 'cp') {
      if (c.femaleCoverSrc) push(c.femaleCoverSrc);
      if (c.maleCoverSrc) push(c.maleCoverSrc);
    }
  });
  return [...new Set(urls)];
}

// 简评表图片收集（仅需游戏封面，不需要角色/CP图片）
function collectBriefPageImages(gameDataList, gameInfoList) {
  const urls = [];
  const push = (src) => { const u = toCanvasUrl(src); if (u) urls.push(u); };
  gameDataList.forEach((gameData, i) => {
    const gameInfo = gameInfoList[i];
    if (gameInfo?.cover) push(gameInfo.cover);
  });
  return [...new Set(urls)];
}

// Impression：根据 4 开关过滤可见角色（与 other.js 中逻辑一致）
function canvasGetImpVisibleChars(gameInfo, switches, globalSwitches, allGames) {
  // 使用合并角色列表（FD 游戏关联本篇 charList）
  const rawList = canvasGetGameMergedCharList(gameInfo, allGames);
  const sw = switches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  const gs = globalSwitches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  // 与网页一致：全局开关 OR 局部开关
  const showSub = gs.subChar || sw.subChar;
  const showHide = gs.hideChar || sw.hideChar;
  const showFD = gs.fdChar || sw.fdChar;
  const showFdSub = gs.fdSubChar || sw.fdSubChar;
  return rawList.filter(c => {
    const isSub = c.isSub ?? false;
    const isHidden = !!c.isHidden;
    const isFD = !!c.isFD;
    const isFdSub = !!c.isFdSub;
    if (!isSub && !isHidden && !isFD && !isFdSub) return true;
    return (isSub && showSub) || (isHidden && showHide) ||
           (isFD && showFD) || (isFdSub && showFdSub);
  });
}
// Impression：获取角色在当前开关下的可用立绘列表
function canvasGetImpCharImages(char, switches, globalSwitches) {
  if (!char) return [];
  const sw = switches || { hideChar: false, fdChar: false };
  const gs = globalSwitches || { hideChar: false, fdChar: false };
  // 与网页 getImpressionCharAvailImages 一致：全局开关 + 局部开关分别传入
  const availUnits = getAvailableCharImages(
    char,
    gs.hideChar || false,   // 全局隐藏开关
    gs.fdChar || false,     // 全局FD开关
    sw.hideChar || false,   // 局部隐藏开关
    sw.fdChar || false      // 局部FD开关
  );
  const allSrc = [];
  availUnits.forEach(u => { if (Array.isArray(u.srcList)) allSrc.push(...u.srcList); });
  return allSrc;
}
// Impression：获取游戏的合并角色列表（FD 游戏通过 baseGameId 关联本篇角色）
// 与 other.js 中 getGameMergedCharList 逻辑一致，确保导出与网页显示相同
function canvasGetGameMergedCharList(gameInfo, allGames) {
  if (!gameInfo) return [];
  const games = Array.isArray(allGames) ? allGames : [];
  const fdList = games.filter(g => g && g.baseGameId);
  let baseGameInfo = gameInfo;
  // 确定 baseGameId：优先用字段；字段缺失时从 id 推断（fd001 → game001）
  let baseGameId = gameInfo.baseGameId;
  if (!baseGameId && gameInfo.id && /^fd\d+$/i.test(gameInfo.id)) {
    baseGameId = 'game' + gameInfo.id.replace(/^fd/i, '');
  }
  if (baseGameId) {
    const found = games.find(g => g.id === baseGameId);
    if (found) baseGameInfo = found;
  }
  const baseChars = Array.isArray(baseGameInfo.charList) ? baseGameInfo.charList : [];
  // relatedFdGames 过滤兼容推断出的 baseGameId（FD 对象 baseGameId 字段也可能丢失）
  const relatedFdGames = fdList.filter(fd =>
    fd.baseGameId === baseGameInfo.id ||
    (fd.id && /^fd\d+$/i.test(fd.id) && 'game' + fd.id.replace(/^fd/i, '') === baseGameInfo.id)
  );
  if (relatedFdGames.length === 0) return baseChars;
  const fdChars = [];
  relatedFdGames.forEach(fd => {
    if (Array.isArray(fd.charList)) {
      fd.charList.forEach(char => {
        fdChars.push({ ...char, _fdSourceId: fd.id, _fdSourceName: fd.name });
      });
    }
  });
  return [...baseChars, ...fdChars];
}
// Impression：获取横板图列表（优先 gameInfo.infoImages，其次读取 window 配置数量）
function canvasGetImpInfoImages(gameInfo, gameId) {
  if (gameInfo && Array.isArray(gameInfo.infoImages) && gameInfo.infoImages.length > 0) {
    return gameInfo.infoImages;
  }
  // 路径规则：game001 → info/001.jpg（去掉 game 前缀）；fd001 → info/fd001.jpg（保持不变）
  const pathId = (gameId && gameId.indexOf('game') === 0) ? gameId.substring(4) : gameId;
  const countMap = window.IMPRESSION_INFO_IMAGE_COUNT || {};
  const count = countMap[gameId] || 1;
  const list = [`info/${pathId}.jpg`];
  for (let i = 2; i <= count; i++) list.push(`info/${pathId}-${i}.jpg`);
  return list;
}
// Impression：收集导出所需全部图片（横板图 + 各可见角色当前立绘）
function collectImpressionGameImages(gameData, gameInfo, globalSwitches, allGames) {
  const urls = [];
  const push = (src) => { const u = toCanvasUrl(src); if (u) urls.push(u); };
  const switches = gameData.charSwitches || {};
  // 横板图：用户当前切换的那张
  const infoImages = canvasGetImpInfoImages(gameInfo, gameData.gameId);
  const infoIdx = Math.min(gameData.infoImgIndex || 0, Math.max(0, infoImages.length - 1));
  if (infoImages[infoIdx]) push(infoImages[infoIdx]);
  // 各可见角色当前立绘（传入全局开关 + 完整游戏列表，支持 FD 合并）
  const visibleChars = canvasGetImpVisibleChars(gameInfo, switches, globalSwitches, allGames);
  visibleChars.forEach(char => {
    const avail = canvasGetImpCharImages(char, switches, globalSwitches);
    const charIdx = window.getOtherImpressionCharImgIndex ?
      window.getOtherImpressionCharImgIndex(gameData.gameId, char.id) : 0;
    const safeIdx = Math.min(charIdx, Math.max(0, avail.length - 1));
    if (avail[safeIdx]) push(avail[safeIdx]);
  });
  return [...new Set(urls)];
}

// 高度计算
function calcRepoGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  const inputSize = config.inputFontSize || 16;
  const customTextSize = config.customTextFontSize || 16;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  const nameH = measureWrappedHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, true);
  contentH += nameH + GAME_NAME_MB;

  // 主体行
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverH = calcGameCoverHeight(coverImg, COVER_W);

  const fieldX0 = 0; // 逻辑偏移，实际绘制时加 contentX
  const fieldW = innerW - COVER_W - 12;
  const hasRadar = (gameData.fiveDim || []).some(d => (d.level || 0) > 0);
  const radarGap = 16;
  // 有雷达图时字段区左侧留出空间给雷达图；无雷达图时字段占满
  const leftColW = hasRadar ? (fieldW - RADAR_BOX_W - radarGap) : fieldW;

  // 字段行定义
  // 行1: 时长+全通，行2: 开始日期+结束日期，行3: 甜度，行4: 虐度，行5: 总评，行6: 喜爱度
  const hasDuration = !!(gameData.duration && String(gameData.duration).trim());
  const hasCompleted = gameData.completed === true || gameData.completed === false;
  const hasStartDate = !!(gameData.startDate && String(gameData.startDate).trim());
  const hasEndDate = !!(gameData.endDate && String(gameData.endDate).trim());
  const hasSweetness = !!gameData.sweetness;
  const hasBitterness = !!gameData.bitterness;
  const hasOverall = !!gameData.overall;
  const hasLove = gameData.love && gameData.love > 0;

  const fieldRowH = Math.max(LABEL_SIZE * 1.4, GRADE_SIZE, HEART_SIZE, FIELD_VALUE_SIZE * 1.4, inputSize * 1.4);
  const fieldRows = [];
  if (hasDuration || hasCompleted) fieldRows.push(1);
  if (hasStartDate || hasEndDate) fieldRows.push(2);
  if (hasSweetness) fieldRows.push(3);
  if (hasBitterness) fieldRows.push(4);
  if (hasOverall) fieldRows.push(5);
  if (hasLove) fieldRows.push(6);

  const fieldAreaH = fieldRows.length > 0
    ? fieldRows.length * fieldRowH + (fieldRows.length - 1) * FIELD_ROW_GAP
    : 0;

  // 雷达图
  const rowsBeforeSweetness = ((hasDuration || hasCompleted) ? 1 : 0) + ((hasStartDate || hasEndDate) ? 1 : 0);
  // 修正：每行实际占用 fieldRowH + FIELD_ROW_GAP（含行尾间距），雷达从最后一行的行尾间距之后开始
  const radarTopOffset = rowsBeforeSweetness * (fieldRowH + FIELD_ROW_GAP);
  const radarBottomOffset = hasRadar ? (radarTopOffset + RADAR_BOX_W) : 0;

  const bodyContentH = Math.max(fieldAreaH, radarBottomOffset);
  const bodyRowH = Math.max(coverH, bodyContentH);
  // 有五维图时用紧凑间距：五维图底部(~18px盒子内空白) + 2px = ~20px，为原40px的一半
  // 无五维图时保持原间距 SECTION_GAP + BODY_TO_TEXTFIELD_GAP = 22px
  const bodyAfterGap = hasRadar ? RADAR_TO_CONTENT_GAP : (SECTION_GAP + BODY_TO_TEXTFIELD_GAP);
  contentH += bodyRowH + bodyAfterGap;
  // 预计算后续区块是否存在，用于判断当前区块后是否需要 SECTION_GAP
  const _allCharCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  const hasValidCharCards = _allCharCards.some(c => c.charId);
  const _allTextCards = [...(gameData.repoTextCards || []), ...(gameData.repoCustomTextCards || [])];
  const hasValidTextCards = _allTextCards.some(c => {
    if (c.type === 'cp') return !!(c.femaleId && c.maleId);
    return !!(c.text && c.text.trim());
  });
  const hasImpression = !!(gameData.impression && String(gameData.impression).trim());
  // 文本字段区
  const tfLabelH = LABEL_SIZE * 1.4 + 4;
  const hasPros = !!(gameData.pros && String(gameData.pros).trim());
  const hasCons = !!(gameData.cons && String(gameData.cons).trim());
  const hasStrategy = !!(gameData.strategyOrder && String(gameData.strategyOrder).trim());
  const hasFavor = !!(gameData.favorOrder && String(gameData.favorOrder).trim());
  // 测量文本字段内容前，显式设置正确字号字体，避免受上方字段标签绘制的字体残留影响
  ctx.font = `${inputSize}px ${FONT_SIYUAN}`;
  if (hasPros || hasCons) {
    const tfColW = (innerW - TEXT_FIELD_GAP) / 2;
    let rowMaxH = 0;
    if (hasPros) {
      const textH = measureWrappedHeight(ctx, gameData.pros, tfColW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
      rowMaxH = Math.max(rowMaxH, tfLabelH + Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2));
    }
    if (hasCons) {
      const textH = measureWrappedHeight(ctx, gameData.cons, tfColW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
      rowMaxH = Math.max(rowMaxH, tfLabelH + Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2));
    }
    contentH += rowMaxH + TEXT_FIELD_GAP;
  }
  if (hasStrategy) {
    const textH = measureWrappedHeight(ctx, gameData.strategyOrder, innerW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    contentH += tfLabelH + Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2) + TEXT_FIELD_GAP;
  }
  if (hasFavor) {
    const textH = measureWrappedHeight(ctx, gameData.favorOrder, innerW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    contentH += tfLabelH + Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2) + TEXT_FIELD_GAP;
  }
  if (hasPros || hasCons || hasStrategy || hasFavor) {
    if (hasValidCharCards || hasValidTextCards || hasImpression) {
      contentH += SECTION_GAP;
    }
  }

  // 角色卡片网格
  const allCharCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  const validCharCards = allCharCards.filter(c => c.charId);
  if (validCharCards.length > 0) {
    const charCols = Math.max(1, Math.floor((innerW + CHAR_CARD_GAP) / (CHAR_CARD_SIZE + CHAR_CARD_GAP)));
    const charRows = Math.ceil(validCharCards.length / charCols);
    const labelLineH = CHAR_LABEL_SIZE * 1.4;
    let gridH = 0;
    for (let r = 0; r < charRows; r++) {
      let rowMaxCoverH = CHAR_CARD_SIZE;
      let rowMaxLabelH = 0;
      for (let c = 0; c < charCols; c++) {
        const idx = r * charCols + c;
        if (idx >= validCharCards.length) break;
        const labH = measureCenteredTextHeight(ctx, validCharCards[idx].label || '', CHAR_CARD_SIZE, labelLineH, CHAR_LABEL_SIZE);
        rowMaxLabelH = Math.max(rowMaxLabelH, Math.max(labH, labelLineH));
      }
      gridH += rowMaxCoverH + CHAR_LABEL_GAP + rowMaxLabelH;
      if (r < charRows - 1) gridH += CHAR_CARD_GAP;
    }
    contentH += gridH;
    if (hasValidTextCards || hasImpression) {
      contentH += SECTION_GAP;
    }
  }

  // 文字卡片网格
  const allTextCards = [...(gameData.repoTextCards || []), ...(gameData.repoCustomTextCards || [])];
  const validTextCards = allTextCards.filter(c => {
    if (c.type === 'cp') return !!(c.femaleId && c.maleId);
    return !!(c.text && c.text.trim());
  });
  if (validTextCards.length > 0) {
    const tcCols = Math.max(1, Math.floor((innerW + TEXT_CARD_GAP) / (TEXT_CARD_W + TEXT_CARD_GAP)));
    const tcRows = Math.ceil(validTextCards.length / tcCols);
    const titleLineH = TEXT_CARD_TITLE_SIZE * 1.4;
    const rowHeights = [];
    for (let r = 0; r < tcRows; r++) {
      let rowMax = 0;
      for (let c = 0; c < tcCols; c++) {
        const idx = r * tcCols + c;
        if (idx >= validTextCards.length) continue;
        const card = validTextCards[idx];
        const titleMaxW = TEXT_CARD_W - TEXT_CARD_PAD * 2;
        const titleActualH = measureCenteredTextHeight(ctx, card.label || '', titleMaxW, titleLineH, TEXT_CARD_TITLE_SIZE);
        let ch = TEXT_CARD_PAD * 2 + titleActualH + TEXT_CARD_TITLE_MB;
        if (card.type === 'cp') {
          ch += CP_SIZE;
        } else {
          const textAreaW = TEXT_CARD_W - TEXT_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, customTextSize * 1.55, customTextSize);
          ch += Math.max(TEXT_CARD_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
        }
        rowMax = Math.max(rowMax, ch);
      }
      rowHeights.push(rowMax);
    }
    let tcGridH = 0;
    for (let r = 0; r < tcRows; r++) {
      tcGridH += rowHeights[r];
      if (r < tcRows - 1) tcGridH += TEXT_CARD_GAP;
    }
    contentH += tcGridH;
    if (hasImpression) {
      contentH += SECTION_GAP;
    }
  }

  // 感想
  if (gameData.impression && String(gameData.impression).trim()) {
    const impLabelH = LABEL_SIZE * 1.4 + 6;
    const impTextH = measureWrappedHeight(ctx, gameData.impression, innerW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize);
    contentH += impLabelH + Math.max(IMPRESSION_MIN_H, impTextH + TEXT_BOX_PAD * 2);
  }
  h += CARD_PAD * 2 + contentH;
  return h;
}

function calcImpressionGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache, globalSwitches, allGames) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - IMP_CARD_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  const customTextSize = config.customTextFontSize || 16;
  const switches = gameData.charSwitches || {};
  const gs = globalSwitches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  // 横板图高度（宽度铺满 innerW，高度按原比例自动变化，无最大高度限制，不裁剪）
  const infoImages = canvasGetImpInfoImages(gameInfo, gameData.gameId);
  const infoIdx = Math.min(gameData.infoImgIndex || 0, Math.max(0, infoImages.length - 1));
  const infoSrc = infoImages[infoIdx] ? toCanvasUrl(infoImages[infoIdx]) : '';
  const infoImg = infoSrc ? imageCache.get(infoSrc) : null;
  let infoH = 0;
  if (infoImg) {
    const { w, h: ih } = getImgSize(infoImg);
    if (w > 0 && ih > 0) {
      infoH = Math.round(innerW * ih / w);
    }
  }
  if (infoH > 0) contentH += infoH + IMP_INFO_MB;
  // 三列内容：可见角色列表（导出时不绘制 4 开关，不绘制游戏名）
  let visibleChars = canvasGetImpVisibleChars(gameInfo, switches, globalSwitches, allGames);
  // 过滤掉 Before / After 均未填写任何内容的角色
  visibleChars = visibleChars.filter(char => {
    const ct = gameData.charTexts?.[char.id];
    return !!(ct && ((ct.before && String(ct.before).trim()) || (ct.after && String(ct.after).trim())));
  });
  if (visibleChars.length > 0) {
    const blockW = (innerW - IMP_BLOCK_GAP) / IMP_BLOCK_COLS;
    const blockInnerW = blockW - IMP_BLOCK_PAD * 2;
    const charColW = IMP_CHAR_IMG_W;
    const textColW = (blockInnerW - charColW - IMP_COL_GAP * 2) / 2;
    const blockRows = Math.ceil(visibleChars.length / IMP_BLOCK_COLS);
    ctx.font = `${customTextSize}px ${FONT_SIYUAN}`;
    let blocksTotalH = 0;
    for (let r = 0; r < blockRows; r++) {
      let rowMaxH = 0;
      for (let c = 0; c < IMP_BLOCK_COLS; c++) {
        const idx = r * IMP_BLOCK_COLS + c;
        if (idx >= visibleChars.length) break;
        const char = visibleChars[idx];
        const ct = gameData.charTexts?.[char.id] || { before: '', after: '' };
        // 动态计算该角色在当前开关下的显示名称及换行后的实际高度
        const charShowHide = getCharShowHide(char, gs.hideChar || switches.hideChar, false, gs.fdChar || switches.fdChar, false);
        const charNameList = getCharNameList(char, charShowHide);
        const nameIdx = window.getOtherImpressionCharNameIndex ?
          window.getOtherImpressionCharNameIndex(gameData.gameId, char.id) : 0;
        const safeNameIdx = Math.min(nameIdx, Math.max(0, charNameList.length - 1));
        const dispName = charNameList[safeNameIdx] || char.name || '';
        // Before / After 标签与文本框紧凑间距（标签16px + 4px间隔 = 20px，原26.4px）
        const labelH = IMP_COL_LABEL_SIZE + 4;
        ctx.font = `11px ${FONT_SIYUAN}`;
        const charNameLineH = 11 * 1.4;
        const charNameActualH = measureWrappedHeight(ctx, dispName, charColW, charNameLineH, 11);
        // 角色图顶部与文本框上边框对齐：上方预留 labelH 放标签，角色图 + 间距 + 角色名
        const charColTotal = labelH + IMP_CHAR_IMG_H + IMP_CHAR_NAME_GAP + Math.max(IMP_CHAR_NAME_H, charNameActualH);
        const beforeH = ct.before ?
          measureWrappedHeight(ctx, ct.before, textColW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize) : 0;
        const afterH = ct.after ?
          measureWrappedHeight(ctx, ct.after, textColW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize) : 0;
        const beforeTotal = labelH + Math.max(IMP_TEXTAREA_MIN_H, beforeH + TEXT_BOX_PAD * 2);
        const afterTotal = labelH + Math.max(IMP_TEXTAREA_MIN_H, afterH + TEXT_BOX_PAD * 2);
        const blockContentH = Math.max(charColTotal, beforeTotal, afterTotal);
        rowMaxH = Math.max(rowMaxH, IMP_BLOCK_PAD * 2 + blockContentH);
      }
      blocksTotalH += rowMaxH;
      if (r < blockRows - 1) blocksTotalH += IMP_BLOCK_GAP;
    }
    contentH += blocksTotalH;
  }
  h += IMP_CARD_PAD * 2 + contentH;
  return h;
}

// 简评表单游戏高度计算（仅游戏名+主体行，不含文本字段区/角色卡片/文字卡片/感想）
// 返回 0 表示该游戏无任何简评内容，应跳过
function calcBriefGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_PAD * 2;
  const inputSize = config.inputFontSize || 16;
  // 内容存在性判断
  const hasDuration = !!(gameData.duration && String(gameData.duration).trim());
  const hasCompleted = gameData.completed === true || gameData.completed === false;
  const hasStartDate = !!(gameData.startDate && String(gameData.startDate).trim());
  const hasEndDate = !!(gameData.endDate && String(gameData.endDate).trim());
  const hasSweetness = !!gameData.sweetness;
  const hasBitterness = !!gameData.bitterness;
  const hasOverall = !!gameData.overall;
  const hasLove = gameData.love && gameData.love > 0;
  const hasRadar = (gameData.fiveDim || []).some(d => (d.level || 0) > 0);
  if (!hasDuration && !hasCompleted && !hasStartDate && !hasEndDate &&
      !hasSweetness && !hasBitterness && !hasOverall && !hasLove && !hasRadar) {
    return 0;
  }
  let contentH = 0;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  const nameH = measureWrappedHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, true);
  contentH += nameH + GAME_NAME_MB;
  // 主体行（与 calcRepoGameHeight 完全一致的逻辑）
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverH = calcGameCoverHeight(coverImg, COVER_W);
  const fieldW = innerW - COVER_W - 12;
  const radarGap = 16;
  const fieldRowH = Math.max(LABEL_SIZE * 1.4, GRADE_SIZE, HEART_SIZE, FIELD_VALUE_SIZE * 1.4, inputSize * 1.4);
  const fieldRows = [];
  if (hasDuration || hasCompleted) fieldRows.push(1);
  if (hasStartDate || hasEndDate) fieldRows.push(2);
  if (hasSweetness) fieldRows.push(3);
  if (hasBitterness) fieldRows.push(4);
  if (hasOverall) fieldRows.push(5);
  if (hasLove) fieldRows.push(6);
  const fieldAreaH = fieldRows.length > 0
    ? fieldRows.length * fieldRowH + (fieldRows.length - 1) * FIELD_ROW_GAP
    : 0;
  const rowsBeforeSweetness = ((hasDuration || hasCompleted) ? 1 : 0) + ((hasStartDate || hasEndDate) ? 1 : 0);
  // 修正：每行实际占用 fieldRowH + FIELD_ROW_GAP（含行尾间距），雷达从最后一行的行尾间距之后开始
  const radarTopOffset = rowsBeforeSweetness * (fieldRowH + FIELD_ROW_GAP);
  const radarBottomOffset = hasRadar ? (radarTopOffset + RADAR_BOX_W) : 0;
  const bodyContentH = Math.max(fieldAreaH, radarBottomOffset);
  const bodyRowH = Math.max(coverH, bodyContentH);
  contentH += bodyRowH;
  return CARD_PAD * 2 + contentH;
}

// 绘制函数
function drawBigTitle(painter, targetW, titleText, config) {
  const titleAreaH = getBodyPad() + TITLE_SIZE + getTitleMb();
  const titleY = (titleAreaH - TITLE_SIZE) / 2;
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

function drawRepoGameCard(painter, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_PAD * 2;
  const contentX = wrapX + CARD_PAD;
  const ctx = painter.ctx;
  const cardTop = painter.y;
  const totalH = calcRepoGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache);
  const cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_PAD * 2;
  const cardH = CARD_PAD * 2 + cardContentH;
  const inputSize = config.inputFontSize || 16;
  const customTextSize = config.customTextFontSize || 16;
  const labelColor = config.defaultTextColor || '#b85878';
  const valueColor = config.inputTextColor || '#000000';
  // 卡片外框
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.imageBorderColor || '#f6a5b8', CARD_BORDER_W);
  painter.y = cardTop + CARD_PAD;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  wrapText(ctx, gameName, contentX, painter.y, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE,
    config.charNameColor || '#000000', FONT_SIYUAN, true);
  const nameH = measureWrappedHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, true);
  painter.shiftY(nameH + GAME_NAME_MB);
  // 主体行
  const bodyTop = painter.y;
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverH = calcGameCoverHeight(coverImg, COVER_W);
  drawCoverCard(painter, contentX, bodyTop, COVER_W, coverH, coverImg, coverSrc, 6);
  // 字段区
  const fieldX = contentX + COVER_W + 12;
  const fieldW = innerW - COVER_W - 12;
  const hasRadar = (gameData.fiveDim || []).some(d => (d.level || 0) > 0);
  const radarGap = 16;
  const leftColW = hasRadar ? (fieldW - RADAR_BOX_W - radarGap) : fieldW;
  const fieldRowH = Math.max(LABEL_SIZE * 1.4, GRADE_SIZE, HEART_SIZE, FIELD_VALUE_SIZE * 1.4, inputSize * 1.4);
  const labelCenterOffset = (fieldRowH - LABEL_SIZE) / 2;
  const gradeCenterOffset = (fieldRowH - GRADE_SIZE) / 2;
  const heartCenterOffset = (fieldRowH - HEART_SIZE) / 2;
  let fy = bodyTop;
  function drawFieldLabel(text, x, y) {
    ctx.font = `bold ${LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.fillText(text, x, y + labelCenterOffset);
    return ctx.measureText(text).width;
  }
  // 字段值：size 未传时用 inputSize（受滑块控制）；传 FIELD_VALUE_SIZE 时固定不受滑块控制
  function drawFieldValue(text, x, y, size) {
    const s = size || inputSize;
    const offset = (fieldRowH - s) / 2;
    ctx.font = `${s}px ${FONT_SIYUAN}`;
    ctx.fillStyle = valueColor;
    ctx.fillText(text, x, y + offset);
  }
  // 行1：时长 + 全通
  const hasDuration = !!(gameData.duration && String(gameData.duration).trim());
  const hasCompleted = gameData.completed === true || gameData.completed === false;
  if (hasDuration || hasCompleted) {
    if (hasDuration) {
      const lw = drawFieldLabel('时长', fieldX, fy);
      drawFieldValue(String(gameData.duration).trim(), fieldX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    if (hasCompleted) {
      const halfW = fieldW / 2;
      const ynX = fieldX + halfW;
      const lw = drawFieldLabel('全通', ynX, fy);
      drawYnGroup(ctx, ynX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.completed, config);
    }
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行2：开始日期 + 结束日期
  const hasStartDate = !!(gameData.startDate && String(gameData.startDate).trim());
  const hasEndDate = !!(gameData.endDate && String(gameData.endDate).trim());
  if (hasStartDate || hasEndDate) {
    const halfW = fieldW / 2;
    if (hasStartDate) {
      const lw = drawFieldLabel('开始日期', fieldX, fy);
      drawFieldValue(String(gameData.startDate).trim(), fieldX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    if (hasEndDate) {
      const endX = fieldX + halfW;
      const lw = drawFieldLabel('结束日期', endX, fy);
      drawFieldValue(String(gameData.endDate).trim(), endX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 雷达图：整体左移，使最左端维度标签的第一个字与上方"全通"/"结束日期"对齐
  if (hasRadar) {
    const dims = gameData.fiveDim || [];
    // 找到最左端的维度（角度 cos 值最小，即最偏左）
    let leftmostIdx = 0;
    let minCos = Math.cos(RADAR_ANGLES[0] * Math.PI / 180);
    for (let i = 1; i < RADAR_ANGLES.length && i < dims.length; i++) {
      const c = Math.cos(RADAR_ANGLES[i] * Math.PI / 180);
      if (c < minCos) { minCos = c; leftmostIdx = i; }
    }
    // 测量最左端维度标签的宽度（与 drawRadarChart 内部字体一致：bold 12px）
    ctx.save();
    ctx.font = `bold ${RADAR_LABEL_SIZE}px ${FONT_SIYUAN}`;
    const leftLabelW = ctx.measureText(dims[leftmostIdx]?.name || '').width;
    ctx.restore();
    // 目标左边缘：与右半列字段标签（全通/结束日期）起始位置对齐
    const targetLeftX = fieldX + fieldW / 2;
    // 标签中心 x = radarCx + (RADAR_R + 22) * cos(angle)
    // 标签左边缘 = 标签中心 x - 标签宽度 / 2
    // 令标签左边缘 = targetLeftX，解出 radarCx
    let radarCx = targetLeftX - (RADAR_R + 22) * minCos + leftLabelW / 2;
    // 上限保护：雷达图最右端（含标签）不超出卡片大边框
    const cardRightEdge = fieldX + fieldW;
    const maxCx = cardRightEdge - (RADAR_R + 22) - 20;
    if (radarCx > maxCx) radarCx = maxCx;
    const radarCy = fy + RADAR_BOX_W / 2;
    drawRadarChart(ctx, radarCx, radarCy, dims, config);
  }
  // 行3：甜度
  if (gameData.sweetness) {
    const lw = drawFieldLabel('甜度', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.sweetness, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行4：虐度
  if (gameData.bitterness) {
    const lw = drawFieldLabel('虐度', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.bitterness, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行5：总评
  if (gameData.overall) {
    const lw = drawFieldLabel('总评', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.overall, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行6：喜爱度
  if (gameData.love && gameData.love > 0) {
    const lw = drawFieldLabel('喜爱度', fieldX, fy);
    painter.drawHeartRate(fieldX + lw + LABEL_VALUE_GAP, fy + heartCenterOffset,
      gameData.love, HEART_SIZE, HEART_GAP, config.heartColor || '#e895a8', '#cccccc');
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // fieldAreaH 修正：fy 包含最后一行后多余的 FIELD_ROW_GAP，需减去以与 calc 保持一致
  const fieldAreaH = fy > bodyTop ? (fy - bodyTop - FIELD_ROW_GAP) : 0;
  const rowsBeforeRadar = ((hasDuration || hasCompleted) ? 1 : 0) + ((hasStartDate || hasEndDate) ? 1 : 0);
  const radarBottomOffset = hasRadar ? (rowsBeforeRadar * (fieldRowH + FIELD_ROW_GAP) + RADAR_BOX_W) : 0;
  const bodyRowH = Math.max(coverH, fieldAreaH, radarBottomOffset);
  // 有五维图时用紧凑间距：五维图底部(~18px盒子内空白) + 2px = ~20px，为原40px的一半
  // 无五维图时保持原间距 SECTION_GAP + BODY_TO_TEXTFIELD_GAP = 22px
  const bodyAfterGap = hasRadar ? RADAR_TO_CONTENT_GAP : (SECTION_GAP + BODY_TO_TEXTFIELD_GAP);
  painter.shiftY(bodyRowH + bodyAfterGap);
  // 预计算后续区块是否存在，用于判断当前区块后是否需要 SECTION_GAP
  const _allCharCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  const hasValidCharCards = _allCharCards.some(c => c.charId);
  const _allTextCards = [...(gameData.repoTextCards || []), ...(gameData.repoCustomTextCards || [])];
  const hasValidTextCards = _allTextCards.some(c => {
    if (c.type === 'cp') return !!(c.femaleId && c.maleId);
    return !!(c.text && c.text.trim());
  });
  const hasImpression = !!(gameData.impression && String(gameData.impression).trim());
  // 文本字段区
  const tfLabelH = LABEL_SIZE * 1.4 + 4;
  const hasPros = !!(gameData.pros && String(gameData.pros).trim());
  const hasCons = !!(gameData.cons && String(gameData.cons).trim());
  const hasStrategy = !!(gameData.strategyOrder && String(gameData.strategyOrder).trim());
  const hasFavor = !!(gameData.favorOrder && String(gameData.favorOrder).trim());
  function drawTextField(label, text, x, w) {
    ctx.font = `bold ${LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.fillText(label, x, painter.y);
    const boxY = painter.y + tfLabelH;
    // 测量文本高度前切换到填写内容字号，避免用 bold 14px 标签字体测算导致 boxH 偏差
    ctx.font = `${inputSize}px ${FONT_SIYUAN}`;
    const textH = measureWrappedHeight(ctx, text, w - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    const boxH = Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
    // 优点/缺点/攻略顺序/好感顺序：文字色用填写内容文字色，字号用填写内容字号，内容垂直居中
    drawTextBox(painter, x, boxY, w, boxH, text, config, false, false, valueColor, inputSize, true);
    return tfLabelH + boxH;
  }
  if (hasPros || hasCons) {
    const tfColW = (innerW - TEXT_FIELD_GAP) / 2;
    let rowMaxH = 0;
    if (hasPros) rowMaxH = Math.max(rowMaxH, drawTextField('优点', gameData.pros, contentX, tfColW));
    if (hasCons) rowMaxH = Math.max(rowMaxH, drawTextField('缺点', gameData.cons, contentX + tfColW + TEXT_FIELD_GAP, tfColW));
    painter.shiftY(rowMaxH + TEXT_FIELD_GAP);
  }
  if (hasStrategy) {
    const h = drawTextField('攻略顺序', gameData.strategyOrder, contentX, innerW);
    painter.shiftY(h + TEXT_FIELD_GAP);
  }
  if (hasFavor) {
    const h = drawTextField('好感顺序', gameData.favorOrder, contentX, innerW);
    painter.shiftY(h + TEXT_FIELD_GAP);
  }
  if (hasPros || hasCons || hasStrategy || hasFavor) {
    if (hasValidCharCards || hasValidTextCards || hasImpression) {
      painter.shiftY(SECTION_GAP);
    }
  }
  // 角色卡片网格
  const allCharCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  const validCharCards = allCharCards.filter(c => c.charId);
  if (validCharCards.length > 0) {
    const charCols = Math.max(1, Math.floor((innerW + CHAR_CARD_GAP) / (CHAR_CARD_SIZE + CHAR_CARD_GAP)));
    const charRows = Math.ceil(validCharCards.length / charCols);
    const labelLineH = CHAR_LABEL_SIZE * 1.4;
    for (let r = 0; r < charRows; r++) {
      // 按该行实际卡片数计算居中偏移（最后一行卡片数可能不足）
      const cardsInRow = Math.min(charCols, validCharCards.length - r * charCols);
      const rowTotalW = cardsInRow * CHAR_CARD_SIZE + (cardsInRow - 1) * CHAR_CARD_GAP;
      const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
      // 先求该行最大标签高度
      let rowMaxLabelH = 0;
      for (let c = 0; c < charCols; c++) {
        const idx = r * charCols + c;
        if (idx >= validCharCards.length) break;
        const labH = measureCenteredTextHeight(ctx, validCharCards[idx].label || '', CHAR_CARD_SIZE, labelLineH, CHAR_LABEL_SIZE);
        rowMaxLabelH = Math.max(rowMaxLabelH, Math.max(labH, labelLineH));
      }
      const rowMaxH = CHAR_CARD_SIZE + CHAR_LABEL_GAP + rowMaxLabelH;
      for (let c = 0; c < charCols; c++) {
        const idx = r * charCols + c;
        if (idx >= validCharCards.length) break;
        const card = validCharCards[idx];
        const x = contentX + rowOffset + c * (CHAR_CARD_SIZE + CHAR_CARD_GAP);
        const y = painter.y;
        const src = toCanvasUrl(card.coverSrc);
        const img = src ? imageCache.get(src) : null;
        drawCoverCard(painter, x, y, CHAR_CARD_SIZE, CHAR_CARD_SIZE, img, src, 6);
        // 标签统一对齐到该行封面底部
        const labelY = y + CHAR_CARD_SIZE + CHAR_LABEL_GAP;
        drawCenteredText(ctx, card.label || '', x + CHAR_CARD_SIZE / 2, labelY,
          CHAR_CARD_SIZE, labelLineH, CHAR_LABEL_SIZE,
          config.labelColor || '#b85878', true);
      }
      painter.shiftY(rowMaxH);
      if (r < charRows - 1) painter.shiftY(CHAR_CARD_GAP);
    }
    if (hasValidTextCards || hasImpression) {
      painter.shiftY(SECTION_GAP);
    }
  }
  // 文字卡片网格
  const allTextCards = [...(gameData.repoTextCards || []), ...(gameData.repoCustomTextCards || [])];
  const validTextCards = allTextCards.filter(c => {
    if (c.type === 'cp') return !!(c.femaleId && c.maleId);
    return !!(c.text && c.text.trim());
  });
  if (validTextCards.length > 0) {
    const tcCols = Math.max(1, Math.floor((innerW + TEXT_CARD_GAP) / (TEXT_CARD_W + TEXT_CARD_GAP)));
    const tcRows = Math.ceil(validTextCards.length / tcCols);
    const titleLineH = TEXT_CARD_TITLE_SIZE * 1.4;
    // 预计算每行高度
    const rowHeights = [];
    for (let r = 0; r < tcRows; r++) {
      let rowMax = 0;
      for (let c = 0; c < tcCols; c++) {
        const idx = r * tcCols + c;
        if (idx >= validTextCards.length) continue;
        const card = validTextCards[idx];
        const titleMaxW = TEXT_CARD_W - TEXT_CARD_PAD * 2;
        const titleActualH = measureCenteredTextHeight(ctx, card.label || '', titleMaxW, titleLineH, TEXT_CARD_TITLE_SIZE);
        let ch = TEXT_CARD_PAD * 2 + titleActualH + TEXT_CARD_TITLE_MB;
        if (card.type === 'cp') {
          ch += CP_SIZE;
        } else {
          const textAreaW = TEXT_CARD_W - TEXT_CARD_PAD * 2 - TEXT_BOX_PAD * 2;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, customTextSize * 1.55, customTextSize);
          ch += Math.max(TEXT_CARD_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
        }
        rowMax = Math.max(rowMax, ch);
      }
      rowHeights.push(rowMax);
    }
    for (let r = 0; r < tcRows; r++) {
      // 按该行实际卡片数计算居中偏移（最后一行卡片数可能不足）
      const cardsInRow = Math.min(tcCols, validTextCards.length - r * tcCols);
      const rowTotalW = cardsInRow * TEXT_CARD_W + (cardsInRow - 1) * TEXT_CARD_GAP;
      const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
      const rowH = rowHeights[r];
      for (let c = 0; c < tcCols; c++) {
        const idx = r * tcCols + c;
        if (idx >= validTextCards.length) break;
        const card = validTextCards[idx];
        const x = contentX + rowOffset + c * (TEXT_CARD_W + TEXT_CARD_GAP);
        const y = painter.y;
        // 卡片背景
        painter.drawRoundRect(x, y, TEXT_CARD_W, rowH, 12, config.cardBg || config.boxBgColor || '#fff7f9', '#eee', 1);
        // 标题
        const titleY = y + TEXT_CARD_PAD;
        const titleActualH = drawCenteredText(ctx, card.label || '', x + TEXT_CARD_W / 2, titleY,
          TEXT_CARD_W - TEXT_CARD_PAD * 2, titleLineH, TEXT_CARD_TITLE_SIZE,
          config.labelColor || '#b85878', true);
        const contentY = titleY + titleActualH + TEXT_CARD_TITLE_MB;
        if (card.type === 'cp') {
          // CP 双图
          const fSrc = toCanvasUrl(card.femaleCoverSrc);
          const mSrc = toCanvasUrl(card.maleCoverSrc);
          const fImg = fSrc ? imageCache.get(fSrc) : null;
          const mImg = mSrc ? imageCache.get(mSrc) : null;
          const totalW = CP_SIZE * 2 + CP_GAP;
          const startX = x + (TEXT_CARD_W - totalW) / 2;
          drawCoverCard(painter, startX, contentY, CP_SIZE, CP_SIZE, fImg, fSrc, 6);
          drawCoverCard(painter, startX + CP_SIZE + CP_GAP, contentY, CP_SIZE, CP_SIZE, mImg, mSrc, 6);
        } else {
          // 文本框
          const textAreaW = TEXT_CARD_W - TEXT_CARD_PAD * 2;
          const availableH = (y + rowH - TEXT_CARD_PAD) - contentY;
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize);
          const boxH = Math.max(TEXT_CARD_BOX_MIN_H, textH + TEXT_BOX_PAD * 2, availableH);
          drawTextBox(painter, x + TEXT_CARD_PAD, contentY, textAreaW, boxH, card.text || '', config, true, true);
        }
      }
      painter.shiftY(rowH);
      if (r < tcRows - 1) painter.shiftY(TEXT_CARD_GAP);
    }
    if (hasImpression) {
      painter.shiftY(SECTION_GAP);
    }
  }
  // 感想
  if (gameData.impression && String(gameData.impression).trim()) {
    ctx.font = `bold ${LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.fillText('感想', contentX, painter.y);
    const impBoxY = painter.y + LABEL_SIZE * 1.4 + 6;
    const impTextH = measureWrappedHeight(ctx, gameData.impression, innerW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize);
    const impBoxH = Math.max(IMPRESSION_MIN_H, impTextH + TEXT_BOX_PAD * 2);
    drawTextBox(painter, contentX, impBoxY, innerW, impBoxH, gameData.impression, config);
  }
  painter.y = cardTop + cardH;
}

function drawImpressionGameCard(painter, targetW, gameData, gameInfo, config, imageCache, globalSwitches, allGames) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - IMP_CARD_PAD * 2;
  const contentX = wrapX + IMP_CARD_PAD;
  const ctx = painter.ctx;
  const cardTop = painter.y;
  const totalH = calcImpressionGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache, globalSwitches, allGames);
  const cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - IMP_CARD_PAD * 2;
  const cardH = IMP_CARD_PAD * 2 + cardContentH;
  const customTextSize = config.customTextFontSize || 16;
  const labelColor = config.defaultTextColor || '#b85878';
  const textColor = config.customtext || '#c98fac';
  const switches = gameData.charSwitches || {};
  const gs = globalSwitches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  // 卡片外框：无色背景（fill 传 null）
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, null,
    config.imageBorderColor || '#f6a5b8', CARD_BORDER_W);
  painter.y = cardTop + IMP_CARD_PAD;
  // ===== 横板图：宽度铺满，高度按原比例自动变化（无最大高度限制、不裁剪），底部淡出 =====
  const infoImages = canvasGetImpInfoImages(gameInfo, gameData.gameId);
  const infoIdx = Math.min(gameData.infoImgIndex || 0, Math.max(0, infoImages.length - 1));
  const infoSrc = infoImages[infoIdx] ? toCanvasUrl(infoImages[infoIdx]) : '';
  const infoImg = infoSrc ? imageCache.get(infoSrc) : null;
  let infoH = 0;
  if (infoImg) {
    const { w, h: ih } = getImgSize(infoImg);
    if (w > 0 && ih > 0) {
      infoH = Math.round(innerW * ih / w);
    }
  }
  if (infoH > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(contentX, painter.y, innerW, infoH);
    ctx.clip();
    const resInfo = rawImageResourceCache.get(infoSrc);
    const drawTarget = resInfo?.type === 'image' ? resInfo.data : infoImg;
    // 完整绘制，不居中裁剪
    ctx.drawImage(drawTarget, contentX, painter.y, innerW, infoH);
    ctx.restore();
    // 底部淡出渐变（起始透明色适配用户自定义背景色）
    const fadeY = painter.y + infoH - IMP_INFO_FADE_H;
    const gradient = ctx.createLinearGradient(0, fadeY, 0, painter.y + infoH);
    gradient.addColorStop(0, hexToRgba(config.bg || '#fff7f9', 0));
    gradient.addColorStop(1, config.bg || '#fff7f9');
    ctx.fillStyle = gradient;
    ctx.fillRect(contentX, fadeY, innerW, IMP_INFO_FADE_H);
    painter.shiftY(infoH + IMP_INFO_MB);
  }
  // ===== 三列内容：不绘制游戏名，不绘制 4 开关 =====
  let visibleChars = canvasGetImpVisibleChars(gameInfo, switches, gs, allGames);
  // 过滤掉 Before / After 均未填写任何内容的角色（与 calcImpressionGameHeight 保持一致）
  visibleChars = visibleChars.filter(char => {
    const ct = gameData.charTexts?.[char.id];
    return !!(ct && ((ct.before && String(ct.before).trim()) || (ct.after && String(ct.after).trim())));
  });
  if (visibleChars.length > 0) {
    const blockW = (innerW - IMP_BLOCK_GAP) / IMP_BLOCK_COLS;
    const blockInnerW = blockW - IMP_BLOCK_PAD * 2;
    const charColW = IMP_CHAR_IMG_W;
    const textColW = (blockInnerW - charColW - IMP_COL_GAP * 2) / 2;
    const blockRows = Math.ceil(visibleChars.length / IMP_BLOCK_COLS);
    // Before / After 标签与文本框紧凑间距（标签16px + 4px = 20px，文本框上移）
    const labelH = IMP_COL_LABEL_SIZE + 4;
    for (let r = 0; r < blockRows; r++) {
      // 先算该行最大高度
      let rowMaxH = 0;
      const rowData = [];
      for (let c = 0; c < IMP_BLOCK_COLS; c++) {
        const idx = r * IMP_BLOCK_COLS + c;
        if (idx >= visibleChars.length) break;
        const char = visibleChars[idx];
        const ct = gameData.charTexts?.[char.id] || { before: '', after: '' };
        ctx.font = `${customTextSize}px ${FONT_SIYUAN}`;
        const beforeH = ct.before ?
          measureWrappedHeight(ctx, ct.before, textColW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize) : 0;
        const afterH = ct.after ?
          measureWrappedHeight(ctx, ct.after, textColW - TEXT_BOX_PAD * 2, customTextSize * 1.55, customTextSize) : 0;
        const beforeMinBoxH = Math.max(IMP_TEXTAREA_MIN_H, beforeH + TEXT_BOX_PAD * 2);
        const afterMinBoxH = Math.max(IMP_TEXTAREA_MIN_H, afterH + TEXT_BOX_PAD * 2);
        // 动态计算该角色在当前开关下的显示名称及换行后的实际高度
        const charShowHide = getCharShowHide(char, gs.hideChar || switches.hideChar, false, gs.fdChar || switches.fdChar, false);
        const charNameList = getCharNameList(char, charShowHide);
        const nameIdx = window.getOtherImpressionCharNameIndex ?
          window.getOtherImpressionCharNameIndex(gameData.gameId, char.id) : 0;
        const safeNameIdx = Math.min(nameIdx, Math.max(0, charNameList.length - 1));
        const dispName = charNameList[safeNameIdx] || char.name || '';
        ctx.font = `11px ${FONT_SIYUAN}`;
        const charNameLineH = 11 * 1.4;
        const charNameActualH = measureWrappedHeight(ctx, dispName, charColW, charNameLineH, 11);
        // 角色图顶部与文本框上边框对齐：上方预留 labelH 放标签，角色图 + 间距 + 角色名
        const charColTotal = labelH + IMP_CHAR_IMG_H + IMP_CHAR_NAME_GAP + Math.max(IMP_CHAR_NAME_H, charNameActualH);
        const blockContentH = Math.max(charColTotal, labelH + beforeMinBoxH, labelH + afterMinBoxH);
        rowMaxH = Math.max(rowMaxH, IMP_BLOCK_PAD * 2 + blockContentH);
        rowData.push({ char, ct, dispName, blockContentH });
      }
      // 同一行所有 block 的文本框高度统一对齐到行高（rowMaxH 减去上下 padding 和标签高度）
      const rowContentH = rowMaxH - IMP_BLOCK_PAD * 2;
      const rowBoxH = rowContentH - labelH;
      // 绘制该行每个 block
      rowData.forEach((rb, c) => {
        const blockX = contentX + c * (blockW + IMP_BLOCK_GAP);
        const blockY = painter.y;
        painter.drawRoundRect(blockX, blockY, blockW, rowMaxH, 10, '#ffffff', '#eee', 1);
        const ix = blockX + IMP_BLOCK_PAD;
        const iy = blockY + IMP_BLOCK_PAD;
        // Character 列：角色图（使用用户当前切换的那张）+ 角色名（使用用户切换显示的名字）
        const avail = canvasGetImpCharImages(rb.char, switches, gs);
        const charIdx = window.getOtherImpressionCharImgIndex ?
          window.getOtherImpressionCharImgIndex(gameData.gameId, rb.char.id) : 0;
        const safeCharIdx = Math.min(charIdx, Math.max(0, avail.length - 1));
        const charSrc = avail[safeCharIdx] ? toCanvasUrl(avail[safeCharIdx]) : '';
        const charImg = charSrc ? imageCache.get(charSrc) : null;
        // 角色图顶部与文本框上边框对齐：下移 labelH（与 Before/After 文本框顶部同高）
        const charImgY = iy + labelH;
        if (charImg) {
          drawCoverCard(painter, ix, charImgY, charColW, IMP_CHAR_IMG_H, charImg, charSrc, 6);
        } else {
          painter.drawRoundRect(ix, charImgY, charColW, IMP_CHAR_IMG_H, 6, '#f5f5f5', '#eee', 1);
        }
        // 角色名：多行换行居中绘制，不加粗，名称已在 rowData 预计算
        ctx.textBaseline = 'top';
        drawCenteredText(ctx, rb.dispName, ix + charColW / 2,
          charImgY + IMP_CHAR_IMG_H + IMP_CHAR_NAME_GAP,
          charColW, 11 * 1.4, 11, config.charNameColor || '#000000', false);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Before 列（标签字号 16px，对齐网页）
        const beforeX = ix + charColW + IMP_COL_GAP;
        ctx.font = `bold ${IMP_COL_LABEL_SIZE}px ${FONT_SIYUAN}`;
        ctx.fillStyle = labelColor;
        ctx.fillText('Before', beforeX + textColW / 2, iy);
        const beforeBoxY = iy + labelH;
        drawTextBox(painter, beforeX, beforeBoxY, textColW, rowBoxH,
          rb.ct.before || '', config, false, false, textColor, customTextSize, false);
        // After 列（标签字号 16px，对齐网页；显式重设 font/fillStyle，防止 drawTextBox 内 drawRoundRect 污染上下文）
        const afterX = beforeX + textColW + IMP_COL_GAP;
        ctx.font = `bold ${IMP_COL_LABEL_SIZE}px ${FONT_SIYUAN}`;
        ctx.fillStyle = labelColor;
        ctx.fillText('After', afterX + textColW / 2, iy);
        const afterBoxY = iy + labelH;
        drawTextBox(painter, afterX, afterBoxY, textColW, rowBoxH,
          rb.ct.after || '', config, false, false, textColor, customTextSize, false);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      });
      painter.shiftY(rowMaxH);
      if (r < blockRows - 1) painter.shiftY(IMP_BLOCK_GAP);
    }
  }
  painter.y = cardTop + cardH;
}

// 简评表单游戏绘制（仅游戏名+主体行，不含文本字段区/角色卡片/文字卡片/感想）
function drawBriefGameCard(painter, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_PAD * 2;
  const contentX = wrapX + CARD_PAD;
  const ctx = painter.ctx;
  const cardTop = painter.y;
  const cardH = calcBriefGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache);
  if (cardH <= 0) return; // 无内容，跳过
  const inputSize = config.inputFontSize || 16;
  const labelColor = config.defaultTextColor || '#b85878';
  const valueColor = config.inputTextColor || '#000000';
  // 卡片外框
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.imageBorderColor || '#f6a5b8', CARD_BORDER_W);
  painter.y = cardTop + CARD_PAD;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  wrapText(ctx, gameName, contentX, painter.y, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE,
    config.charNameColor || '#000000', FONT_SIYUAN, true);
  const nameH = measureWrappedHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, true);
  painter.shiftY(nameH + GAME_NAME_MB);
  // 主体行
  const bodyTop = painter.y;
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverH = calcGameCoverHeight(coverImg, COVER_W);
  drawCoverCard(painter, contentX, bodyTop, COVER_W, coverH, coverImg, coverSrc, 6);
  // 字段区
  const fieldX = contentX + COVER_W + 12;
  const fieldW = innerW - COVER_W - 12;
  const hasRadar = (gameData.fiveDim || []).some(d => (d.level || 0) > 0);
  const fieldRowH = Math.max(LABEL_SIZE * 1.4, GRADE_SIZE, HEART_SIZE, FIELD_VALUE_SIZE * 1.4, inputSize * 1.4);
  const labelCenterOffset = (fieldRowH - LABEL_SIZE) / 2;
  const gradeCenterOffset = (fieldRowH - GRADE_SIZE) / 2;
  const heartCenterOffset = (fieldRowH - HEART_SIZE) / 2;
  let fy = bodyTop;
  function drawFieldLabel(text, x, y) {
    ctx.font = `bold ${LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.fillText(text, x, y + labelCenterOffset);
    return ctx.measureText(text).width;
  }
  function drawFieldValue(text, x, y, size) {
    const s = size || inputSize;
    const offset = (fieldRowH - s) / 2;
    ctx.font = `${s}px ${FONT_SIYUAN}`;
    ctx.fillStyle = valueColor;
    ctx.fillText(text, x, y + offset);
  }
  // 行1：时长 + 全通
  const hasDuration = !!(gameData.duration && String(gameData.duration).trim());
  const hasCompleted = gameData.completed === true || gameData.completed === false;
  if (hasDuration || hasCompleted) {
    if (hasDuration) {
      const lw = drawFieldLabel('时长', fieldX, fy);
      drawFieldValue(String(gameData.duration).trim(), fieldX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    if (hasCompleted) {
      const halfW = fieldW / 2;
      const ynX = fieldX + halfW;
      const lw = drawFieldLabel('全通', ynX, fy);
      drawYnGroup(ctx, ynX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.completed, config);
    }
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行2：开始日期 + 结束日期
  const hasStartDate = !!(gameData.startDate && String(gameData.startDate).trim());
  const hasEndDate = !!(gameData.endDate && String(gameData.endDate).trim());
  if (hasStartDate || hasEndDate) {
    const halfW = fieldW / 2;
    if (hasStartDate) {
      const lw = drawFieldLabel('开始日期', fieldX, fy);
      drawFieldValue(String(gameData.startDate).trim(), fieldX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    if (hasEndDate) {
      const endX = fieldX + halfW;
      const lw = drawFieldLabel('结束日期', endX, fy);
      drawFieldValue(String(gameData.endDate).trim(), endX + lw + LABEL_VALUE_GAP, fy, FIELD_VALUE_SIZE);
    }
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 雷达图：整体左移，使最左端维度标签的第一个字与上方"全通"/"结束日期"对齐
  if (hasRadar) {
    const dims = gameData.fiveDim || [];
    // 找到最左端的维度（角度 cos 值最小，即最偏左）
    let leftmostIdx = 0;
    let minCos = Math.cos(RADAR_ANGLES[0] * Math.PI / 180);
    for (let i = 1; i < RADAR_ANGLES.length && i < dims.length; i++) {
      const c = Math.cos(RADAR_ANGLES[i] * Math.PI / 180);
      if (c < minCos) { minCos = c; leftmostIdx = i; }
    }
    // 测量最左端维度标签的宽度（与 drawRadarChart 内部字体一致：bold 12px）
    ctx.save();
    ctx.font = `bold ${RADAR_LABEL_SIZE}px ${FONT_SIYUAN}`;
    const leftLabelW = ctx.measureText(dims[leftmostIdx]?.name || '').width;
    ctx.restore();
    // 目标左边缘：与右半列字段标签（全通/结束日期）起始位置对齐
    const targetLeftX = fieldX + fieldW / 2;
    // 标签中心 x = radarCx + (RADAR_R + 22) * cos(angle)
    // 标签左边缘 = 标签中心 x - 标签宽度 / 2
    // 令标签左边缘 = targetLeftX，解出 radarCx
    let radarCx = targetLeftX - (RADAR_R + 22) * minCos + leftLabelW / 2;
    // 上限保护：雷达图最右端（含标签）不超出卡片大边框
    const cardRightEdge = fieldX + fieldW;
    const maxCx = cardRightEdge - (RADAR_R + 22) - 20;
    if (radarCx > maxCx) radarCx = maxCx;
    const radarCy = fy + RADAR_BOX_W / 2;
    drawRadarChart(ctx, radarCx, radarCy, dims, config);
  }
  // 行3：甜度
  if (gameData.sweetness) {
    const lw = drawFieldLabel('甜度', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.sweetness, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行4：虐度
  if (gameData.bitterness) {
    const lw = drawFieldLabel('虐度', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.bitterness, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行5：总评
  if (gameData.overall) {
    const lw = drawFieldLabel('总评', fieldX, fy);
    drawGradeGroup(ctx, fieldX + lw + LABEL_VALUE_GAP, fy + gradeCenterOffset, gameData.overall, config);
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  // 行6：喜爱度
  if (gameData.love && gameData.love > 0) {
    const lw = drawFieldLabel('喜爱度', fieldX, fy);
    painter.drawHeartRate(fieldX + lw + LABEL_VALUE_GAP, fy + heartCenterOffset,
      gameData.love, HEART_SIZE, HEART_GAP, config.heartColor || '#e895a8', '#cccccc');
    fy += fieldRowH + FIELD_ROW_GAP;
  }
  painter.y = cardTop + cardH;
}

// 主入口
async function renderOtherRepoGameCanvas(designW, gameData, gameInfo, config, dpr) {
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
  emitRenderProgress(5);
  let imageUrls = collectRepoGameImages(gameData, gameInfo);
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
  const totalH = calcRepoGameHeight(vCtx, designW, gameData, gameInfo, config, imageCache);
  vCanvas.width = 0; vCanvas.height = 0;
  if (IS_IOS_WEBKIT) {
    const totalPixel = (designW * DPR) * (totalH * DPR);
    if (totalPixel > 32 * 1024 * 1024) {
      console.warn(`⚠️ other IOS 画布像素超限风险：${totalPixel}`);
    }
  }
  const canvasHeight = totalH + getBodyPad();
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, canvasHeight, config.bg || '#fff7f9');
  drawBigTitle(painter, designW, 'Otome Report', config);
  drawRepoGameCard(painter, designW, gameData, gameInfo, config, imageCache);
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

async function renderOtherImpressionGameCanvas(designW, gameData, gameInfo, config, dpr, globalSwitches, allGames) {
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
  emitRenderProgress(5);
  let imageUrls = collectImpressionGameImages(gameData, gameInfo, globalSwitches, allGames);
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
  const totalH = calcImpressionGameHeight(vCtx, designW, gameData, gameInfo, config, imageCache, globalSwitches, allGames);
  vCanvas.width = 0; vCanvas.height = 0;
  if (IS_IOS_WEBKIT) {
    const totalPixel = (designW * DPR) * (totalH * DPR);
    if (totalPixel > 32 * 1024 * 1024) {
      console.warn(`⚠️ other Impression IOS 画布像素超限风险：${totalPixel}`);
    }
  }
  const canvasHeight = totalH + getBodyPad();
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, canvasHeight, config.bg || '#fff7f9');
  drawBigTitle(painter, designW, 'Otome Impression', config);
  drawImpressionGameCard(painter, designW, gameData, gameInfo, config, imageCache, globalSwitches, allGames);
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

// 简评表单页渲染（每页至多 BRIEF_GAMES_PER_PAGE 个游戏）
async function renderOtherBriefPageCanvas(designW, pageGameDataList, pageGameInfoList, pageIndex, config, dpr) {
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
  emitRenderProgress(5);
  // 收集并加载封面图片
  let imageUrls = collectBriefPageImages(pageGameDataList, pageGameInfoList);
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
  emitRenderProgress(50);
  // 计算总高度
  const vCanvas = document.createElement('canvas');
  const vCtx = vCanvas.getContext('2d');
  const titleAreaH = getBodyPad() + TITLE_SIZE + getTitleMb();
  let cardsTotalH = 0;
  const validCards = [];
  for (let i = 0; i < pageGameDataList.length; i++) {
    const ch = calcBriefGameHeight(vCtx, designW, pageGameDataList[i], pageGameInfoList[i], config, imageCache);
    if (ch > 0) {
      validCards.push({ gameData: pageGameDataList[i], gameInfo: pageGameInfoList[i], cardH: ch });
    }
  }
  vCanvas.width = 0; vCanvas.height = 0;
  if (validCards.length === 0) return null;
  for (let i = 0; i < validCards.length; i++) {
    cardsTotalH += validCards[i].cardH;
    if (i < validCards.length - 1) cardsTotalH += BRIEF_CARD_GAP;
  }
  const totalH = titleAreaH + cardsTotalH + getBodyPad();
  if (IS_IOS_WEBKIT) {
    const totalPixel = (designW * DPR) * (totalH * DPR);
    if (totalPixel > 32 * 1024 * 1024) {
      console.warn(`⚠️ other 简评表 IOS 画布像素超限风险：${totalPixel}`);
    }
  }
  emitRenderProgress(65);
  // 绘制
  const canvasHeight = totalH;
  const canvas = document.createElement('canvas');
  const painter = new CanvasLayoutPainter(canvas, designW, canvasHeight, config.bg || '#fff7f9');
  drawBigTitle(painter, designW, 'Otome Repo', config);
  for (let i = 0; i < validCards.length; i++) {
    drawBriefGameCard(painter, designW, validCards[i].gameData, validCards[i].gameInfo, config, imageCache);
    if (i < validCards.length - 1) painter.shiftY(BRIEF_CARD_GAP);
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

// 批量导出
export async function renderAllOtherGames(designW, otherData, gameTemplateList, config, dpr) {
  const results = [];
  const effectiveDpr = dpr || (config.normalQuality ? 1 : 2);
  // ===== 1. Repo 模块 =====
  const repoGames = otherData?.repoGames || [];
  for (const gameData of repoGames) {
    const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
    if (!gameInfo) continue;
    const blob = await renderOtherRepoGameCanvas(designW, gameData, gameInfo, config, effectiveDpr);
    if (blob) {
      results.push({ moduleType: 'repo', gameId: gameData.gameId, gameName: gameInfo.name, blob });
    }
  }
  // ===== 2. 简评表（Repo 之后、Impression 之前，受 exportBrief 开关控制）=====
  if (config.exportBrief !== false) {
    const validBriefGames = [];
    for (const gameData of repoGames) {
      const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
      if (gameInfo) validBriefGames.push({ gameData, gameInfo });
    }
    const totalBriefPages = Math.ceil(validBriefGames.length / BRIEF_GAMES_PER_PAGE);
    for (let p = 0; p < totalBriefPages; p++) {
      const pageGames = validBriefGames.slice(p * BRIEF_GAMES_PER_PAGE, (p + 1) * BRIEF_GAMES_PER_PAGE);
      const pageGameDataList = pageGames.map(g => g.gameData);
      const pageGameInfoList = pageGames.map(g => g.gameInfo);
      const blob = await renderOtherBriefPageCanvas(designW, pageGameDataList, pageGameInfoList, p, config, effectiveDpr);
      if (blob) {
        results.push({
          moduleType: 'brief',
          gameId: `brief_page_${p + 1}`,
          gameName: `简评表第${p + 1}页`,
          blob
        });
      }
    }
  }
  // ===== 3. Impression 模块 =====
  const impressionGames = otherData?.impressionGames || [];
  const impressionGlobalSwitches = otherData?.impressionGlobalSwitches ||
    { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  for (const gameData of impressionGames) {
    const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
    if (!gameInfo) continue;
    const blob = await renderOtherImpressionGameCanvas(
      designW, gameData, gameInfo, config, effectiveDpr,
      impressionGlobalSwitches, gameTemplateList
    );
    if (blob) {
      results.push({ moduleType: 'impression', gameId: gameData.gameId, gameName: gameInfo.name, blob });
    }
  }
  return results;
}

// 简评表批量导出：将 Repo 游戏按每页至多3个分组，逐页渲染
export async function renderAllOtherBriefGames(designW, otherData, gameTemplateList, config, dpr) {
  const results = [];
  const effectiveDpr = dpr || (config.normalQuality ? 1 : 2);
  const repoGames = otherData?.repoGames || [];
  // 过滤出有对应游戏模板的游戏
  const validGames = [];
  for (const gameData of repoGames) {
    const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
    if (gameInfo) validGames.push({ gameData, gameInfo });
  }
  // 按每页至多 BRIEF_GAMES_PER_PAGE 个分组
  const totalPages = Math.ceil(validGames.length / BRIEF_GAMES_PER_PAGE);
  for (let p = 0; p < totalPages; p++) {
    const pageGames = validGames.slice(p * BRIEF_GAMES_PER_PAGE, (p + 1) * BRIEF_GAMES_PER_PAGE);
    const pageGameDataList = pageGames.map(g => g.gameData);
    const pageGameInfoList = pageGames.map(g => g.gameInfo);
    const blob = await renderOtherBriefPageCanvas(designW, pageGameDataList, pageGameInfoList, p, config, effectiveDpr);
    if (blob) {
      results.push({
        moduleType: 'brief',
        gameId: `brief_page_${p + 1}`,
        gameName: `简评表第${p + 1}页`,
        blob
      });
    }
  }
  return results;
}

// 挂载到 window
if (typeof window !== 'undefined') {
  window.renderOtherRepoGameCanvas = renderOtherRepoGameCanvas;
  window.renderOtherImpressionGameCanvas = renderOtherImpressionGameCanvas;
  window.renderAllOtherGames = renderAllOtherGames;
  window.renderAllOtherBriefGames = renderAllOtherBriefGames;
}
