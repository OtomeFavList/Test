// Other 模式 other.js

import {
  gameTemplateList,
  getWebImageUrl,
  renderGameSelectItem,
  fillFilterOptions
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

const otherExportDefault = {
  bg: "#fff7f9",
  title: "#b33a3a",
  defaultTextColor: "#b85878",
  inputTextColor: "#000000",
  heartColor: "#e895a8",
  radarColor: "#e895a8",
  cardBg: "#fff7f9",
  labelColor: "#b85878",
  customtext: "#c98fac",
  customborder: "#eeeeee",
  reporterName: "",
  reporterColor: "#b33a3a",
  imageBorderColor: "#eeeeee",
  border: "#f6a5b8",
  normalQuality: false,
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
  if (core && Array.isArray(core.gameTemplateList) && core.gameTemplateReady === true) {
    baseList = core.gameTemplateList;
  } else if (Array.isArray(window.__gameTemplateList) && window.__gameTemplateList.length > 0) {
    baseList = window.__gameTemplateList;
  } else if (Array.isArray(gameTemplateList)) {
    baseList = gameTemplateList;
  }
  const fdList = Array.isArray(window.__fdGameTemplateList) ? window.__fdGameTemplateList : [];
  return [...baseList, ...fdList];
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
  // 三位十六进制色修复（input[type=color] 只接受六位）
  ['customborder', 'cardBg', 'imageBorderColor'].forEach(key => {
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
  // 维度名标签：改为HTML input，定位在SVG外层，距离 R+30（更远），可直接点击编辑
  let labelInputs = '';
  dims.forEach((d, i) => {
    const [x, y] = pt(angles[i], R + 30);
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
    // 卡片 body：有角色显示图片+清除，无角色显示+按钮（全部走角色弹窗）
    let bodyHtml;
    if (card.charId) {
      bodyHtml = `
        <div class="other-repo-char-preview">
          <img src="${card.coverSrc && (card.coverSrc.startsWith('http') || card.coverSrc.startsWith('blob:')) ? card.coverSrc : getWebImageUrl(card.coverSrc)}" alt="${card.charName}">
        </div>
        <button class="other-repo-card-clear" data-repo-char-clear="${idx}">×</button>`;
    } else {
      bodyHtml = `<button class="other-repo-card-add" data-repo-char-add="${idx}">+</button>`;
    }
    // 标签：固定卡片显示纯文本，自定义卡片显示可编辑 textarea
    const labelHtml = isCustom
      ? `<textarea class="other-repo-card-label-edit" data-repo-char-label="${idx}" placeholder="自定义标签" rows="1">${card.label || ''}</textarea>`
      : `<div class="other-repo-card-label">${card.label}</div>`;
    const removeBtn = isCustom
      ? `<button class="other-repo-card-remove" data-repo-char-remove="${idx}">×</button>`
      : '';
    // DOM顺序：封面在上、标签在下（复刻模块七）
    html += `
      <div class="other-repo-char-card">
        ${removeBtn}
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

// Rero 卡片
function renderReroCard(gameData) {
  const gameInfo = getCombinedGameList().find(g => g.id === gameData.gameId);
  if (!gameInfo) return "";
  const coverSrc = gameInfo.cover || gameInfo.image || gameInfo.img || "";
  const coverUrl = coverSrc ? getWebImageUrl(coverSrc) : "";
  const safeName = gameInfo.name || gameData.gameId;
  const gid = gameData.gameId;
  return `
  <div class="other-rero-card" data-game-id="${gid}">
    <div class="other-rero-header">
      <h3 class="other-rero-game-name">${safeName}</h3>
      <div class="other-rero-header-btns">
        <button class="other-rero-fold-btn" data-action="fold-rero">▲</button>
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
          <div class="other-rero-field-row">
            <span class="other-rero-field-label">开始日期</span>
            <input class="other-rero-field-input" type="text" data-field="startDate" value="${gameData.startDate || ''}" placeholder="YYYY.MM.DD">
          </div>
          <div class="other-rero-field-row">
            <span class="other-rero-field-label">结束日期</span>
            <input class="other-rero-field-input" type="text" data-field="endDate" value="${gameData.endDate || ''}" placeholder="YYYY.MM.DD">
          </div>
          <div class="other-rero-dual-grade-row">
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">甜度</span>
              <div class="other-grade-group">${renderGradeGroup('sweetness', gameData.sweetness)}</div>
            </div>
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">虐度</span>
              <div class="other-grade-group">${renderGradeGroup('bitterness', gameData.bitterness)}</div>
            </div>
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
      <div class="other-rero-text-field">
        <label>攻略顺序</label>
        <div class="other-rero-textarea-wrap">
          <textarea data-field="strategyOrder" placeholder="攻略顺序">${gameData.strategyOrder || ''}</textarea>
          <div class="resize-handle"></div>
        </div>
      </div>
      <div class="other-rero-text-field">
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
}

// Impression 模块
function renderImpressionModule() {
  const container = document.getElementById('other-impression-game-container');
  if (!container) return;
  if (otherData.impressionGames.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = otherData.impressionGames.map(g => {
    const gameInfo = getCombinedGameList().find(x => x.id === g.gameId);
    const name = gameInfo ? gameInfo.name : g.gameId;
    return `
    <div class="other-impression-card" data-game-id="${g.gameId}">
      <div class="other-impression-header">
        <h3 class="other-impression-game-name">${name}</h3>
        <div class="other-rero-header-btns">
          <button class="other-rero-fold-btn" data-action="fold-impression">▲</button>
          <button class="other-rero-delete-btn" data-action="delete-impression">×</button>
        </div>
      </div>
      <div class="other-impression-card-content"></div>
    </div>`;
  }).join("");
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
  document.body.classList.add('modal-lock');
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
      otherData.impressionGames.push({ gameId: gameId });
      saveOtherData();
      renderImpressionModule();
    }

    // 关闭弹窗
    modal.classList.remove('active');
    document.body.classList.remove('modal-lock');
    otherAddTarget = null;
  }, true);

  // 关闭按钮 / 点击遮罩：清除 Other 标记 + 解除页面滚动锁定
  const clearTarget = () => {
    otherAddTarget = null;
    document.body.classList.remove('modal-lock');
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
      return;
    }
    // 文本卡片自定义标签
    const textLabelIdx = e.target.dataset.repoTextLabel;
    if (textLabelIdx !== undefined) {
      const idx = Number(textLabelIdx);
      const target = getTextCardRef(gameData, idx);
      if (target) { target.label = e.target.value; saveOtherData(); }
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

  // blur 事件：自定义角色卡片标签失焦时追加新卡片
  repoContainer.addEventListener('blur', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameData = getGameDataFromCard(card);
    if (!gameData) return;
    const charLabelIdx = e.target.dataset.repoCharLabel;
    if (charLabelIdx !== undefined && e.target.value.trim() !== '') {
      const idx = Number(charLabelIdx);
      const customLen = gameData.repoCustomCharCards?.length || 0;
      const fixedLen = gameData.repoCharCards?.length || 0;
      // 仅当是最后一个自定义卡片时追加
      if (idx === fixedLen + customLen - 1) {
        gameData.repoCustomCharCards.push({ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' });
        saveOtherData();
        renderRepoModule();
      }
      return;
    }
    const textLabelIdx = e.target.dataset.repoTextLabel;
    if (textLabelIdx !== undefined && e.target.value.trim() !== '') {
      const idx = Number(textLabelIdx);
      const customLen = gameData.repoCustomTextCards?.length || 0;
      const fixedLen = gameData.repoTextCards?.length || 0;
      if (idx === fixedLen + customLen - 1) {
        gameData.repoCustomTextCards.push({ label: '', type: 'text', text: '' });
        saveOtherData();
        renderRepoModule();
      }
      return;
    }
    // 文本卡片正文：失焦时如果是最后一个自定义卡片且内容非空，追加新空白卡片
    // （复用 Annual 模块五逻辑：标签和正文任一非空且是最后一个，即触发追加）
    const textContentIdx = e.target.dataset.repoTextContent;
    if (textContentIdx !== undefined && e.target.value.trim() !== '') {
      const idx = Number(textContentIdx);
      const fixedLen = gameData.repoTextCards?.length || 0;
      const customLen = gameData.repoCustomTextCards?.length || 0;
      // 仅自定义卡片（合并索引 >= fixedLen）且是最后一个时追加
      if (idx >= fixedLen && idx === fixedLen + customLen - 1) {
        gameData.repoCustomTextCards.push({ label: '', type: 'text', text: '' });
        saveOtherData();
        renderRepoModule();
      }
      return;
    }
  }, true);

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
      btn.textContent = card.classList.contains('other-folded') ? '▼' : '▲';
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
    // 角色卡片 + 按钮（打开角色弹窗）
    const charAddBtn = e.target.closest('[data-repo-char-add]');
    if (charAddBtn) {
      const idx = Number(charAddBtn.dataset.repoCharAdd);
      otherRepoCharTarget = { gameIdx: gameIdx, cardIdx: idx, type: 'char' };
      if (typeof window.openAnnualGlobalCharModal === 'function') {
        window.openAnnualGlobalCharModal(null, 'otherRepoChar');
      }
      return;
    }
    // 文本卡片 CP + 按钮（打开CP弹窗）
    const textCpAddBtn = e.target.closest('[data-repo-text-cp-add]');
    if (textCpAddBtn) {
      const idx = Number(textCpAddBtn.dataset.repoTextCpAdd);
      otherRepoCharTarget = { gameIdx: gameIdx, cardIdx: idx, type: 'cp' };
      if (typeof window.openAnnualGlobalCpModal === 'function') {
        window.openAnnualGlobalCpModal(null, 'otherRepoCp');
      }
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
    // 角色卡片图片清除 ×
    const charClearBtn = e.target.closest('[data-repo-char-clear]');
    if (charClearBtn) {
      const idx = Number(charClearBtn.dataset.repoCharClear);
      const target = getCharCardRef(gameData, idx);
      if (target) {
        if (target.type === 'cp') {
          Object.assign(target, { gameId: '', femaleId: '', maleId: '', femaleName: '', maleName: '', femaleCoverSrc: '', maleCoverSrc: '' });
        } else {
          Object.assign(target, { gameId: '', charId: '', charName: '', coverSrc: '' });
        }
      }
      saveOtherData();
      renderRepoModule();
      return;
    }
    // 自定义角色卡片整卡删除 ×
    const charRemoveBtn = e.target.closest('[data-repo-char-remove]');
    if (charRemoveBtn) {
      const idx = Number(charRemoveBtn.dataset.repoCharRemove);
      const fixedLen = gameData.repoCharCards?.length || 0;
      const customIdx = idx - fixedLen;
      if (customIdx >= 0) {
        gameData.repoCustomCharCards.splice(customIdx, 1);
        // 复用 Annual 模块五逻辑：确保至少保留一个完全空白的可操作自定义卡片
        const hasEmpty = gameData.repoCustomCharCards.some(c => !c.label.trim() && !c.charId);
        if (!hasEmpty) {
          gameData.repoCustomCharCards.push({ label: '', type: 'char', gameId: '', charId: '', charName: '', coverSrc: '' });
        }
        saveOtherData();
        renderRepoModule();
      }
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
  container.addEventListener('click', function (e) {
    // 游戏卡片折叠/展开
    if (e.target.closest('[data-action="fold-impression"]')) {
      const card = e.target.closest('.other-impression-card');
      if (!card) return;
      card.classList.toggle('other-folded');
      const btn = e.target.closest('[data-action="fold-impression"]');
      btn.textContent = card.classList.contains('other-folded') ? '▼' : '▲';
      return;
    }
    if (e.target.closest('[data-action="delete-impression"]')) {
      const card = e.target.closest('.other-impression-card');
      if (!card) return;
      const gameId = card.dataset.gameId;
      otherData.impressionGames = otherData.impressionGames.filter(g => g.gameId !== gameId);
      saveOtherData();
      renderImpressionModule();
    }
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

// 悬浮滚动按钮
function bindOtherScrollButtons() {
  const topBtn = document.getElementById('other-back-to-top-btn');
  const bottomBtn = document.getElementById('other-scroll-to-bottom-btn');
  if (!topBtn || !bottomBtn) return;

  const TOLERANCE = 30;
  const EMPTY_HEIGHT = 140;

  function getModules() {
    const wrap = document.querySelector('.mode-wrap[data-mode="other"]');
    return wrap ? Array.from(wrap.querySelectorAll('.big-card')) : [];
  }
  function isEmpty(el) { return el.getBoundingClientRect().height < EMPTY_HEIGHT; }
  function findPrev(modules, from) {
    for (let i = from; i >= 0; i--) if (!isEmpty(modules[i])) return i;
    return -1;
  }
  function findNext(modules, from) {
    for (let i = from; i < modules.length; i++) if (!isEmpty(modules[i])) return i;
    return -1;
  }
  function getCurrentIndex(modules) {
    if (modules.length === 0) return -1;
    const viewCenter = window.scrollY + window.innerHeight / 2;
    for (let i = 0; i < modules.length; i++) {
      if (isEmpty(modules[i])) continue;
      const rect = modules[i].getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (viewCenter >= top && viewCenter <= bottom) return i;
    }
    for (let i = 0; i < modules.length; i++) {
      const rect = modules[i].getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (viewCenter >= top && viewCenter <= bottom) return i;
    }
    return 0;
  }

  topBtn.addEventListener('click', function () {
    const modules = getModules();
    if (modules.length === 0) return;
    let idx = getCurrentIndex(modules);
    if (isEmpty(modules[idx])) {
      const prev = findPrev(modules, idx);
      if (prev >= 0) idx = prev;
    }
    const currentTop = modules[idx].getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > currentTop + TOLERANCE) {
      modules[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const prev = findPrev(modules, idx - 1);
      if (prev >= 0) modules[prev].scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  bottomBtn.addEventListener('click', function () {
    const modules = getModules();
    if (modules.length === 0) return;
    let idx = getCurrentIndex(modules);
    if (isEmpty(modules[idx])) {
      const next = findNext(modules, idx);
      if (next >= 0) idx = next;
    }
    const currentBottom = modules[idx].getBoundingClientRect().bottom + window.scrollY;
    const viewBottom = window.scrollY + window.innerHeight;
    if (viewBottom < currentBottom - TOLERANCE) {
      modules[idx].scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
      const next = findNext(modules, idx + 1);
      if (next >= 0) modules[next].scrollIntoView({ behavior: 'smooth', block: 'end' });
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

// 导出配置
function bindExportConfig() {
  const wrap = document.querySelector('.mode-wrap[data-mode="other"]');
  const colorMap = [
    { id: 'other-color-bg',              key: 'bg',              cssVar: '--other-export-bg' },
    { id: 'other-color-title',           key: 'title',           cssVar: '--other-export-title' },
    { id: 'other-color-default-text',    key: 'defaultTextColor',cssVar: '--other-default-text-color' },
    { id: 'other-color-input-text',      key: 'inputTextColor',  cssVar: '--other-input-text-color' },
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
      saveOtherConfig();
    };
  });
  // 字号滑块：填写内容字号（与 Annual 同款绑定逻辑；作用于时长/日期 input 及 优点/缺点/攻略顺序/好感顺序 textarea）
  const sliderInputFont = document.getElementById('other-slider-input-font');
  const inputFontValueDisplay = document.getElementById('other-input-font-value');
  if (sliderInputFont && inputFontValueDisplay) {
    sliderInputFont.value = otherConfig.inputFontSize;
    inputFontValueDisplay.textContent = `${otherConfig.inputFontSize}px`;
    if (wrap) wrap.style.setProperty('--other-input-font-size', `${otherConfig.inputFontSize}px`);
    updateSliderProgress(sliderInputFont);
    sliderInputFont.oninput = () => {
      const val = Number(sliderInputFont.value);
      otherConfig.inputFontSize = val;
      inputFontValueDisplay.textContent = `${val}px`;
      if (wrap) wrap.style.setProperty('--other-input-font-size', `${val}px`);
      updateSliderProgress(sliderInputFont);
      saveOtherConfig();
    };
  }
  // 字号滑块：自定义文本字号（与 Annual 同款绑定逻辑；作用于感想 textarea）
  const sliderCustomTextFont = document.getElementById('other-slider-custom-text-font');
  const customTextFontValueDisplay = document.getElementById('other-custom-text-font-value');
  if (sliderCustomTextFont && customTextFontValueDisplay) {
    sliderCustomTextFont.value = otherConfig.customTextFontSize;
    customTextFontValueDisplay.textContent = `${otherConfig.customTextFontSize}px`;
    if (wrap) wrap.style.setProperty('--other-custom-text-font-size', `${otherConfig.customTextFontSize}px`);
    updateSliderProgress(sliderCustomTextFont);
    sliderCustomTextFont.oninput = () => {
      const val = Number(sliderCustomTextFont.value);
      otherConfig.customTextFontSize = val;
      customTextFontValueDisplay.textContent = `${val}px`;
      if (wrap) wrap.style.setProperty('--other-custom-text-font-size', `${val}px`);
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
      if (normalQuality) normalQuality.checked = false;
      // 重置字号滑块到默认值（与 Annual 同款重置逻辑）
      if (sliderInputFont && inputFontValueDisplay) {
        sliderInputFont.value = otherExportDefault.inputFontSize;
        inputFontValueDisplay.textContent = `${otherExportDefault.inputFontSize}px`;
        if (wrap) wrap.style.setProperty('--other-input-font-size', `${otherExportDefault.inputFontSize}px`);
        updateSliderProgress(sliderInputFont);
      }
      if (sliderCustomTextFont && customTextFontValueDisplay) {
        sliderCustomTextFont.value = otherExportDefault.customTextFontSize;
        customTextFontValueDisplay.textContent = `${otherExportDefault.customTextFontSize}px`;
        if (wrap) wrap.style.setProperty('--other-custom-text-font-size', `${otherExportDefault.customTextFontSize}px`);
        updateSliderProgress(sliderCustomTextFont);
      }
    };
  }
  // 导出按钮
  const exportBtn = document.getElementById('other-btn-export-image');
  if (exportBtn) {
    exportBtn.onclick = () => {
      alert("Other 模式导出功能开发中…");
    };
  }
}

// 文本框拖拽手柄（自定义文本框）
function bindTextareaResize() {
  document.querySelectorAll('.mode-wrap[data-mode="other"] .other-rero-impression-wrap .resize-handle, .mode-wrap[data-mode="other"] .other-rero-textarea-wrap .resize-handle, .mode-wrap[data-mode="other"] .other-repo-text-card-body .resize-handle').forEach(handle => {
    if (handle.dataset.resizeBinded === "1") return;
    handle.dataset.resizeBinded = "1";
    const wrap = handle.closest('.other-rero-impression-wrap, .other-rero-textarea-wrap, .other-repo-text-card-body');
    if (!wrap) return;
    const textarea = wrap.querySelector('textarea');
    if (!textarea) return;

    let startY = 0, startHeight = 0, isDragging = false;

    function dragStart(y) {
      isDragging = true;
      startY = y;
      startHeight = textarea.clientHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.touchAction = "none";
    }
    function dragMove(y) {
      if (!isDragging) return;
      textarea.style.height = Math.max(60, startHeight + (y - startY)) + "px";
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
    document.addEventListener('touchmove', e => { if (isDragging) dragMove(e.touches[0].clientY); });
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
