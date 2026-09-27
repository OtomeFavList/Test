// other-canvas-render.js
// Other 模式纯 Canvas 绘制导出
// 每个游戏单独生成一张图，固定设计宽度 720，DPR×2 高清输出
import {
  getWebImageUrl,
  preloadImageBitmap,
  preloadAndDecodeImage,
  convertR2ToJsDelivr,
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
const CHAR_LABEL_SIZE = 16;  // 18→16
const CHAR_LABEL_GAP = 6;    // 8→6

// 文本卡片网格（略微缩小，正好一行3个）
const TEXT_CARD_W = 200;      // 225→200
const TEXT_CARD_GAP = 12;     // 16→12
const TEXT_CARD_PAD = 12;     // 14→12
const TEXT_CARD_TITLE_MB = 8; // 10→8
const TEXT_CARD_TITLE_SIZE = 16; // 18→16
const TEXT_CARD_BOX_MIN_H = 72; // 80→72
const CP_SIZE = 88;            // 100→88
const CP_GAP = 8;              // 10→8

// 感想
const IMPRESSION_MIN_H = 72;

// 区块间距
const SECTION_GAP = 14;
const GAME_NAME_MB = 12;

// 缓存
const roundImageCache = new Map();
const rawImageResourceCache = new Map();

// 工具函数
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

function drawTextBox(painter, x, y, boxW, boxH, text, config, noBorder, centerText, textColor) {
  painter.drawRoundRect(x, y, boxW, boxH, SUB_CARD_RADIUS, '#ffffff',
    noBorder ? null : (config.customborder || '#eee'), noBorder ? 0 : 1);
  if (text) {
    const textSize = config.inputFontSize || config.customTextFontSize || 16;
    // textColor 未传时默认用自定义文本色（文字卡片/感想）；
    // 优点/缺点/攻略顺序/好感顺序传入 inputTextColor（填写内容文字色）
    const color = textColor || config.customtext || '#c98fac';
    if (centerText) {
      drawCenteredText(painter.ctx, text, x + boxW / 2, y + TEXT_BOX_PAD,
        boxW - TEXT_BOX_PAD * 2, textSize * 1.55, textSize,
        color, false);
    } else {
      wrapText(
        painter.ctx, text,
        x + TEXT_BOX_PAD, y + TEXT_BOX_PAD,
        boxW - TEXT_BOX_PAD * 2,
        textSize * 1.55, textSize,
        color
      );
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

// 高度计算
function calcRepoGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  const inputSize = config.inputFontSize || 16;
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
  const radarTopOffset = rowsBeforeSweetness > 0
    ? rowsBeforeSweetness * fieldRowH + (rowsBeforeSweetness - 1) * FIELD_ROW_GAP
    : 0;
  const radarBottomOffset = hasRadar ? (radarTopOffset + RADAR_BOX_W) : 0;

  const bodyContentH = Math.max(fieldAreaH, radarBottomOffset);
  const bodyRowH = Math.max(coverH, bodyContentH);
  contentH += bodyRowH + SECTION_GAP;

  // 文本字段区
  const tfLabelH = LABEL_SIZE * 1.4 + 4;
  const hasPros = !!(gameData.pros && String(gameData.pros).trim());
  const hasCons = !!(gameData.cons && String(gameData.cons).trim());
  const hasStrategy = !!(gameData.strategyOrder && String(gameData.strategyOrder).trim());
  const hasFavor = !!(gameData.favorOrder && String(gameData.favorOrder).trim());
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
    contentH += SECTION_GAP;
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
    contentH += gridH + SECTION_GAP;
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
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, inputSize * 1.55, inputSize);
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
    contentH += tcGridH + SECTION_GAP;
  }

  // 感想
  if (gameData.impression && String(gameData.impression).trim()) {
    const impLabelH = LABEL_SIZE * 1.4 + 6;
    const impTextH = measureWrappedHeight(ctx, gameData.impression, innerW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    contentH += impLabelH + Math.max(IMPRESSION_MIN_H, impTextH + TEXT_BOX_PAD * 2);
  }
  h += CARD_PAD * 2 + contentH;
  return h;
}

function calcImpressionGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const innerW = wrapW - CARD_PAD * 2;
  let h = getBodyPad() + TITLE_SIZE + getTitleMb();
  let contentH = 0;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  const nameH = measureWrappedHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, true);
  contentH += nameH + GAME_NAME_MB;
  // 封面
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverH = calcGameCoverHeight(coverImg, 180);
  contentH += coverH;
  h += CARD_PAD * 2 + contentH;
  return h;
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
  const labelColor = config.defaultTextColor || '#b85878';
  const valueColor = config.inputTextColor || '#000000';
  // 卡片外框
  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', CARD_BORDER_W);
  painter.y = cardTop + CARD_PAD;
  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  wrapText(ctx, gameName, contentX, painter.y, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE,
    config.gamename || '#000000', FONT_SIYUAN, true);
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
      const halfW = leftColW / 2;
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
    const halfW = leftColW / 2;
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
  // 雷达图
  if (hasRadar) {
    const radarAreaX = fieldX + leftColW + radarGap;
    const radarCx = radarAreaX + RADAR_BOX_W / 2;
    const radarCy = fy + RADAR_BOX_W / 2;
    drawRadarChart(ctx, radarCx, radarCy, gameData.fiveDim || [], config);
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
  const fieldAreaH = fy - bodyTop;
  const radarBottomOffset = hasRadar ? (RADAR_BOX_W + ((hasDuration || hasCompleted || hasStartDate || hasEndDate) ? (fieldRowH + FIELD_ROW_GAP) : 0)) : 0;
  const bodyRowH = Math.max(coverH, fieldAreaH, radarBottomOffset);
  painter.shiftY(bodyRowH + SECTION_GAP);
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
    const textH = measureWrappedHeight(ctx, text, w - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    const boxH = Math.max(TEXT_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
    // 优点/缺点/攻略顺序/好感顺序的文字色用填写内容文字色 inputTextColor
    drawTextBox(painter, x, boxY, w, boxH, text, config, false, false, valueColor);
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
    painter.shiftY(SECTION_GAP);
  }
  // 角色卡片网格
  const allCharCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  const validCharCards = allCharCards.filter(c => c.charId);
  if (validCharCards.length > 0) {
    const charCols = Math.max(1, Math.floor((innerW + CHAR_CARD_GAP) / (CHAR_CARD_SIZE + CHAR_CARD_GAP)));
    const charRows = Math.ceil(validCharCards.length / charCols);
    const labelLineH = CHAR_LABEL_SIZE * 1.4;
    const rowTotalW = charCols * CHAR_CARD_SIZE + (charCols - 1) * CHAR_CARD_GAP;
    const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
    for (let r = 0; r < charRows; r++) {
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
    painter.shiftY(SECTION_GAP);
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
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW, inputSize * 1.55, inputSize);
          ch += Math.max(TEXT_CARD_BOX_MIN_H, textH + TEXT_BOX_PAD * 2);
        }
        rowMax = Math.max(rowMax, ch);
      }
      rowHeights.push(rowMax);
    }
    const rowTotalW = tcCols * TEXT_CARD_W + (tcCols - 1) * TEXT_CARD_GAP;
    const rowOffset = Math.max(0, (innerW - rowTotalW) / 2);
    for (let r = 0; r < tcRows; r++) {
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
          const textH = measureWrappedHeight(ctx, card.text || '', textAreaW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
          const boxH = Math.max(TEXT_CARD_BOX_MIN_H, textH + TEXT_BOX_PAD * 2, availableH);
          drawTextBox(painter, x + TEXT_CARD_PAD, contentY, textAreaW, boxH, card.text || '', config, true, true);
        }
      }
      painter.shiftY(rowH);
      if (r < tcRows - 1) painter.shiftY(TEXT_CARD_GAP);
    }
    painter.shiftY(SECTION_GAP);
  }
  // 感想
  if (gameData.impression && String(gameData.impression).trim()) {
    ctx.font = `bold ${LABEL_SIZE}px ${FONT_SIYUAN}`;
    ctx.fillStyle = labelColor;
    ctx.fillText('感想', contentX, painter.y);
    const impBoxY = painter.y + LABEL_SIZE * 1.4 + 6;
    const impTextH = measureWrappedHeight(ctx, gameData.impression, innerW - TEXT_BOX_PAD * 2, inputSize * 1.55, inputSize);
    const impBoxH = Math.max(IMPRESSION_MIN_H, impTextH + TEXT_BOX_PAD * 2);
    drawTextBox(painter, contentX, impBoxY, innerW, impBoxH, gameData.impression, config);
  }
  painter.y = cardTop + cardH;
}

function drawImpressionGameCard(painter, targetW, gameData, gameInfo, config, imageCache) {
  const wrapW = getWrapW(targetW);
  const wrapX = getWrapX(targetW, wrapW);
  const innerW = wrapW - CARD_PAD * 2;
  const contentX = wrapX + CARD_PAD;
  const ctx = painter.ctx;

  const cardTop = painter.y;
  const totalH = calcImpressionGameHeight(ctx, targetW, gameData, gameInfo, config, imageCache);
  const cardContentH = totalH - (getBodyPad() + TITLE_SIZE + getTitleMb()) - CARD_PAD * 2;
  const cardH = CARD_PAD * 2 + cardContentH;

  painter.drawRoundRect(wrapX, cardTop, wrapW, cardH, CARD_RADIUS, '#ffffff', config.border || '#f6a5b8', CARD_BORDER_W);
  painter.y = cardTop + CARD_PAD;

  // 游戏名
  const gameName = gameInfo?.name || gameData.gameId || '';
  drawCenteredText(ctx, gameName, contentX + innerW / 2, painter.y, innerW,
    GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE, config.gamename || '#000000', true);
  const nameH = measureCenteredTextHeight(ctx, gameName, innerW, GAME_NAME_SIZE * 1.3, GAME_NAME_SIZE);
  painter.shiftY(nameH + GAME_NAME_MB);

  // 封面
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  const coverImg = coverSrc ? imageCache.get(coverSrc) : null;
  const coverW = 180;
  const coverH = calcGameCoverHeight(coverImg, coverW);
  const coverX = contentX + (innerW - coverW) / 2;
  drawCoverCard(painter, coverX, painter.y, coverW, coverH, coverImg, coverSrc, 6);

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
  imageUrls = imageUrls.filter(src => SAFE_URL_PATTERN.test(src));
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

async function renderOtherImpressionGameCanvas(designW, gameData, gameInfo, config, dpr) {
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
  const coverSrc = toCanvasUrl(gameInfo?.cover || '');
  let imageUrls = coverSrc ? [coverSrc] : [];
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
  const totalH = calcImpressionGameHeight(vCtx, designW, gameData, gameInfo, config, imageCache);
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
  drawImpressionGameCard(painter, designW, gameData, gameInfo, config, imageCache);
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
  // Repo 模块
  const repoGames = otherData?.repoGames || [];
  for (const gameData of repoGames) {
    const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
    if (!gameInfo) continue;
    const blob = await renderOtherRepoGameCanvas(designW, gameData, gameInfo, config, effectiveDpr);
    if (blob) {
      results.push({ moduleType: 'repo', gameId: gameData.gameId, gameName: gameInfo.name, blob });
    }
  }
  // Impression 模块
  const impressionGames = otherData?.impressionGames || [];
  for (const gameData of impressionGames) {
    const gameInfo = gameTemplateList.find(g => g.id === gameData.gameId);
    if (!gameInfo) continue;
    const blob = await renderOtherImpressionGameCanvas(designW, gameData, gameInfo, config, effectiveDpr);
    if (blob) {
      results.push({ moduleType: 'impression', gameId: gameData.gameId, gameName: gameInfo.name, blob });
    }
  }
  return results;
}

// 挂载到 window
if (typeof window !== 'undefined') {
  window.renderOtherRepoGameCanvas = renderOtherRepoGameCanvas;
  window.renderOtherImpressionGameCanvas = renderOtherImpressionGameCanvas;
  window.renderAllOtherGames = renderAllOtherGames;
}
