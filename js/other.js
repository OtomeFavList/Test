// Other 模式 other.js

import {
  gameTemplateList,
  getWebImageUrl,
  renderGameSelectItem,
  fillFilterOptions,
  getAvailableCharImages,
  getCharNameList,
  getCharShowHide,
  switchCharImageWithLoading
} from './main.js';

// 常量
const OTHER_DATA_KEY = 'other-report-data';
const OTHER_CONFIG_KEY = 'other-export-config';

const GRADES = ['S', 'A', 'B', 'C', 'D', 'E'];
const DEFAULT_DIMS = ['剧情', '角色', '配音', '音乐', '画风'];
// Repo 固定角色标签卡片（全部走角色弹窗；"最喜欢的CP"已移至文本卡片组）
const REPO_FIXED_CHAR_LABELS = [
  '盲狙', '最喜欢', '外貌最喜欢', '声音最喜欢', '人设最喜欢',
  '剧情最喜欢', '最喜欢的Sub', '最能共情',
  '相处最舒服', '过程最开心', '过程最心痛', '最希望转正'
];
// Repo 固定文本卡片（第一个"最喜欢的CP"走CP弹窗，其余为普通文本卡片）
const REPO_FIXED_TEXT_LABELS = [
  { label: '最喜欢的CP', type: 'cp' },
  { label: '最喜欢的台词', type: 'text' },
  { label: '最喜欢的场景', type: 'text' },
  { label: '最喜欢的结局', type: 'text' }
];

// Impression 模块：4个单独开关配置（与 Annual 弹窗页面二完全对应）
const IMPRESSION_SWITCH_CONFIG = [
  { key: 'subChar',   label: '单独显示本游戏次要角色' },
  { key: 'fdSubChar', label: '单独显示本游戏续作/FD次要角色' },
  { key: 'hideChar',  label: '单独显示本游戏隐藏图片、角色' },
  { key: 'fdChar',    label: '单独显示本游戏续作/FD图片、角色' }
];
const otherExportDefault = {
  bg: "#fff7f9",
  title: "#b33a3a",
  charNameColor: "#000000",
  defaultTextColor: "#b85878",
  inputTextColor: "#000000",
  activeFillColor: "#e895a8",
  heartColor: "#e895a8",
  radarColor: "#e895a8",
  cardBg: "#fff7f9",
  labelColor: "#b85878",
  customtext: "#c98fac",
  customborder: "#eeeeee",
  reporterName: "",
  reporterColor: "#b33a3a",
  imageBorderColor: "#f6a5b8",
  border: "#f6a5b8",
  normalQuality: false,
  exportBrief: true,
  inputFontSize: 16,
  customTextFontSize: 16
};

// 爱心 SVG
const HEART_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

// 运行时状态
let otherData = null;
let otherConfig = null;
let otherAddTarget = null; // "repo" | "impression" | null
// Repo 角色卡片弹窗目标：{ gameIdx, cardIdx, type: 'char'|'cp' }
let otherRepoCharTarget = null;
// Impression 模块：角色立绘切换索引（key="${gameId}-${charId}"）
const otherImpressionCharImgIndex = new Map();
// Impression 模块：角色名切换索引（key="${gameId}-${charId}"）
const otherImpressionCharNameIndex = new Map();
// Impression 模块：全局角色显示开关（作用于所有游戏，与 Annual 弹窗全局开关逻辑一致）
let otherImpGlobalSwitches = { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
// 供 canvas 导出读取：用户当前切换到的角色立绘索引
window.getOtherImpressionCharImgIndex = function (gameId, charId) {
  return otherImpressionCharImgIndex.get(`${gameId}-${charId}`) ?? 0;
};
// 供 canvas 导出读取：用户当前切换到的角色名索引
window.getOtherImpressionCharNameIndex = function (gameId, charId) {
  return otherImpressionCharNameIndex.get(`${gameId}-${charId}`) ?? 0;
};
// 导出渲染锁，防止重复点击
let _otherIsRendering = false;
// 导出预览弹窗状态
let _otherPreviewResults = [];
let _otherPreviewUrls = [];
let _otherPreviewBound = false;
let _otherCurrentPage = 0;

// 新增：合并本篇 + FD 游戏列表
function isGameTemplateReady() {
  const core = window.Core;
  if (core && Array.isArray(core.gameTemplateList) && core.gameTemplateReady === true) {
    return true;
  }
  return Array.isArray(window.__gameTemplateList) &&
         window.__gameTemplateList.length > 0 &&
         window.__gameTemplateReady === true;
}

function getCombinedGameList() {
  let baseList = [];
  const core = window.Core;
  // 增加 length > 0 检查：window.Core.gameTemplateList 为空数组时不使用，继续 fallback 到 import 的 gameTemplateList
  if (core && Array.isArray(core.gameTemplateList) && core.gameTemplateReady === true && core.gameTemplateList.length > 0) {
    baseList = core.gameTemplateList;
  } else if (Array.isArray(window.__gameTemplateList) && window.__gameTemplateList.length > 0) {
    baseList = window.__gameTemplateList;
  } else if (Array.isArray(gameTemplateList) && gameTemplateList.length > 0) {
    baseList = gameTemplateList;
  }
  const fdList = Array.isArray(window.__fdGameTemplateList) ? window.__fdGameTemplateList : [];
  return [...baseList, ...fdList];
}
// 获取游戏的合并角色列表：普通游戏角色 + 所有关联FD游戏的角色
// 支持多个FD关联同一个普通游戏（通过FD游戏的 baseGameId 字段）
function getGameMergedCharList(gameInfo) {
  if (!gameInfo) return [];
  const fdList = Array.isArray(window.__fdGameTemplateList) ? window.__fdGameTemplateList : [];
  let baseGameInfo = gameInfo;
  // 确定 baseGameId：优先用 gameInfo.baseGameId；若字段丢失但 id 以 "fd" 开头，则从 id 推断（fd001 → game001）
  let targetBaseId = gameInfo.baseGameId || null;
  if (!targetBaseId && gameInfo.id && gameInfo.id.indexOf('fd') === 0) {
    targetBaseId = 'game' + gameInfo.id.substring(2);
  }
  if (targetBaseId) {
    let found = null;
    const combinedList = getCombinedGameList();
    found = combinedList.find(g => g.id === targetBaseId);
    if (!found && Array.isArray(window.__gameTemplateList)) {
      found = window.__gameTemplateList.find(g => g.id === targetBaseId);
    }
    if (!found && Array.isArray(gameTemplateList)) {
      found = gameTemplateList.find(g => g.id === targetBaseId);
    }
    if (found) baseGameInfo = found;
  }
  const baseChars = Array.isArray(baseGameInfo.charList) ? baseGameInfo.charList : [];
  // 关联 FD 游戏过滤：兼容 baseGameId 字段存在 和 从 id 推断两种情况
  const relatedFdGames = fdList.filter(fd => fd && (
    fd.baseGameId === baseGameInfo.id ||
    (fd.id && fd.id.indexOf('fd') === 0 && 'game' + fd.id.substring(2) === baseGameInfo.id)
  ));
  if (relatedFdGames.length === 0) return baseChars;
  const fdChars = [];
  relatedFdGames.forEach(fd => {
    if (Array.isArray(fd.charList)) {
      fd.charList.forEach(char => {
        fdChars.push({
          ...char,
          _fdSourceId: fd.id,
          _fdSourceName: fd.name
        });
      });
    }
  });
  return [...baseChars, ...fdChars];
}
// 数据持久化
function loadOtherData() {
  try {
    const raw = localStorage.getItem(OTHER_DATA_KEY);
    otherData = raw ? JSON.parse(raw) : {};
  } catch (e) {
    otherData = {};
  }
  if (!Array.isArray(otherData.repoGames)) otherData.repoGames = [];
  if (!Array.isArray(otherData.impressionGames)) otherData.impressionGames = [];

  // 数据迁移：将旧版 repoCharCards 中的"最喜欢的CP"卡片移至 repoTextCards 开头，并补全 type 字段
  otherData.repoGames.forEach(game => {
    if (game.folded === undefined) game.folded = false;
    if (Array.isArray(game.repoCharCards)) {
      const cpIdx = game.repoCharCards.findIndex(c => c.label === '最喜欢的CP' || c.type === 'cp');
      if (cpIdx >= 0) {
        const cpCard = game.repoCharCards.splice(cpIdx, 1)[0];
        cpCard.type = 'cp';
        if (!Array.isArray(game.repoTextCards)) game.repoTextCards = [];
        game.repoTextCards = game.repoTextCards.map(c => ({ type: 'text', ...c }));
        game.repoTextCards.unshift(cpCard);
      } else if (Array.isArray(game.repoTextCards)) {
        game.repoTextCards = game.repoTextCards.map((c, i) => ({
          type: (i === 0 && c.label === '最喜欢的CP') ? 'cp' : 'text',
          ...c
        }));
      }
    }
    if (Array.isArray(game.repoCustomTextCards)) {
      game.repoCustomTextCards = game.repoCustomTextCards.map(c => ({ type: 'text', ...c }));
    }
  });
  otherData.impressionGames.forEach(game => {
    if (game.folded === undefined) game.folded = false;
    if (!game.charSwitches) {
      game.charSwitches = { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
    }
    if (!game.charTexts) game.charTexts = {};
  });
  // 数据迁移：补全 Impression 全局开关
  if (!otherData.impressionGlobalSwitches) {
    otherData.impressionGlobalSwitches = { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  }
  // 加载全局开关到运行时变量
  otherImpGlobalSwitches = { ...otherData.impressionGlobalSwitches };
}

function saveOtherData() {
  localStorage.setItem(OTHER_DATA_KEY, JSON.stringify(otherData));
}

function loadOtherConfig() {
  try {
    const raw = localStorage.getItem(OTHER_CONFIG_KEY);
    otherConfig = raw ? JSON.parse(raw) : {};
  } catch (e) {
    otherConfig = {};
  }
  // 旧字段迁移
  if (otherConfig.boxbg !== undefined && otherConfig.cardBg === undefined) {
    otherConfig.cardBg = otherConfig.boxbg;
  }
  if (otherConfig.labelcolor !== undefined && otherConfig.labelColor === undefined) {
    otherConfig.labelColor = otherConfig.labelcolor;
  }
  if (otherConfig.subtitle !== undefined && otherConfig.title !== undefined) {
    // 小标题色并入标题色，保留旧值作为默认内容文字色兜底
    if (otherConfig.defaultTextColor === undefined) {
      otherConfig.defaultTextColor = otherConfig.subtitle;
    }
  }
  if (otherConfig.gamename !== undefined && otherConfig.inputTextColor === undefined) {
    otherConfig.inputTextColor = otherConfig.gamename;
  }
  otherConfig = { ...otherExportDefault, ...otherConfig };
  // 旧字段 gamename 迁移到 charNameColor（"游戏名文字色"改名为"游戏角色名文字色"）
  if (otherConfig.gamename !== undefined && otherConfig.charNameColor === undefined) {
    otherConfig.charNameColor = otherConfig.gamename;
  }
  // 三位十六进制色修复（input[type=color] 只接受六位）
  ['customborder', 'cardBg', 'imageBorderColor', 'labelColor', 'reporterColor'].forEach(key => {
    if (otherConfig[key] && /^#[0-9a-fA-F]{3}$/.test(otherConfig[key])) {
      otherConfig[key] = "#" + otherConfig[key][1].repeat(2)
                       + otherConfig[key][2].repeat(2)
                       + otherConfig[key][3].repeat(2);
    }
  });
}

function saveOtherConfig() {
  localStorage.setItem(OTHER_CONFIG_KEY, JSON.stringify(otherConfig));
}

// 创建新 Rero 游戏数据（默认值）
function createReroGameData(gameId) {
  return {
    gameId: gameId,
    folded: false,
    duration: "",
    completed: null,
    startDate: "",
    endDate: "",
    sweetness: "",
    bitterness: "",
    overall: "",
    love: 0,
    fiveDim: DEFAULT_DIMS.map(name => ({ name: name, level: 0 })),
    pros: "",
    cons: "",
    strategyOrder: "",
    favorOrder: "",
    impression: "",
    // 角色标签卡片：12固定 + 自定义（全部为角色类型）
    repoCharCards: REPO_FIXED_CHAR_LABELS.map(label => ({
      label: label,
      type: 'char',
      gameId: '', charId: '', charName: '', coverSrc: ''
    })),
    repoCustomCharCards: [{ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' }],
    // 文本卡片：4固定（含1个CP卡片） + 自定义
    repoTextCards: REPO_FIXED_TEXT_LABELS.map(item => {
      if (item.type === 'cp') {
        return {
          label: item.label,
          type: 'cp',
          gameId: '', femaleId: '', maleId: '', femaleName: '', maleName: '',
          femaleCoverSrc: '', maleCoverSrc: ''
        };
      }
      return { label: item.label, type: 'text', text: '' };
    }),
    repoCustomTextCards: [{ label: '', type: 'text', text: '' }]
  };
}

// 创建新 Impression 游戏数据（默认值）
function createImpressionGameData(gameId) {
  return {
    gameId: gameId,
    folded: false,
    charSwitches: { subChar: false, hideChar: false, fdChar: false, fdSubChar: false },
    charTexts: {}  // { "charId": { before: "", after: "" } }
  };
}

// SABCDE 按钮组
function renderGradeGroup(field, value) {
  return GRADES.map(g =>
    `<button class="other-grade-btn ${value === g ? 'active' : ''}" data-grade="${field}" data-value="${g}">${g}</button>`
  ).join("");
}

// 五维图
function renderFiveDim(dims) {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const R = 68;
  const levels = 5;
  const angles = [-90, -18, 54, 126, 198];
  function pt(angleDeg, radius) {
    const rad = angleDeg * Math.PI / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }
  let grid = '';
  for (let l = 1; l <= levels; l++) {
    const r = R * l / levels;
    const pts = angles.map(a => pt(a, r).join(',')).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="#d8d8d8" stroke-width="1"/>`;
  }
  let axes = '';
  angles.forEach(a => {
    const [x, y] = pt(a, R);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#d8d8d8" stroke-width="1"/>`;
  });
  const dataPts = dims.map((d, i) => {
    const r = R * (d.level || 0) / levels;
    return pt(angles[i], r).join(',');
  }).join(' ');
  let hits = '';
  dims.forEach((d, i) => {
    for (let l = 1; l <= levels; l++) {
      const [x, y] = pt(angles[i], R * l / levels);
      const isActive = (d.level || 0) >= l;
      hits += `<circle cx="${x}" cy="${y}" r="7" `
            + `fill="${isActive ? 'var(--other-radar-color, #e895a8)' : '#ffffff'}" `
            + `stroke="var(--other-radar-color, #e895a8)" stroke-width="1.5" `
            + `class="radar-level-hit" data-dim-idx="${i}" data-level="${l}" `
            + `style="cursor:pointer"/>`;
    }
  });
  // 维度名标签：改为HTML input，定位在SVG外层，可直接点击编辑
  // 移动端标签离圆圈更远（R+40），防止点击最外层圆圈时误触标签触发编辑
  // 桌面端保持 R+30
  const isMobileRadar = typeof window !== 'undefined' && window.innerWidth <= 768;
  const labelRadius = isMobileRadar ? R + 40 : R + 30;
  let labelInputs = '';
  dims.forEach((d, i) => {
    const [x, y] = pt(angles[i], labelRadius);
    labelInputs += `<input type="text" class="radar-label-input" value="${d.name}" `
                 + `data-dim-idx="${i}" `
                 + `style="left:${x}px;top:${y}px;" />`;
  });
  return `
    <div class="other-radar-wrap">
      <div class="other-radar-chart">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          ${grid}
          ${axes}
          <polygon points="${dataPts}" fill="var(--other-radar-color, #e895a8)" fill-opacity="0.25" stroke="var(--other-radar-color, #e895a8)" stroke-width="2" style="pointer-events:none"/>
          ${hits}
        </svg>
      </div>
      ${labelInputs}
    </div>
  `;
}

// 渲染 Repo 角色标签卡片（固定12 + 自定义）
function renderRepoCharCards(gameData) {
  const allCards = [...(gameData.repoCharCards || []), ...(gameData.repoCustomCharCards || [])];
  let html = '<div class="other-repo-char-card-grid">';
  allCards.forEach((card, idx) => {
    const isCustom = idx >= (gameData.repoCharCards?.length || 0);
    // 复用Annual模块七逻辑：有图或自定义卡片显示×按钮；有图点击清除，无图自定义点击删除整卡
    const showRemoveBtn = !!card.charId || isCustom;
    const removeBtn = showRemoveBtn
      ? `<button class="other-repo-card-remove" data-repo-char-remove="${idx}">×</button>`
      : '';
    // 卡片 body：有角色显示图片+×，无角色显示+按钮（自定义卡片额外带×删除整卡）
    let bodyHtml;
    if (card.charId) {
      bodyHtml = `
        <div class="other-repo-char-preview">
          <img src="${card.coverSrc && (card.coverSrc.startsWith('http') || card.coverSrc.startsWith('blob:')) ? card.coverSrc : getWebImageUrl(card.coverSrc)}" alt="${card.charName}">
        </div>
        ${removeBtn}`;
    } else {
      bodyHtml = `<button class="other-repo-card-add" data-repo-char-add="${idx}">+</button>${removeBtn}`;
    }
    // 标签：固定卡片显示纯文本，自定义卡片显示可编辑 textarea
    const labelHtml = isCustom
      ? `<textarea class="other-repo-card-label-edit" data-repo-char-label="${idx}" placeholder="自定义标签" rows="1">${card.label || ''}</textarea>`
      : `<div class="other-repo-card-label">${card.label}</div>`;
    // DOM顺序：封面在上、标签在下（复刻模块七）
    html += `
      <div class="other-repo-char-card">
        <div class="other-repo-card-body">${bodyHtml}</div>
        ${labelHtml}
      </div>`;
  });
  html += '</div>';
  return html;
}

// 渲染 Repo 文本卡片（固定4 + 自定义）
function renderRepoTextCards(gameData) {
  const allCards = [...(gameData.repoTextCards || []), ...(gameData.repoCustomTextCards || [])];
  let html = '<div class="other-repo-text-card-grid">';
  allCards.forEach((card, idx) => {
    const isCustom = idx >= (gameData.repoTextCards?.length || 0);
    const isCp = card.type === 'cp';
    // 标签：固定卡片显示纯文本，自定义卡片显示可编辑 textarea
    const labelHtml = isCustom
      ? `<textarea class="other-repo-card-label-edit" data-repo-text-label="${idx}" placeholder="自定义标签" rows="1">${card.label || ''}</textarea>`
      : `<div class="other-repo-card-label">${card.label}</div>`;
    const removeBtn = isCustom
      ? `<button class="other-repo-card-remove" data-repo-text-remove="${idx}">×</button>`
      : '';
    // 内容区：CP卡片显示男女主图片预览或+按钮；普通文本卡片显示textarea+拖拽手柄
    let bodyHtml;
    if (isCp) {
      if (card.maleId && card.femaleId) {
        bodyHtml = `
          <div class="other-repo-cp-preview">
            <img src="${card.femaleCoverSrc && (card.femaleCoverSrc.startsWith('http') || card.femaleCoverSrc.startsWith('blob:')) ? card.femaleCoverSrc : getWebImageUrl(card.femaleCoverSrc)}" alt="${card.femaleName}">
            <img src="${card.maleCoverSrc && (card.maleCoverSrc.startsWith('http') || card.maleCoverSrc.startsWith('blob:')) ? card.maleCoverSrc : getWebImageUrl(card.maleCoverSrc)}" alt="${card.maleName}">
          </div>
          <button class="other-repo-card-clear" data-repo-text-cp-clear="${idx}">×</button>`;
      } else {
        bodyHtml = `<button class="other-repo-card-add" data-repo-text-cp-add="${idx}">+</button>`;
      }
    } else {
      bodyHtml = `
        <textarea class="other-repo-text-card-textarea" data-repo-text-content="${idx}" placeholder="自定义文本">${card.text || ''}</textarea>
        <div class="resize-handle"></div>`;
    }
    html += `
      <div class="other-repo-text-card">
        ${removeBtn}
        ${labelHtml}
        <div class="other-repo-text-card-body">${bodyHtml}</div>
      </div>`;
  });
  html += '</div>';
  return html;
}

// 喜爱度爱心
function renderHearts(love) {
  return [1, 2, 3, 4, 5].map(i =>
    `<span class="heart ${love >= i ? 'active' : ''}" data-love="${i}">${HEART_SVG}</span>`
  ).join("");
}

// 新增：自定义标签 textarea 自动调整高度
// 对齐 Annual：解决 input 单行无法换行、长标签被截断看不到的问题
function autoResizeCustomLabel(textarea) {
  if (!textarea) return;
  textarea.style.resize = 'none';
  textarea.style.overflow = 'hidden';
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// Rero 卡片
function renderReroCard(gameData) {
  const gameInfo = getCombinedGameList().find(g => g.id === gameData.gameId);
  if (!gameInfo) return "";
  const coverSrc = gameInfo.cover || gameInfo.image || gameInfo.img || "";
  const coverUrl = coverSrc ? getWebImageUrl(coverSrc) : "";
  const safeName = gameInfo.name || gameData.gameId;
  const gid = gameData.gameId;
  const isFolded = !!gameData.folded;
  return `
  <div class="other-rero-card ${isFolded ? 'other-folded' : ''}" data-game-id="${gid}">
    <div class="other-rero-header">
      <h3 class="other-rero-game-name">${safeName}</h3>
      <div class="other-rero-header-btns">
        <button class="other-rero-fold-btn" data-action="fold-rero">${isFolded ? '▼' : '▲'}</button>
        <button class="other-rero-delete-btn" data-action="delete">×</button>
      </div>
    </div>
    <div class="other-rero-card-content">
    <div class="other-rero-body">
      <div class="other-rero-cover-wrap">
        <img class="other-rero-cover" src="${coverUrl}" alt="${safeName}" decoding="async">
      </div>
      <div class="other-rero-fields-and-radar">
        <div class="other-rero-fields">
          <div class="other-rero-dual-grade-row">
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">时长</span>
              <input class="other-rero-field-input" type="text" data-field="duration" value="${gameData.duration || ''}" placeholder="h/小时">
            </div>
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">全通</span>
              <div class="other-rero-yn-group">
                <button class="other-yn-btn ${gameData.completed === true ? 'active' : ''}" data-completed-yn="yes">是</button>
                <button class="other-yn-btn ${gameData.completed === false ? 'active' : ''}" data-completed-yn="no">否</button>
              </div>
            </div>
          </div>
          <div class="other-rero-dual-grade-row">
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">开始日期</span>
              <input class="other-rero-field-input" type="text" data-field="startDate" value="${gameData.startDate || ''}" placeholder="YYYY.MM.DD">
            </div>
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">结束日期</span>
              <input class="other-rero-field-input" type="text" data-field="endDate" value="${gameData.endDate || ''}" placeholder="YYYY.MM.DD">
            </div>
          </div>
          <div class="other-rero-field-row">
            <span class="other-rero-field-label">甜度</span>
            <div class="other-grade-group">${renderGradeGroup('sweetness', gameData.sweetness)}</div>
          </div>
          <div class="other-rero-field-row">
            <span class="other-rero-field-label">虐度</span>
            <div class="other-grade-group">${renderGradeGroup('bitterness', gameData.bitterness)}</div>
          </div>
          <div class="other-rero-rating-left-only">
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">总评</span>
              <div class="other-grade-group">${renderGradeGroup('overall', gameData.overall)}</div>
            </div>
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">喜爱度</span>
              <div class="other-rero-hearts">${renderHearts(gameData.love)}</div>
            </div>
          </div>
        </div>
        <div class="other-rero-five-dim">
          ${renderFiveDim(gameData.fiveDim)}
        </div>
      </div>
    </div>
    <div class="other-rero-text-fields">
      <div class="other-rero-text-field">
        <label>优点</label>
        <div class="other-rero-textarea-wrap">
          <textarea data-field="pros" placeholder="优点">${gameData.pros || ''}</textarea>
          <div class="resize-handle"></div>
        </div>
      </div>
      <div class="other-rero-text-field">
        <label>缺点</label>
        <div class="other-rero-textarea-wrap">
          <textarea data-field="cons" placeholder="缺点">${gameData.cons || ''}</textarea>
          <div class="resize-handle"></div>
        </div>
      </div>
      <div class="other-rero-text-field other-rero-text-field-full">
        <label>攻略顺序</label>
        <div class="other-rero-textarea-wrap">
          <textarea data-field="strategyOrder" placeholder="攻略顺序">${gameData.strategyOrder || ''}</textarea>
          <div class="resize-handle"></div>
        </div>
      </div>
      <div class="other-rero-text-field other-rero-text-field-full">
        <label>好感顺序</label>
        <div class="other-rero-textarea-wrap">
          <textarea data-field="favorOrder" placeholder="好感顺序">${gameData.favorOrder || ''}</textarea>
          <div class="resize-handle"></div>
        </div>
      </div>
    </div>
    <div class="other-repo-cards-section">
      ${renderRepoCharCards(gameData)}
      ${renderRepoTextCards(gameData)}
    </div>
    <div class="other-rero-impression-wrap">
      <label>感想</label>
      <textarea data-field="impression" placeholder="自定义文本">${gameData.impression || ''}</textarea>
      <div class="resize-handle"></div>
    </div>
    </div>
  </div>
  `;
}

// Repo 模块全部卡片
function renderRepoModule() {
  const container = document.getElementById('other-repo-game-container');
  if (!container) return;
  if (!isGameTemplateReady()) {
    container.innerHTML = '<p class="empty-hint">游戏数据加载中，请稍候…</p>';
    return;
  }
  if (otherData.repoGames.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = otherData.repoGames.map(g => renderReroCard(g)).join("");
  // 重新绑定文本框拖拽
  requestAnimationFrame(bindTextareaResize);
  // 复用 Annual 模式：渲染后直接绑定自定义卡片标签/正文的失焦追加事件
  bindRepoCustomCardBlur();
  // 渲染后对已有内容的自定义标签执行自动增高
  container.querySelectorAll('.other-repo-card-label-edit').forEach(ta => {
    if (ta.value.trim()) autoResizeCustomLabel(ta);
  });
}

// 复用 Annual 模式 renderOtherCustomCards 的直接绑定模式：
// 每次渲染后给自定义卡片的标签/正文 textarea 直接绑定 blur，
// 失焦时若为最后一个自定义卡片且内容非空，则追加新空白卡片
function bindRepoCustomCardBlur() {
  const container = document.getElementById('other-repo-game-container');
  if (!container) return;

  function getGameData(gameId) {
    return otherData.repoGames.find(g => g.gameId === gameId);
  }

  // 1) 自定义角色卡片标签
  container.querySelectorAll('.other-repo-card-label-edit[data-repo-char-label]').forEach(ta => {
    const idx = Number(ta.dataset.repoCharLabel);
    const card = ta.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    ta.removeEventListener('blur', ta._blurHandler);
    ta._blurHandler = function () {
      const gameData = getGameData(gameId);
      if (!gameData) return;
      const fixedLen = gameData.repoCharCards?.length || 0;
      const customLen = gameData.repoCustomCharCards?.length || 0;
      if (idx >= fixedLen && idx === fixedLen + customLen - 1 && ta.value.trim() !== '') {
        gameData.repoCustomCharCards.push({ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' });
        saveOtherData();
        renderRepoModule();
      }
    };
    ta.addEventListener('blur', ta._blurHandler);
  });

  // 2) 自定义文本卡片标签
  container.querySelectorAll('.other-repo-card-label-edit[data-repo-text-label]').forEach(ta => {
    const idx = Number(ta.dataset.repoTextLabel);
    const card = ta.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    ta.removeEventListener('blur', ta._blurHandler);
    ta._blurHandler = function () {
      const gameData = getGameData(gameId);
      if (!gameData) return;
      const fixedLen = gameData.repoTextCards?.length || 0;
      const customLen = gameData.repoCustomTextCards?.length || 0;
      if (idx >= fixedLen && idx === fixedLen + customLen - 1 && ta.value.trim() !== '') {
        gameData.repoCustomTextCards.push({ label: '', type: 'text', text: '' });
        saveOtherData();
        renderRepoModule();
      }
    };
    ta.addEventListener('blur', ta._blurHandler);
  });

  // 3) 自定义文本卡片正文（CP卡片无textarea，自动跳过）
  container.querySelectorAll('.other-repo-text-card-textarea[data-repo-text-content]').forEach(ta => {
    const idx = Number(ta.dataset.repoTextContent);
    const card = ta.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    ta.removeEventListener('blur', ta._blurHandler);
    ta._blurHandler = function () {
      const gameData = getGameData(gameId);
      if (!gameData) return;
      const fixedLen = gameData.repoTextCards?.length || 0;
      const customLen = gameData.repoCustomTextCards?.length || 0;
      if (idx >= fixedLen && idx === fixedLen + customLen - 1 && ta.value.trim() !== '') {
        gameData.repoCustomTextCards.push({ label: '', type: 'text', text: '' });
        saveOtherData();
        renderRepoModule();
      }
    };
    ta.addEventListener('blur', ta._blurHandler);
  });
}

// Impression：判断角色是否有隐藏内容（隐藏角色标记/隐藏姓名/隐藏图片）
// 对齐 Annual charHasHiddenContent，用于局部开关的动态显隐
function impressionCharHasHiddenContent(char) {
  if (!char) return false;
  if (char.isHidden === true) return true;
  if (char.hiddenName) return true;
  // 开启隐藏开关后图片数量增加 → 角色有隐藏图片
  const withHide = getAvailableCharImages(char, true, false, false, false);
  const withoutHide = getAvailableCharImages(char, false, false, false, false);
  let countWith = 0, countWithout = 0;
  withHide.forEach(u => { if (Array.isArray(u.srcList)) countWith += u.srcList.length; });
  withoutHide.forEach(u => { if (Array.isArray(u.srcList)) countWithout += u.srcList.length; });
  return countWith > countWithout;
}

// Impression：判断角色是否有FD内容（FD角色标记/FD图片）
// 对齐 Annual charHasFdContent
function impressionCharHasFdContent(char) {
  if (!char) return false;
  if (char.isFD === true) return true;
  // 开启 FD 开关后图片数量增加 → 角色有 FD 图片
  const withFd = getAvailableCharImages(char, false, true, false, false);
  const withoutFd = getAvailableCharImages(char, false, false, false, false);
  let countWith = 0, countWithout = 0;
  withFd.forEach(u => { if (Array.isArray(u.srcList)) countWith += u.srcList.length; });
  withoutFd.forEach(u => { if (Array.isArray(u.srcList)) countWithout += u.srcList.length; });
  return countWith > countWithout;
}

// Impression：根据全局开关 + 局部开关获取可见角色列表（与 Annual 弹窗过滤逻辑完全一致：全局 OR 局部）
function getImpressionVisibleChars(gameInfo, localSwitches, globalSwitches) {
  const rawList = getGameMergedCharList(gameInfo);
  const local = localSwitches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  const global = globalSwitches || otherImpGlobalSwitches;
  // 与 Annual renderCharModalCharList 完全一致：全局开关 OR 局部开关
  const showSub = global.subChar || local.subChar;
  const showHide = global.hideChar || local.hideChar;
  const showFD = global.fdChar || local.fdChar;
  const showFdSub = global.fdSubChar || local.fdSubChar;
  return rawList.filter(c => {
    const isSub = c.isSub ?? false;
    const isHidden = !!c.isHidden;
    const isFD = !!c.isFD;
    const isFdSub = !!c.isFdSub;
    if (!isSub && !isHidden && !isFD && !isFdSub) return true;
    return (isSub && showSub) ||
           (isHidden && showHide) ||
           (isFD && showFD) ||
           (isFdSub && showFdSub);
  });
}

// Impression：获取角色在当前开关下的可用立绘列表（复用 main.js getAvailableCharImages，与 Annual getAnnualCharAvailImages 完全一致）
function getImpressionCharAvailImages(char, localSwitches, globalSwitches) {
  if (!char) return [];
  const local = localSwitches || { hideChar: false, fdChar: false };
  const global = globalSwitches || otherImpGlobalSwitches;
  const availUnits = getAvailableCharImages(
    char,
    global.hideChar || false,   // 全局隐藏开关
    global.fdChar || false,     // 全局FD开关
    local.hideChar || false,    // 局部隐藏开关
    local.fdChar || false       // 局部FD开关
  );
  const allSrc = [];
  availUnits.forEach(u => { if (Array.isArray(u.srcList)) allSrc.push(...u.srcList); });
  return allSrc;
}

// Impression 模块
function renderImpressionModule() {
  const container = document.getElementById('other-impression-game-container');
  if (!container) return;
  if (otherData.impressionGames.length === 0) {
    container.innerHTML = '';
    return;
  }
  // 保存当前滚动位置
  const scrollY = window.scrollY;
  // 锁定容器当前高度，防止 innerHTML 重建瞬间页面塌陷跳动
  const oldHeight = container.offsetHeight;
  if (oldHeight > 0) {
    container.style.minHeight = oldHeight + 'px';
  }
  container.innerHTML = otherData.impressionGames.map(g => renderImpressionCard(g)).join("");
  // 下一帧恢复滚动位置
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
    // 再下一帧移除高度锁定，让容器高度自适应内容
    requestAnimationFrame(() => {
      container.style.minHeight = '';
    });
  });
}
// 仅重渲染单个 Impression 游戏卡片（用于单独开关切换，避免重建整个模块导致其他卡片闪烁/跳动）
function rerenderImpressionCard(gameId) {
  const gameData = otherData.impressionGames.find(g => g.gameId === gameId);
  if (!gameData) return;
  const oldCard = document.querySelector(`.other-impression-card[data-game-id="${gameId}"]`);
  if (!oldCard) return;
  const temp = document.createElement('div');
  temp.innerHTML = renderImpressionCard(gameData);
  const newCard = temp.firstElementChild;
  if (newCard) {
    oldCard.replaceWith(newCard);
  }
}
// 渲染单个 Impression 游戏卡片（4开关 + 角色三列表格）
function renderImpressionCard(gameData) {
  const gameInfo = getCombinedGameList().find(x => x.id === gameData.gameId);
  if (!gameInfo) return "";
  const name = gameInfo.name;
  const gid = gameData.gameId;
  const isFolded = !!gameData.folded;
  const switches = gameData.charSwitches || { subChar: false, hideChar: false, fdChar: false, fdSubChar: false };
  // 4个单独开关：动态显隐（对齐 Annual renderCharModalCharList 的 localSwitchVisibility 逻辑）
  const rawCharList = getGameMergedCharList(gameInfo);
  const switchVisibility = {
    subChar:   rawCharList.some(c => c.isSub === true),
    fdSubChar: rawCharList.some(c => c.isFdSub === true),
    hideChar:  rawCharList.some(c => impressionCharHasHiddenContent(c)),
    fdChar:    rawCharList.some(c => impressionCharHasFdContent(c))
  };
  const switchHtml = IMPRESSION_SWITCH_CONFIG.map(sw => `
    <div class="switch-row" style="${switchVisibility[sw.key] ? '' : 'display:none;'}">
      <label class="switch">
        <input type="checkbox" class="other-imp-switch-input"
               data-imp-switch="${sw.key}" ${switches[sw.key] ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
      <div>
        <div class="switch-desc">${sw.label}</div>
      </div>
    </div>
  `).join("");
  // 可见角色列表（全局开关 OR 局部开关）
  let visibleChars = getImpressionVisibleChars(gameInfo, switches, otherImpGlobalSwitches);
  // 对齐 Annual：使用 sortFilterOptionList 排序，回退到 localeCompare
  const { sortFilterOptionList } = window.Core || {};
  if (typeof sortFilterOptionList === 'function') {
    const sortedNames = sortFilterOptionList(visibleChars.map(c => c.name));
    visibleChars = sortedNames.map(name => visibleChars.find(c => c.name === name)).filter(Boolean);
  } else {
    visibleChars = [...visibleChars].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  // 每个角色的三列表格（Character / Before / After）
  const charBlocksHtml = visibleChars.map(char => {
    const charId = char.id;
    const charTexts = gameData.charTexts?.[charId] || { before: '', after: '' };
    const availImages = getImpressionCharAvailImages(char, switches, otherImpGlobalSwitches);
    const imgKey = `${gid}-${charId}`;
    if (!otherImpressionCharImgIndex.has(imgKey)) otherImpressionCharImgIndex.set(imgKey, 0);
    let charImgIdx = otherImpressionCharImgIndex.get(imgKey);
    if (charImgIdx >= availImages.length) charImgIdx = 0;
    const hasMultiCharImg = availImages.length > 1;
    const charImgUrl = availImages[charImgIdx] ? getWebImageUrl(availImages[charImgIdx]) : '';
    // 对齐 Annual：角色名使用 getCharNameList，根据隐藏/FD开关显示对应名称，支持左右箭头切换
    const charShowHide = getCharShowHide(
      char,
      otherImpGlobalSwitches.hideChar || switches.hideChar,
      false,
      otherImpGlobalSwitches.fdChar || switches.fdChar,
      false
    );
    const charNameList = getCharNameList(char, charShowHide);
    const charTotalNames = charNameList.length;
    const charCanSwitchName = charTotalNames > 1;
    if (!otherImpressionCharNameIndex.has(imgKey)) otherImpressionCharNameIndex.set(imgKey, 0);
    let charNameIdx = otherImpressionCharNameIndex.get(imgKey);
    if (charNameIdx >= charTotalNames) charNameIdx = 0;
    const displayName = charNameList[charNameIdx] || char.name || '';
    const charNameMultiCls = charCanSwitchName ? 'char-name-multi' : '';
    const charNameSwitchBtns = charCanSwitchName ? `
      <button class="char-name-switch-btn char-name-switch-prev other-imp-name-prev" data-imp-name-prev="${charId}">&lt;</button>
      <button class="char-name-switch-btn char-name-switch-next other-imp-name-next" data-imp-name-next="${charId}">&gt;</button>
    ` : '';
    return `
    <div class="other-imp-char-block" data-char-id="${charId}">
      <div class="other-imp-char-table">
        <div class="other-imp-col other-imp-col-char">
          <div class="char-item">
            <div class="char-card-img-box ${hasMultiCharImg ? 'char-multi-img' : ''}">
              ${hasMultiCharImg ? `<button class="char-switch-btn char-switch-prev" data-imp-char-img-prev="${charId}">&lt;</button>` : ''}
              ${charImgUrl ? `<img src="${charImgUrl}" alt="${displayName}" decoding="async">` : '<div class="other-imp-char-placeholder"></div>'}
              ${hasMultiCharImg ? `<button class="char-switch-btn char-switch-next" data-imp-char-img-next="${charId}">&gt;</button>` : ''}
            </div>
            <div class="char-card-name ${charNameMultiCls}">
              ${charNameSwitchBtns}
              <span class="char-name-text">${displayName}</span>
            </div>
          </div>
        </div>
        <div class="other-imp-col other-imp-col-before">
          <div class="other-imp-col-label">Before</div>
          <div class="other-imp-textarea-wrap">
            <textarea class="other-imp-textarea" data-imp-text-before="${charId}" placeholder="Before">${charTexts.before || ''}</textarea>
            <div class="resize-handle"></div>
          </div>
        </div>
        <div class="other-imp-col other-imp-col-after">
          <div class="other-imp-col-label">After</div>
          <div class="other-imp-textarea-wrap">
            <textarea class="other-imp-textarea" data-imp-text-after="${charId}" placeholder="After">${charTexts.after || ''}</textarea>
            <div class="resize-handle"></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  const emptyHint = visibleChars.length === 0
    ? '<p class="other-imp-empty-hint">当前开关下无可见角色</p>'
    : '';

  return `
  <div class="other-impression-card ${isFolded ? 'other-folded' : ''}" data-game-id="${gid}">
    <div class="other-impression-header">
      <h3 class="other-impression-game-name">${name}</h3>
      <div class="other-rero-header-btns">
        <button class="other-rero-fold-btn" data-action="fold-impression">${isFolded ? '▼' : '▲'}</button>
        <button class="other-rero-delete-btn" data-action="delete-impression">×</button>
      </div>
    </div>
    <div class="other-impression-card-content">
      <!-- 4个单独开关 -->
      <div class="other-imp-switches">
        ${switchHtml}
      </div>
      <!-- 三列表格内容（开关下方） -->
      <div class="other-imp-chars-container">
        ${charBlocksHtml}
        ${emptyHint}
      </div>
    </div>
  </div>`;
}

// 全局游戏搜索弹窗
// 优先调用 annual.js 暴露的打开函数；兜底直接操作 DOM
function openOtherGameModal(target) {
  otherAddTarget = target;
  const modal = document.getElementById('annual-global-game-modal');
  if (!modal) {
    console.warn("[other] 年度游戏弹窗不存在，无法打开");
    return;
  }
  modal.classList.add('active');
  const searchInput = modal.querySelector('.annual-global-search-input');
  if (searchInput) searchInput.value = "";
  modal.querySelectorAll(".annual-filter-writer, .annual-filter-art, .annual-filter-year, .annual-filter-publisher, .annual-filter-cn")
    .forEach(sel => { sel.value = ""; });
  const combinedList = getCombinedGameList();
  const listEl = modal.querySelector('.annual-global-game-list');
  if (listEl && combinedList.length > 0) {
    renderOtherModalGameList(listEl, combinedList, "");
  }
  if (typeof fillFilterOptions === "function") {
    try { fillFilterOptions(combinedList, modal); } catch (e) { /* 忽略 */ }
  }
  // 标记弹窗当前由 Other 模式接管，供搜索 input 委托判断
  modal.dataset.otherModalActive = "1";
}

// 兜底：渲染弹窗游戏列表
function renderOtherModalGameList(listEl, gameList, keyword) {
  const kw = (keyword || "").toLowerCase();
  const filtered = gameList.filter(g =>
    !kw || (g.name && g.name.toLowerCase().includes(kw))
  );
  // 对齐 annual.js：按名称中英日排序
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  listEl.innerHTML = sorted.map((game, idx) =>
    `<div class="game-option-item" data-game-id="${game.id}">${renderGameSelectItem(game, idx)}</div>`
  ).join("");
}

// 弹窗游戏选择拦截器
function bindModalInterceptor() {
  const modal = document.getElementById('annual-global-game-modal');
  if (!modal) return;

  // capture: true，捕获阶段，先于目标元素的 onclick 执行
  modal.addEventListener('click', function (e) {
    if (!otherAddTarget) return;

    const item = e.target.closest('.game-option-item');
    if (!item) return;

    e.stopPropagation();
    e.stopImmediatePropagation();

    const gameId = item.dataset.gameId;
    if (!gameId) return;

    if (otherAddTarget === "repo") {
      if (otherData.repoGames.find(g => g.gameId === gameId)) {
        alert("该游戏已添加！");
        return;
      }
      otherData.repoGames.push(createReroGameData(gameId));
      saveOtherData();
      renderRepoModule();
    } else if (otherAddTarget === "impression") {
      if (otherData.impressionGames.find(g => g.gameId === gameId)) {
        alert("该游戏已添加！");
        return;
      }
      otherData.impressionGames.push(createImpressionGameData(gameId));
      saveOtherData();
      renderImpressionModule();
    }

    // 关闭弹窗
    modal.classList.remove('active');
    otherAddTarget = null;
  }, true);

  // 关闭按钮 / 点击遮罩：清除 Other 标记 + 解除页面滚动锁定
  const clearTarget = () => {
    otherAddTarget = null;
    const m = document.getElementById('annual-global-game-modal');
    if (m) delete m.dataset.otherModalActive;
  };
  const closeBtn = modal.querySelector('.annual-modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', clearTarget);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) clearTarget();
  });
}

// Repo 角色弹窗拦截器：捕获角色选择，写入 otherData
function bindRepoCharModalInterceptor() {
  const modal = document.getElementById('annual-global-char-modal');
  if (!modal) return;
  modal.addEventListener('click', function (e) {
    if (!otherRepoCharTarget || otherRepoCharTarget.type !== 'char') return;
    const charItem = e.target.closest('.char-item');
    if (!charItem) return;
    // 跳过切换按钮
    if (e.target.closest('.char-switch-btn, .char-name-switch-btn')) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    const gameId = charItem.dataset.gameId;
    const charId = charItem.dataset.charId;
    const charName = charItem.querySelector('.char-name-text')?.textContent || '';
    const coverSrc = charItem.querySelector('img')?.getAttribute('src') || '';
    const { gameIdx, cardIdx } = otherRepoCharTarget;
    const gameData = otherData.repoGames[gameIdx];
    if (!gameData) return;
    const fixedLen = gameData.repoCharCards?.length || 0;
    let target;
    if (cardIdx < fixedLen) {
      target = gameData.repoCharCards[cardIdx];
    } else {
      target = gameData.repoCustomCharCards?.[cardIdx - fixedLen];
    }
    if (target) {
      target.gameId = gameId;
      target.charId = charId;
      target.charName = charName;
      // coverSrc 是 getWebImageUrl 后的URL，需要还原为原始路径
      // 这里直接存URL，渲染时用 getWebImageUrl 会二次处理导致错误
      // 改为从 annual.js 的图片索引读取原始 src——但拦截器拿不到
      // 折中：存当前显示的 src（已是 web URL），渲染时不再套 getWebImageUrl
      target.coverSrc = coverSrc;
    }
    // 如果是最后一个自定义卡片且已填充，追加新空白卡片
    if (cardIdx >= fixedLen) {
      const customIdx = cardIdx - fixedLen;
      if (customIdx === (gameData.repoCustomCharCards?.length || 0) - 1) {
        gameData.repoCustomCharCards.push({ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' });
      }
    }
    saveOtherData();
    renderRepoModule();
    // 关闭弹窗
    modal.classList.remove('active');
    if (typeof window.closeAnnualGlobalCharModal === 'function') {
      // 不直接调用 close 函数（它会清理 annual 上下文），只清除标记
    }
    otherRepoCharTarget = null;
  }, true);
  // 关闭按钮/遮罩：清除标记
  const clearTarget = () => { otherRepoCharTarget = null; };
  const closeBtn = modal.querySelector('.annual-modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', clearTarget);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) clearTarget();
  });
}

// Repo CP弹窗拦截器：捕获男主选择，写入 otherData
function bindRepoCpModalInterceptor() {
  const modal = document.getElementById('annual-global-cp-modal');
  if (!modal) return;
  modal.addEventListener('click', function (e) {
    if (!otherRepoCharTarget || otherRepoCharTarget.type !== 'cp') return;
    const maleItem = e.target.closest('.annual-cp-male-item');
    if (!maleItem) return;
    if (e.target.closest('.char-switch-btn, .char-name-switch-btn')) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    const gameId = maleItem.dataset.gameId;
    const femaleId = maleItem.dataset.fid;
    const maleId = maleItem.dataset.mid;
    const maleName = maleItem.querySelector('.char-name-text')?.textContent || '';
    const maleCoverSrc = maleItem.querySelector('img')?.getAttribute('src') || '';
    // 女主信息从选中的女主卡片读取
    const femaleCard = modal.querySelector('.annual-cp-female-card.selected');
    const femaleName = femaleCard?.querySelector('.char-name-text')?.textContent || '';
    const femaleCoverSrc = femaleCard?.querySelector('img')?.getAttribute('src') || '';
    const { gameIdx, cardIdx } = otherRepoCharTarget;
    const gameData = otherData.repoGames[gameIdx];
    if (!gameData) return;
    // CP卡片现在在文本卡片组中，fixedLen取文本卡片固定数量
    const fixedLen = gameData.repoTextCards?.length || 0;
    let target;
    if (cardIdx < fixedLen) {
      target = gameData.repoTextCards[cardIdx];
    } else {
      target = gameData.repoCustomTextCards?.[cardIdx - fixedLen];
    }
    if (target) {
      target.gameId = gameId;
      target.femaleId = femaleId;
      target.maleId = maleId;
      target.femaleName = femaleName;
      target.maleName = maleName;
      target.femaleCoverSrc = femaleCoverSrc;
      target.maleCoverSrc = maleCoverSrc;
    }
    saveOtherData();
    renderRepoModule();
    modal.classList.remove('active');
    otherRepoCharTarget = null;
  }, true);
  const clearTarget = () => { otherRepoCharTarget = null; };
  const closeBtn = modal.querySelector('.annual-modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', clearTarget);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) clearTarget();
  });
}

// Rero 卡片交互
function bindReroCardEvents() {
  const repoContainer = document.getElementById('other-repo-game-container');
  if (!repoContainer) return;

  // 工具：根据 card 元素获取 gameData
  function getGameDataFromCard(card) {
    const gameId = card.dataset.gameId;
    return otherData.repoGames.find(g => g.gameId === gameId);
  }
  // 工具：获取角色卡片（固定+自定义合并）的真实引用
  function getCharCardRef(gameData, idx) {
    const fixedLen = gameData.repoCharCards?.length || 0;
    if (idx < fixedLen) return gameData.repoCharCards[idx];
    return gameData.repoCustomCharCards?.[idx - fixedLen];
  }
  // 工具：获取文本卡片引用
  function getTextCardRef(gameData, idx) {
    const fixedLen = gameData.repoTextCards?.length || 0;
    if (idx < fixedLen) return gameData.repoTextCards[idx];
    return gameData.repoCustomTextCards?.[idx - fixedLen];
  }

  // input 事件
  repoContainer.addEventListener('input', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameData = getGameDataFromCard(card);
    if (!gameData) return;

    // 普通字段
    const field = e.target.dataset.field;
    const textFields = ['duration', 'startDate', 'endDate', 'pros', 'cons', 'strategyOrder', 'favorOrder', 'impression'];
    if (field && textFields.includes(field)) {
      gameData[field] = e.target.value;
      saveOtherData();
      return;
    }
    // 五维维度名直接编辑（radar-label-input）
    const dimIdx = e.target.dataset.dimIdx;
    if (dimIdx !== undefined && e.target.classList.contains('radar-label-input')) {
      const idx = Number(dimIdx);
      if (gameData.fiveDim && gameData.fiveDim[idx]) {
        gameData.fiveDim[idx].name = e.target.value;
        saveOtherData();
      }
      return;
    }
    // 角色卡片自定义标签
    const charLabelIdx = e.target.dataset.repoCharLabel;
    if (charLabelIdx !== undefined) {
      const idx = Number(charLabelIdx);
      const target = getCharCardRef(gameData, idx);
      if (target) { target.label = e.target.value; saveOtherData(); }
      autoResizeCustomLabel(e.target);
      return;
    }
    // 文本卡片自定义标签
    const textLabelIdx = e.target.dataset.repoTextLabel;
    if (textLabelIdx !== undefined) {
      const idx = Number(textLabelIdx);
      const target = getTextCardRef(gameData, idx);
      if (target) { target.label = e.target.value; saveOtherData(); }
      autoResizeCustomLabel(e.target);
      return;
    }
    // 文本卡片内容（CP卡片无textarea，跳过）
    const textContentIdx = e.target.dataset.repoTextContent;
    if (textContentIdx !== undefined) {
      const idx = Number(textContentIdx);
      const target = getTextCardRef(gameData, idx);
      if (target && target.type !== 'cp') { target.text = e.target.value; saveOtherData(); }
      return;
    }
  });

  // blur 事件已移除：自定义卡片标签/正文的失焦追加逻辑改由 renderRepoModule 后的
  // bindRepoCustomCardBlur() 直接绑定（复用 Annual 模式），不再使用容器级捕获委托

  // click 事件
  repoContainer.addEventListener('click', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameData = getGameDataFromCard(card);
    if (!gameData) return;
    const gameIdx = otherData.repoGames.findIndex(g => g.gameId === card.dataset.gameId);

    // 游戏卡片折叠/展开
    if (e.target.closest('[data-action="fold-rero"]')) {
      card.classList.toggle('other-folded');
      const btn = e.target.closest('[data-action="fold-rero"]');
      const folded = card.classList.contains('other-folded');
      btn.textContent = folded ? '▼' : '▲';
      gameData.folded = folded;
      saveOtherData();
      return;
    }
    // 删除游戏
    if (e.target.closest('[data-action="delete"]')) {
      otherData.repoGames = otherData.repoGames.filter(g => g.gameId !== card.dataset.gameId);
      saveOtherData();
      renderRepoModule();
      return;
    }
    // SABCDE 评级
    const gradeBtn = e.target.closest('.other-grade-btn');
    if (gradeBtn) {
      const field = gradeBtn.dataset.grade;
      const value = gradeBtn.dataset.value;
      gameData[field] = gameData[field] === value ? "" : value;
      saveOtherData();
      const group = gradeBtn.closest('.other-grade-group');
      group.querySelectorAll('.other-grade-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === gameData[field]);
      });
      return;
    }
    // 全通是/否方形按钮（互斥选择，再次点击取消）
    const ynBtn = e.target.closest('.other-yn-btn');
    if (ynBtn) {
      const ynVal = ynBtn.dataset.completedYn;
      if (ynVal === 'yes') {
        gameData.completed = gameData.completed === true ? null : true;
      } else {
        gameData.completed = gameData.completed === false ? null : false;
      }
      saveOtherData();
      const ynGroup = ynBtn.closest('.other-rero-yn-group');
      ynGroup.querySelectorAll('.other-yn-btn').forEach(btn => {
        const v = btn.dataset.completedYn;
        btn.classList.toggle('active', (v === 'yes' && gameData.completed === true) || (v === 'no' && gameData.completed === false));
      });
      return;
    }
    // 爱心评分
    const heart = e.target.closest('.heart');
    if (heart) {
      const val = Number(heart.dataset.love);
      gameData.love = gameData.love === val ? 0 : val;
      saveOtherData();
      const wrap = heart.closest('.other-rero-hearts');
      wrap.querySelectorAll('.heart').forEach(h => {
        h.classList.toggle('active', Number(h.dataset.love) <= gameData.love);
      });
      return;
    }
    // 雷达图等级圆点
    const radarHit = e.target.closest('.radar-level-hit');
    if (radarHit) {
      const idx = Number(radarHit.dataset.dimIdx);
      const level = Number(radarHit.dataset.level);
      if (gameData.fiveDim && gameData.fiveDim[idx]) {
        gameData.fiveDim[idx].level = gameData.fiveDim[idx].level === level ? 0 : level;
        saveOtherData();
        const radarWrap = card.querySelector('.other-radar-wrap');
        if (radarWrap) {
          radarWrap.outerHTML = renderFiveDim(gameData.fiveDim);
        }
      }
      return;
    }
    // 角色卡片 + 按钮（directGame 作为第三参数传入，直接显示角色列表页面二，跳过游戏搜索页）
    const charAddBtn = e.target.closest('[data-repo-char-add]');
    if (charAddBtn) {
      e.stopPropagation();
      const idx = Number(charAddBtn.dataset.repoCharAdd);
      otherRepoCharTarget = { gameIdx: gameIdx, cardIdx: idx, type: 'char' };
      const gameInfo = getCombinedGameList().find(g => g.id === gameData.gameId);
      window.openAnnualGlobalCharModal(null, 'otherRepoChar', gameInfo || null);
      return;
    }
    // 文本卡片 CP + 按钮（directGame 作为第三参数传入，直接显示女主列表页面二，跳过游戏搜索页）
    const textCpAddBtn = e.target.closest('[data-repo-text-cp-add]');
    if (textCpAddBtn) {
      e.stopPropagation();
      const idx = Number(textCpAddBtn.dataset.repoTextCpAdd);
      otherRepoCharTarget = { gameIdx: gameIdx, cardIdx: idx, type: 'cp' };
      const gameInfo = getCombinedGameList().find(g => g.id === gameData.gameId);
      window.openAnnualGlobalCpModal(null, 'otherRepoCp', gameInfo || null);
      return;
    }
    // 文本卡片 CP 图片清除 ×
    const textCpClearBtn = e.target.closest('[data-repo-text-cp-clear]');
    if (textCpClearBtn) {
      const idx = Number(textCpClearBtn.dataset.repoTextCpClear);
      const target = getTextCardRef(gameData, idx);
      if (target) {
        Object.assign(target, { gameId: '', femaleId: '', maleId: '', femaleName: '', maleName: '', femaleCoverSrc: '', maleCoverSrc: '' });
      }
      saveOtherData();
      renderRepoModule();
      return;
    }
    // 角色卡片 × 按钮（复用Annual模块七逻辑：有图清除图片，无图自定义删除整卡）
    const charRemoveBtn = e.target.closest('[data-repo-char-remove]');
    if (charRemoveBtn) {
      const idx = Number(charRemoveBtn.dataset.repoCharRemove);
      const target = getCharCardRef(gameData, idx);
      if (!target) return;
      if (target.charId) {
        // 有图：清除角色图片
        Object.assign(target, { gameId: '', charId: '', charName: '', coverSrc: '' });
      } else {
        // 无图（自定义卡片）：删除整卡
        const fixedLen = gameData.repoCharCards?.length || 0;
        const customIdx = idx - fixedLen;
        if (customIdx >= 0) {
          gameData.repoCustomCharCards.splice(customIdx, 1);
          // 复用 Annual 模块五逻辑：确保至少保留一个完全空白的可操作自定义卡片
          const hasEmpty = gameData.repoCustomCharCards.some(c => !c.label.trim() && !c.charId);
          if (!hasEmpty) {
            gameData.repoCustomCharCards.push({ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' });
          }
        }
      }
      saveOtherData();
      renderRepoModule();
      return;
    }
    // 自定义文本卡片整卡删除 ×
    const textRemoveBtn = e.target.closest('[data-repo-text-remove]');
    if (textRemoveBtn) {
      const idx = Number(textRemoveBtn.dataset.repoTextRemove);
      const fixedLen = gameData.repoTextCards?.length || 0;
      const customIdx = idx - fixedLen;
      if (customIdx >= 0) {
        gameData.repoCustomTextCards.splice(customIdx, 1);
        // 复用 Annual 模块五逻辑：确保至少保留一个完全空白的可操作自定义卡片
        const hasEmpty = gameData.repoCustomTextCards.some(c => !c.label.trim() && !(c.text && c.text.trim()));
        if (!hasEmpty) {
          gameData.repoCustomTextCards.push({ label: '', type: 'text', text: '' });
        }
        saveOtherData();
        renderRepoModule();
      }
      return;
    }
  });
}

// Impression 模块交互
function bindImpressionEvents() {
  const container = document.getElementById('other-impression-game-container');
  if (!container) return;

  // input 事件：Before / After 文本框（容器委托，避免重建后失焦）
  container.addEventListener('input', function (e) {
    const card = e.target.closest('.other-impression-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    const gameData = otherData.impressionGames.find(g => g.gameId === gameId);
    if (!gameData) return;
    if (!gameData.charTexts) gameData.charTexts = {};

    const beforeCharId = e.target.dataset.impTextBefore;
    if (beforeCharId !== undefined) {
      if (!gameData.charTexts[beforeCharId]) gameData.charTexts[beforeCharId] = { before: '', after: '' };
      gameData.charTexts[beforeCharId].before = e.target.value;
      saveOtherData();
      return;
    }
    const afterCharId = e.target.dataset.impTextAfter;
    if (afterCharId !== undefined) {
      if (!gameData.charTexts[afterCharId]) gameData.charTexts[afterCharId] = { before: '', after: '' };
      gameData.charTexts[afterCharId].after = e.target.value;
      saveOtherData();
      return;
    }
  });

  // click 事件
  container.addEventListener('click', function (e) {
    const card = e.target.closest('.other-impression-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    const gameData = otherData.impressionGames.find(g => g.gameId === gameId);
    if (!gameData) return;

    // 折叠/展开
    if (e.target.closest('[data-action="fold-impression"]')) {
      card.classList.toggle('other-folded');
      const btn = e.target.closest('[data-action="fold-impression"]');
      const folded = card.classList.contains('other-folded');
      btn.textContent = folded ? '▼' : '▲';
      gameData.folded = folded;
      saveOtherData();
      return;
    }
    // 删除游戏
    if (e.target.closest('[data-action="delete-impression"]')) {
      otherData.impressionGames = otherData.impressionGames.filter(g => g.gameId !== gameId);
      saveOtherData();
      renderImpressionModule();
      return;
    }
    // 4个单独开关切换（仅重渲染当前卡片，避免整个模块重建导致跳动）
    const switchInput = e.target.closest('.other-imp-switch-input');
    if (switchInput) {
      const key = switchInput.dataset.impSwitch;
      if (key && gameData.charSwitches) {
        gameData.charSwitches[key] = switchInput.checked;
        saveOtherData();
        rerenderImpressionCard(gameId);
      }
      return;
    }
    // 角色立绘：上一张（对齐 Annual，使用 switchCharImageWithLoading 带 loading 效果）
    const charPrevBtn = e.target.closest('[data-imp-char-img-prev]');
    if (charPrevBtn) {
      e.stopPropagation();
      const charId = charPrevBtn.dataset.impCharImgPrev;
      const gameInfo = getCombinedGameList().find(x => x.id === gameId);
      const char = getGameMergedCharList(gameInfo).find(c => c.id === charId);
      if (!char) return;
      const availImages = getImpressionCharAvailImages(char, gameData.charSwitches, otherImpGlobalSwitches);
      if (availImages.length === 0) return;
      const imgKey = `${gameId}-${charId}`;
      let idx = otherImpressionCharImgIndex.get(imgKey) ?? 0;
      idx = (idx - 1 + availImages.length) % availImages.length;
      otherImpressionCharImgIndex.set(imgKey, idx);
      const block = card.querySelector(`.other-imp-char-block[data-char-id="${charId}"]`);
      if (block) {
        const imgEl = block.querySelector('img');
        const imgBox = imgEl ? imgEl.closest('.char-card-img-box') : null;
        if (imgBox) {
          switchCharImageWithLoading(imgBox, getWebImageUrl(availImages[idx] || ""));
        } else if (imgEl) {
          imgEl.src = getWebImageUrl(availImages[idx] || "");
        }
      }
      return;
    }
    // 角色立绘：下一张（对齐 Annual，使用 switchCharImageWithLoading 带 loading 效果）
    const charNextBtn = e.target.closest('[data-imp-char-img-next]');
    if (charNextBtn) {
      e.stopPropagation();
      const charId = charNextBtn.dataset.impCharImgNext;
      const gameInfo = getCombinedGameList().find(x => x.id === gameId);
      const char = getGameMergedCharList(gameInfo).find(c => c.id === charId);
      if (!char) return;
      const availImages = getImpressionCharAvailImages(char, gameData.charSwitches, otherImpGlobalSwitches);
      if (availImages.length === 0) return;
      const imgKey = `${gameId}-${charId}`;
      let idx = otherImpressionCharImgIndex.get(imgKey) ?? 0;
      idx = (idx + 1) % availImages.length;
      otherImpressionCharImgIndex.set(imgKey, idx);
      const block = card.querySelector(`.other-imp-char-block[data-char-id="${charId}"]`);
      if (block) {
        const imgEl = block.querySelector('img');
        const imgBox = imgEl ? imgEl.closest('.char-card-img-box') : null;
        if (imgBox) {
          switchCharImageWithLoading(imgBox, getWebImageUrl(availImages[idx] || ""));
        } else if (imgEl) {
          imgEl.src = getWebImageUrl(availImages[idx] || "");
        }
      }
      return;
    }
    // 角色名：上一个（只更新文字，不重建，避免文本框失焦）
    const namePrevBtn = e.target.closest('[data-imp-name-prev]');
    if (namePrevBtn) {
      e.stopPropagation();
      const charId = namePrevBtn.dataset.impNamePrev;
      const gameInfo = getCombinedGameList().find(x => x.id === gameId);
      const char = getGameMergedCharList(gameInfo).find(c => c.id === charId);
      if (!char) return;
      const charShowHide = getCharShowHide(
        char,
        otherImpGlobalSwitches.hideChar || gameData.charSwitches.hideChar,
        false,
        otherImpGlobalSwitches.fdChar || gameData.charSwitches.fdChar,
        false
      );
      const charNameList = getCharNameList(char, charShowHide);
      const totalNames = charNameList.length;
      if (totalNames <= 1) return;
      const imgKey = `${gameId}-${charId}`;
      let idx = otherImpressionCharNameIndex.get(imgKey) ?? 0;
      idx = (idx - 1 + totalNames) % totalNames;
      otherImpressionCharNameIndex.set(imgKey, idx);
      const block = card.querySelector(`.other-imp-char-block[data-char-id="${charId}"]`);
      if (block) {
        const nameTextEl = block.querySelector('.char-card-name .char-name-text');
        if (nameTextEl) nameTextEl.textContent = charNameList[idx] || char.name || '';
      }
      return;
    }
    // 角色名：下一个（只更新文字，不重建）
    const nameNextBtn = e.target.closest('[data-imp-name-next]');
    if (nameNextBtn) {
      e.stopPropagation();
      const charId = nameNextBtn.dataset.impNameNext;
      const gameInfo = getCombinedGameList().find(x => x.id === gameId);
      const char = getGameMergedCharList(gameInfo).find(c => c.id === charId);
      if (!char) return;
      const charShowHide = getCharShowHide(
        char,
        otherImpGlobalSwitches.hideChar || gameData.charSwitches.hideChar,
        false,
        otherImpGlobalSwitches.fdChar || gameData.charSwitches.fdChar,
        false
      );
      const charNameList = getCharNameList(char, charShowHide);
      const totalNames = charNameList.length;
      if (totalNames <= 1) return;
      const imgKey = `${gameId}-${charId}`;
      let idx = otherImpressionCharNameIndex.get(imgKey) ?? 0;
      idx = (idx + 1) % totalNames;
      otherImpressionCharNameIndex.set(imgKey, idx);
      const block = card.querySelector(`.other-imp-char-block[data-char-id="${charId}"]`);
      if (block) {
        const nameTextEl = block.querySelector('.char-card-name .char-name-text');
        if (nameTextEl) nameTextEl.textContent = charNameList[idx] || char.name || '';
      }
      return;
    }
  });
}

// Impression 模块：全局角色显示开关绑定（与 Annual 弹窗全局开关逻辑一致，切换后重新渲染所有游戏卡片）
function bindImpressionGlobalSwitches() {
  const switchConfig = [
    { id: 'other-imp-global-sub-char',   key: 'subChar' },
    { id: 'other-imp-global-hide-char',  key: 'hideChar' },
    { id: 'other-imp-global-fd-char',    key: 'fdChar' },
    { id: 'other-imp-global-fd-sub-char', key: 'fdSubChar' }
  ];
  switchConfig.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;
    // 初始化 DOM 勾选状态（从持久化数据恢复）
    el.checked = !!otherImpGlobalSwitches[item.key];
    el.addEventListener('change', () => {
      otherImpGlobalSwitches[item.key] = el.checked;
      // 持久化到 otherData
      if (otherData) {
        otherData.impressionGlobalSwitches = { ...otherImpGlobalSwitches };
        saveOtherData();
      }
      // 重新渲染所有 Impression 游戏卡片（可见角色列表变化）
      renderImpressionModule();
    });
  });
}

// 模块折叠按钮
function bindFoldButtons() {
  document.querySelectorAll('.mode-wrap[data-mode="other"] .other-card-fold-btn').forEach(btn => {
    btn.onclick = function () {
      const card = btn.closest('.big-card');
      if (!card) return;
      card.classList.toggle('other-folded');
      btn.textContent = card.classList.contains('other-folded') ? '▼' : '▲';
    };
  });
}

// 悬浮滚动按钮：以游戏卡片为单位滚动（跨模块连续列表）
function bindOtherScrollButtons() {
  const topBtn = document.getElementById('other-back-to-top-btn');
  const bottomBtn = document.getElementById('other-scroll-to-bottom-btn');
  if (!topBtn || !bottomBtn) return;
  const TOLERANCE = 30;

  function getModules() {
    const wrap = document.querySelector('.mode-wrap[data-mode="other"]');
    return wrap ? Array.from(wrap.querySelectorAll('.big-card')) : [];
  }

  // 获取所有游戏卡片（跨模块，按 DOM 顺序），每项含元素、所属模块下标、顶部、底部
  function getAllGameCards() {
    const modules = getModules();
    const cards = [];
    modules.forEach((mod, mIdx) => {
      const gameCards = mod.querySelectorAll('.other-rero-card, .other-impression-card');
      gameCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        cards.push({
          el: card,
          moduleIdx: mIdx,
          top: rect.top + window.scrollY,
          bottom: rect.bottom + window.scrollY
        });
      });
    });
    return cards;
  }

  // 根据视口垂直中心定位当前游戏卡片
  function getCurrentCardInfo(cards) {
    if (cards.length === 0) return { idx: -1, inside: false, isAbove: false };
    const viewCenter = window.scrollY + window.innerHeight / 2;
    // 优先：视口中心落在某个游戏卡片范围内
    for (let i = 0; i < cards.length; i++) {
      if (viewCenter >= cards[i].top && viewCenter <= cards[i].bottom) {
        return { idx: i, inside: true, isAbove: false };
      }
    }
    // 兜底：视口中心不在任何卡片范围内，找距离最近的卡片并记录在其上方还是下方
    let closest = -1;
    let minDist = Infinity;
    let closestIsAbove = false;
    for (let i = 0; i < cards.length; i++) {
      if (viewCenter < cards[i].top) {
        const dist = cards[i].top - viewCenter;
        if (dist < minDist) { minDist = dist; closest = i; closestIsAbove = true; }
      } else if (viewCenter > cards[i].bottom) {
        const dist = viewCenter - cards[i].bottom;
        if (dist < minDist) { minDist = dist; closest = i; closestIsAbove = false; }
      }
    }
    if (closest >= 0) return { idx: closest, inside: false, isAbove: closestIsAbove };
    return { idx: -1, inside: false, isAbove: false };
  }

  // ▲按钮
  topBtn.addEventListener('click', function () {
    const modules = getModules();
    if (modules.length === 0) return;
    const cards = getAllGameCards();
    // 无任何游戏卡片时回退到页面顶部
    if (cards.length === 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const info = getCurrentCardInfo(cards);
    if (info.idx < 0) return;
    const cur = cards[info.idx];

    if (info.inside) {
      if (window.scrollY > cur.top + TOLERANCE) {
        // 在卡片中间：滚动到该游戏卡片上边框
        cur.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // 已在卡片上边框：滚动到上一个游戏卡片的上边框
        if (info.idx > 0) {
          cards[info.idx - 1].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // 无上一个游戏卡片：滚动到上一个模块上边框；无则页面顶部
          if (cur.moduleIdx > 0) {
            modules[cur.moduleIdx - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }
    } else if (info.isAbove) {
      // 视口中心在最近卡片上方：滚动到该卡片上边框
      cur.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // 视口中心在最近卡片下方：滚动到该卡片上边框
      cur.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // ▼按钮
  bottomBtn.addEventListener('click', function () {
    const modules = getModules();
    if (modules.length === 0) return;
    const cards = getAllGameCards();
    // 无任何游戏卡片时回退到页面底部
    if (cards.length === 0) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }
    const info = getCurrentCardInfo(cards);
    if (info.idx < 0) return;
    const cur = cards[info.idx];
    const viewBottom = window.scrollY + window.innerHeight;

    if (info.inside) {
      if (viewBottom < cur.bottom - TOLERANCE) {
        // 在卡片中间：滚动到该游戏卡片下边框
        cur.el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        // 已在卡片下边框：滚动到下一个游戏卡片的下边框
        if (info.idx < cards.length - 1) {
          cards[info.idx + 1].el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          // 无下一个游戏卡片：滚动到下一个模块下边框；无则不动作
          if (cur.moduleIdx < modules.length - 1) {
            modules[cur.moduleIdx + 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }
    } else if (info.isAbove) {
      // 视口中心在最近卡片上方：滚动到该卡片下边框
      cur.el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
      // 视口中心在最近卡片下方：滚动到下一个游戏卡片下边框，或下一个模块下边框
      if (info.idx < cards.length - 1) {
        cards[info.idx + 1].el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (cur.moduleIdx < modules.length - 1) {
        modules[cur.moduleIdx + 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  });
}

// 滑块进度条更新（与 Annual 模式完全同款逻辑；CSS 进度变量因选择器作用域不同使用 --other-slider-progress）
function updateSliderProgress(sliderEl) {
  const min = Number(sliderEl.min);
  const max = Number(sliderEl.max);
  const val = Number(sliderEl.value);
  const percent = ((val - min) / (max - min)) * 100;
  const rowWrap = sliderEl.closest('.font-size-set-row');
  if (rowWrap) {
    rowWrap.style.setProperty('--other-slider-progress', `${percent}%`);
  }
}

// 新增：将需要影响 mode-wrap 外部元素（整个页面背景、site-title 标题）的颜色同步到 .wrap
// 因 .site-title 和 .mode-switch-wrap 在 .mode-wrap 外面，继承不到 mode-wrap 上的变量
function applyOtherPageColors() {
  const wrapEl = document.querySelector('.wrap');
  if (!wrapEl) return;
  wrapEl.style.backgroundColor = otherConfig.bg;
  wrapEl.style.setProperty("--other-export-title", otherConfig.title);
  // 同步设置 body 背景色，让视口两侧也跟着变色
  document.body.style.backgroundColor = otherConfig.bg;
}

// 新增：Other 模式导出预计耗时计算（对齐 Annual calcAnnualEstimateSec 逻辑）
function calcOtherEstimateSec() {
  const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);
  let gameCount = 0;
  let imgCount = 0;
  const repoGames = otherData?.repoGames || [];
  gameCount += repoGames.length;
  repoGames.forEach(g => {
    imgCount += 1; // 游戏封面
    (g.repoCharCards || []).forEach(c => { if (c.charId) imgCount++; });
    (g.repoCustomCharCards || []).forEach(c => { if (c.charId) imgCount++; });
    (g.repoTextCards || []).forEach(c => {
      if (c.type === 'cp' && c.femaleId && c.maleId) imgCount += 2;
    });
    (g.repoCustomTextCards || []).forEach(c => {
      if (c.type === 'cp' && c.femaleId && c.maleId) imgCount += 2;
    });
  });
  const impGames = otherData?.impressionGames || [];
  gameCount += impGames.length;
  impGames.forEach(g => {
    const gameInfo = getCombinedGameList().find(x => x.id === g.gameId);
    const visibleChars = getImpressionVisibleChars(gameInfo, g.charSwitches, otherImpGlobalSwitches);
    visibleChars.forEach(c => {
      const availImages = getImpressionCharAvailImages(c, g.charSwitches, otherImpGlobalSwitches);
      imgCount += Math.max(1, availImages.length);
    });
  });
  let gameCost, imgCost, networkBufferSec, roundCanvasOverheadSec;
  if (IS_IOS_WEBKIT) {
    gameCost = 1.2; imgCost = 0.85;
    networkBufferSec = 4.8;
    roundCanvasOverheadSec = Math.min(8, imgCount * 0.030);
  } else if (isAndroid) {
    gameCost = 0.6; imgCost = 0.40;
    networkBufferSec = 2.6;
    roundCanvasOverheadSec = Math.min(4, imgCount * 0.012);
  } else {
    gameCost = 0.4; imgCost = 0.25;
    networkBufferSec = 1.8;
    roundCanvasOverheadSec = Math.min(2.5, imgCount * 0.012);
  }
  const baseEstimate = gameCount * gameCost + imgCount * imgCost;
  const fallbackProbability = 0.30;
  const fallbackPerImageSec = 0.6;
  const fallbackEstimate = imgCount * fallbackProbability * fallbackPerImageSec;
  let sec = Math.ceil(baseEstimate + networkBufferSec + roundCanvasOverheadSec + fallbackEstimate);
  sec = IS_IOS_WEBKIT ? Math.max(2, Math.min(45, sec)) : Math.max(1, Math.min(35, sec));
  return sec;
}

// 新增：在预览弹窗中显示 loading + 预计时间 + 进度，返回进度监听器
function showOtherPreviewLoading(scrollWrap) {
  const estimateSec = calcOtherEstimateSec();
  scrollWrap.innerHTML = `
    <div class="preview-inner-loading">
      <div class="loading-spinner"></div>
      <p>正在生成预览，请稍候…<br>预计耗时：${estimateSec}s</p>
      <p class="render-progress-text" style="margin-top:8px;font-size:14px;">进度：0%</p>
    </div>
  `;
  const progressHandler = function(e) {
    const p = e.detail.percent.toFixed(0);
    const progressDom = scrollWrap.querySelector('.render-progress-text');
    if (progressDom) progressDom.textContent = `进度：${p}%`;
  };
  window.addEventListener('other-canvas-progress', progressHandler);
  return progressHandler;
}

// 新增：渲染单张预览图 + 上一张/下一张切换控件（对齐 Annual renderAnnualPreviewPage）
function renderOtherPreviewPage(pageIndex) {
  _otherCurrentPage = pageIndex;
  const modal = document.getElementById("export-preview-modal");
  const scrollWrap = modal.querySelector(".preview-scroll-wrap");
  const totalPage = _otherPreviewResults.length;
  const currentUrl = _otherPreviewUrls[pageIndex];
  let paginationHtml = "";
  if (totalPage > 1) {
    paginationHtml = `
    <div class="preview-pagination-bar" style="margin-top:12px;display:flex;gap:12px;align-items:center;justify-content:center;">
      <button class="preview-prev-page" ${pageIndex <= 0 ? 'disabled' : ''}>上一张</button>
      <span>第 ${pageIndex + 1} / ${totalPage} 张</span>
      <button class="preview-next-page" ${pageIndex >= totalPage - 1 ? 'disabled' : ''}>下一张</button>
    </div>`;
  }
  scrollWrap.innerHTML = `
    <img class="preview-img-item" src="${currentUrl}" alt="Other 导出预览">
    ${paginationHtml}
  `;
  const prevBtn = scrollWrap.querySelector(".preview-prev-page");
  const nextBtn = scrollWrap.querySelector(".preview-next-page");
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (pageIndex > 0) renderOtherPreviewPage(pageIndex - 1);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (pageIndex < totalPage - 1) renderOtherPreviewPage(pageIndex + 1);
    };
  }
}

// 新增：Other 模式预览弹窗管理（对齐 Annual showAnnualPreviewModal）
function showOtherPreviewModal(results) {
  _otherPreviewResults = results;
  _otherCurrentPage = 0;
  const downloadBtn = document.getElementById("preview-download-btn");
  // 清理旧 URL
  _otherPreviewUrls.forEach(u => URL.revokeObjectURL(u));
  _otherPreviewUrls = results.map(r => URL.createObjectURL(r.blob));
  // 渲染第 1 张
  renderOtherPreviewPage(0);
  downloadBtn.disabled = false;
  // 用 onclick 赋值覆盖下载按钮，防止 Annual 的下载监听器同时触发
  downloadBtn.onclick = async () => {
    for (let i = 0; i < _otherPreviewResults.length; i++) {
      const r = _otherPreviewResults[i];
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement("a");
      const safeName = (r.gameName || 'game').replace(/[\\/:*?"<>|]/g, '_');
      a.download = `Other_${r.moduleType}_${safeName}_${i + 1}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (i < _otherPreviewResults.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };
  // 绑定弹窗按钮（只绑定一次）
  if (!_otherPreviewBound) {
    bindOtherPreviewButtons();
    _otherPreviewBound = true;
  }
}

// 新增：绑定 Other 模式预览弹窗按钮（对齐 Annual bindAnnualPreviewButtons）
// 关闭/遮罩用 addEventListener（与 Annual 共存，各清各的 URL）；
// 重新生成用 onclick 赋值（覆盖 Annual 的）
function bindOtherPreviewButtons() {
  const closeBtn = document.getElementById("preview-close-btn");
  const regenBtn = document.getElementById("preview-regen-btn");
  const modal = document.getElementById("export-preview-modal");
  // 关闭
  closeBtn.addEventListener("click", () => {
    modal.classList.remove("active");
    document.body.classList.remove("modal-lock");
    _otherPreviewUrls.forEach(u => URL.revokeObjectURL(u));
    _otherPreviewUrls = [];
    _otherPreviewResults = [];
  });
  // 遮罩点击关闭
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeBtn.click();
  });
  // 重新生成（onclick 赋值，覆盖 Annual 的）
  regenBtn.onclick = async () => {
    if (_otherIsRendering) return;
    const scrollWrap = modal.querySelector(".preview-scroll-wrap");
    const downloadBtn = document.getElementById("preview-download-btn");
    downloadBtn.disabled = true;
    const progressHandler = showOtherPreviewLoading(scrollWrap);
    let unlockTimer = null;
    _otherIsRendering = true;
    unlockTimer = setTimeout(() => {
      _otherIsRendering = false;
      console.warn("[other]重新生成超时，强制解除渲染锁");
    }, 15000);
    try {
      const gameList = getCombinedGameList();
      const dpr = otherConfig.normalQuality ? 1 : 2;
      const results = await window.renderAllOtherGames(720, otherData, gameList, otherConfig, dpr);
      if (!results || results.length === 0) {
        alert("没有可导出的内容。");
        return;
      }
      showOtherPreviewModal(results);
    } catch (err) {
      console.error("Other 重新生成失败", err);
      alert("重新生成失败：" + (err?.message || "未知错误"));
    } finally {
      if (typeof progressHandler !== 'undefined') {
        window.removeEventListener('other-canvas-progress', progressHandler);
      }
      if (unlockTimer) clearTimeout(unlockTimer);
      _otherIsRendering = false;
    }
  };
}

// 导出配置
function bindExportConfig() {
  const wrap = document.querySelector('.mode-wrap[data-mode="other"]');
  const colorMap = [
    { id: 'other-color-bg',              key: 'bg',              cssVar: '--other-export-bg' },
    { id: 'other-color-title',           key: 'title',           cssVar: '--other-export-title' },
    { id: 'other-color-char-name',       key: 'charNameColor',   cssVar: '--other-char-name-color' },
    { id: 'other-color-default-text',    key: 'defaultTextColor',cssVar: '--other-default-text-color' },
    { id: 'other-color-input-text',      key: 'inputTextColor',  cssVar: '--other-input-text-color' },
    { id: 'other-color-active-fill',     key: 'activeFillColor', cssVar: '--other-active-fill-color' },
    { id: 'other-color-heart',           key: 'heartColor',      cssVar: '--other-heart-color' },
    { id: 'other-color-radar',           key: 'radarColor',      cssVar: '--other-radar-color' },
    { id: 'other-color-card-bg',         key: 'cardBg',          cssVar: '--other-card-bg' },
    { id: 'other-color-label',           key: 'labelColor',      cssVar: '--other-label-color' },
    { id: 'other-color-customtext',      key: 'customtext',      cssVar: '--other-export-customtext' },
    { id: 'other-color-customborder',    key: 'customborder',    cssVar: '--other-export-customborder' },
    { id: 'other-color-reporter',        key: 'reporterColor',   cssVar: '--other-reporter-color' },
    { id: 'other-color-image-border',    key: 'imageBorderColor',cssVar: '--other-image-border-color' },
    { id: 'other-color-border',          key: 'border',          cssVar: '--other-export-border' }
  ];
  colorMap.forEach(item => {
    const dom = document.getElementById(item.id);
    if (!dom) return;
    dom.value = otherConfig[item.key] || otherExportDefault[item.key];
    if (wrap) wrap.style.setProperty(item.cssVar, dom.value);
    dom.oninput = () => {
      otherConfig[item.key] = dom.value;
      if (wrap) wrap.style.setProperty(item.cssVar, dom.value);
      // 标题色同时控制小标题（模块 h2）
      if (item.key === 'title' && wrap) {
        wrap.style.setProperty('--other-export-subtitle', dom.value);
      }
      // 背景色/标题色变化时同步到 .wrap 和 body
      if (item.key === 'bg' || item.key === 'title') {
        applyOtherPageColors();
      }
      saveOtherConfig();
    };
  });
  // 初始化时同步页面背景和标题色
  applyOtherPageColors();
  // 字号滑块：填写内容字号（只影响导出图片，不影响网页显示）
  const sliderInputFont = document.getElementById('other-slider-input-font');
  const inputFontValueDisplay = document.getElementById('other-input-font-value');
  if (sliderInputFont && inputFontValueDisplay) {
    sliderInputFont.value = otherConfig.inputFontSize;
    inputFontValueDisplay.textContent = `${otherConfig.inputFontSize}px`;
    updateSliderProgress(sliderInputFont);
    sliderInputFont.oninput = () => {
      const val = Number(sliderInputFont.value);
      otherConfig.inputFontSize = val;
      inputFontValueDisplay.textContent = `${val}px`;
      updateSliderProgress(sliderInputFont);
      saveOtherConfig();
    };
  }
  // 字号滑块：自定义文本字号（只影响导出图片，不影响网页显示）
  const sliderCustomTextFont = document.getElementById('other-slider-custom-text-font');
  const customTextFontValueDisplay = document.getElementById('other-custom-text-font-value');
  if (sliderCustomTextFont && customTextFontValueDisplay) {
    sliderCustomTextFont.value = otherConfig.customTextFontSize;
    customTextFontValueDisplay.textContent = `${otherConfig.customTextFontSize}px`;
    updateSliderProgress(sliderCustomTextFont);
    sliderCustomTextFont.oninput = () => {
      const val = Number(sliderCustomTextFont.value);
      otherConfig.customTextFontSize = val;
      customTextFontValueDisplay.textContent = `${val}px`;
      updateSliderProgress(sliderCustomTextFont);
      saveOtherConfig();
    };
  }
  // 填表人姓名
  const reporterNameInput = document.getElementById('other-reporter-name');
  if (reporterNameInput) {
    reporterNameInput.value = otherConfig.reporterName || '';
    reporterNameInput.oninput = () => {
      otherConfig.reporterName = reporterNameInput.value;
      saveOtherConfig();
    };
  }
  // 导出简评表开关
  const exportBrief = document.getElementById('other-export-brief');
  if (exportBrief) {
    exportBrief.checked = !!otherConfig.exportBrief;
    exportBrief.onchange = () => {
      otherConfig.exportBrief = exportBrief.checked;
      saveOtherConfig();
    };
  }
  // 普通画质开关
  const normalQuality = document.getElementById('other-export-normal-quality');
  if (normalQuality) {
    normalQuality.checked = !!otherConfig.normalQuality;
    normalQuality.onchange = () => {
      otherConfig.normalQuality = normalQuality.checked;
      saveOtherConfig();
    };
  }
  // 恢复默认
  const resetBtn = document.getElementById('other-btn-reset-color');
  if (resetBtn) {
    resetBtn.onclick = () => {
      otherConfig = { ...otherExportDefault };
      saveOtherConfig();
      colorMap.forEach(item => {
        const dom = document.getElementById(item.id);
        if (dom) {
          dom.value = otherConfig[item.key];
          if (wrap) wrap.style.setProperty(item.cssVar, dom.value);
        }
      });
      if (wrap) wrap.style.setProperty('--other-export-subtitle', otherConfig.title);
      if (reporterNameInput) reporterNameInput.value = '';
      if (exportBrief) exportBrief.checked = true;
      if (normalQuality) normalQuality.checked = false;
      // 重置字号滑块到默认值（只重置配置和显示，不操作网页CSS变量）
      if (sliderInputFont && inputFontValueDisplay) {
        sliderInputFont.value = otherExportDefault.inputFontSize;
        inputFontValueDisplay.textContent = `${otherExportDefault.inputFontSize}px`;
        updateSliderProgress(sliderInputFont);
      }
      if (sliderCustomTextFont && customTextFontValueDisplay) {
        sliderCustomTextFont.value = otherExportDefault.customTextFontSize;
        customTextFontValueDisplay.textContent = `${otherExportDefault.customTextFontSize}px`;
        updateSliderProgress(sliderCustomTextFont);
      }
      // 重置后同步 .wrap 和 body 的背景色/标题色，确保大卡片外区域也恢复默认
      applyOtherPageColors();
    };
  }
  // 导出按钮（复用 Annual 预览弹窗模式：渲染锁 + loading + 预览 + 下载）
  const exportBtn = document.getElementById('other-btn-export-image');
  if (exportBtn) {
    exportBtn.onclick = async () => {
      if (exportBtn.disabled || _otherIsRendering) return;
      if (!otherData || (!otherData.repoGames?.length && !otherData.impressionGames?.length)) {
        alert("暂无数据可导出");
        return;
      }
      if (typeof window.renderAllOtherGames !== 'function') {
        alert("导出模块未加载，请检查 other-canvas-render.js 是否引入");
        return;
      }
      let unlockTimer = null;
      _otherIsRendering = true;
      unlockTimer = setTimeout(() => {
        _otherIsRendering = false;
        console.warn("[other]渲染超时，强制解除渲染锁");
      }, 15000);
      const originalText = exportBtn.textContent;
      exportBtn.disabled = true;
      exportBtn.textContent = "生成中…";
      // 打开预览弹窗，先显示 loading + 预计时间 + 进度
      const modal = document.getElementById("export-preview-modal");
      const scrollWrap = modal.querySelector(".preview-scroll-wrap");
      const downloadBtn = document.getElementById("preview-download-btn");
      modal.classList.add("active");
      document.body.classList.add("modal-lock");
      downloadBtn.disabled = true;
      const progressHandler = showOtherPreviewLoading(scrollWrap);
      try {
        const gameList = getCombinedGameList();
        const dpr = otherConfig.normalQuality ? 1 : 2;
        const results = await window.renderAllOtherGames(720, otherData, gameList, otherConfig, dpr);
        if (!results || results.length === 0) {
          alert("没有可导出的内容，请先在各模块中添加数据。");
          modal.classList.remove("active");
          document.body.classList.remove("modal-lock");
          return;
        }
        showOtherPreviewModal(results);
      } catch (err) {
        console.error("Other 导出失败", err);
        alert("导出失败：" + (err?.message || "未知错误") + "\n请打开控制台查看详情。");
        modal.classList.remove("active");
        document.body.classList.remove("modal-lock");
      } finally {
        if (typeof progressHandler !== 'undefined') {
          window.removeEventListener('other-canvas-progress', progressHandler);
        }
        if (unlockTimer) clearTimeout(unlockTimer);
        _otherIsRendering = false;
        exportBtn.disabled = false;
        exportBtn.textContent = originalText;
      }
    };
  }
}

// 文本框拖拽手柄（自定义文本框）
function bindTextareaResize() {
  document.querySelectorAll('.mode-wrap[data-mode="other"] .other-rero-impression-wrap .resize-handle, .mode-wrap[data-mode="other"] .other-rero-textarea-wrap .resize-handle, .mode-wrap[data-mode="other"] .other-repo-text-card-body .resize-handle, .mode-wrap[data-mode="other"] .other-imp-textarea-wrap .resize-handle').forEach(handle => {
    if (handle.dataset.resizeBinded === "1") return;
    handle.dataset.resizeBinded = "1";
    const wrap = handle.closest('.other-rero-impression-wrap, .other-rero-textarea-wrap, .other-repo-text-card-body, .other-imp-textarea-wrap');
    if (!wrap) return;
    const textarea = wrap.querySelector('textarea');
    if (!textarea) return;
    // 标记是否为 Impression 模块的 flex 文本框（需要特殊处理）
    const isImpWrap = wrap.classList.contains('other-imp-textarea-wrap');
    let startY = 0, startHeight = 0, isDragging = false;
    function dragStart(y) {
      isDragging = true;
      startY = y;
      startHeight = textarea.clientHeight;
      // Impression 文本框处于 flex 拉伸布局中，拖拽时临时解除 flex，使 height 生效
      if (isImpWrap) {
        textarea.style.flex = 'none';
        wrap.style.flex = 'none';
      }
      document.body.style.cursor = "ns-resize";
      document.body.style.touchAction = "none";
    }
    function dragMove(y) {
      if (!isDragging) return;
      const newH = Math.max(60, startHeight + (y - startY));
      textarea.style.height = newH + "px";
      // Impression 模块：同步设置 wrap 高度，让右下角三角形抓握跟随文本框移动
      if (isImpWrap) {
        wrap.style.height = newH + "px";
      }
    }
    function dragEnd() {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.touchAction = "";
    }
    handle.addEventListener('mousedown', e => { e.preventDefault(); dragStart(e.clientY); });
    handle.addEventListener('touchstart', e => { e.preventDefault(); dragStart(e.touches[0].clientY); });
    document.addEventListener('mousemove', e => dragMove(e.clientY));
    document.addEventListener('mouseup', dragEnd);
    // touchmove 增加 passive:false，拖拽时 preventDefault 防止页面滚动干扰
    document.addEventListener('touchmove', e => {
      if (isDragging) {
        e.preventDefault();
        dragMove(e.touches[0].clientY);
      }
    }, { passive: false });
    document.addEventListener('touchend', dragEnd);
  });
}

// 初始化入口
export function initOtherModule() {
  loadOtherData();
  loadOtherConfig();
  // 先绑定所有事件（不依赖游戏数据）
  bindFoldButtons();
  bindOtherScrollButtons();
  bindModalInterceptor();
  bindRepoCharModalInterceptor();
  bindRepoCpModalInterceptor();
  bindReroCardEvents();
  bindImpressionEvents();
  bindImpressionGlobalSwitches();
  bindExportConfig();
  bindTextareaResize();
  // +添加游戏按钮：使用 document 事件委托，避免时序或 ID 匹配问题导致无反应
  if (!window._otherAddBtnBound) {
    document.addEventListener('click', function(e) {
      if (e.target.closest('#other-repo-add-game-btn')) {
        e.stopPropagation();
        openOtherGameModal('repo');
        return;
      }
      if (e.target.closest('#other-impression-add-game-btn')) {
        e.stopPropagation();
        openOtherGameModal('impression');
        return;
      }
    });
    window._otherAddBtnBound = true;
  }
  // 新增：Other 模式接管弹窗时，搜索框使用 Other 自己的渲染，避免 annual.js 覆盖
  if (!window._otherModalSearchBound) {
    document.addEventListener('input', function(e) {
      const searchInput = e.target.closest('.annual-global-search-input');
      if (!searchInput) return;
      const modal = document.getElementById('annual-global-game-modal');
      if (!modal || modal.dataset.otherModalActive !== "1") return;
      if (!otherAddTarget) return;
      e.stopPropagation();
      const listEl = modal.querySelector('.annual-global-game-list');
      if (listEl) {
        renderOtherModalGameList(listEl, getCombinedGameList(), searchInput.value);
      }
    });
    window._otherModalSearchBound = true;
  }

  // 新增：模式切换监听，切回 FavList 时重置 .wrap 背景和标题变量，切回 Other 时重新应用
  if (!window._otherModeSwitchBound) {
    document.querySelectorAll('.mode-switch-wrap .mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapEl = document.querySelector('.wrap');
        if (!wrapEl) return;
        if (btn.dataset.mode === 'other') {
          applyOtherPageColors();
        } else {
          // 切回非 Other 模式时重置 .wrap 和 body 的背景色，恢复原页面样式
          wrapEl.style.backgroundColor = '';
          wrapEl.style.removeProperty('--other-export-title');
          document.body.style.backgroundColor = '';
        }
      });
    });
    window._otherModeSwitchBound = true;
  }

  // 游戏模板就绪后渲染卡片；未就绪则轮询等待（最多 2 秒）
  function tryRender() {
    if (isGameTemplateReady()) {
      renderRepoModule();
      renderImpressionModule();
      console.log("✅Other 模块已初始化");
    } else {
      let pollCount = 0;
      const pollTimer = setInterval(() => {
        pollCount++;
        if (isGameTemplateReady() || pollCount >= 40) {
          clearInterval(pollTimer);
          renderRepoModule();
          renderImpressionModule();
          console.log("✅Other 模块已初始化");
        }
      }, 50);
    }
  }
  tryRender();
}

window.initOtherModule = initOtherModule;
