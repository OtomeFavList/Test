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
const DEFAULT_DIMS = ['剧情', '画风', '音乐', '配音', '角色'];

const otherExportDefault = {
  bg: "#fff7f9",
  title: "#b33a3a",
  subtitle: "#b85878",
  gamename: "#000000",
  customtext: "#c98fac",
  customborder: "#eeeeee",
  border: "#f6a5b8",
  boxbg: "#fff7f9",
  labelcolor: "#b85878",
  normalQuality: false,
  exportSize: "long-810"
};

// 爱心 SVG
const HEART_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

// 运行时状态
let otherData = null;
let otherConfig = null;
let otherAddTarget = null; // "repo" | "impression" | null

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
  otherConfig = { ...otherExportDefault, ...otherConfig };
}

function saveOtherConfig() {
  localStorage.setItem(OTHER_CONFIG_KEY, JSON.stringify(otherConfig));
}

// 创建新 Rero 游戏数据（默认值）
function createReroGameData(gameId) {
  return {
    gameId: gameId,
    duration: "",
    completed: false,
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
    impression: ""
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
  return dims.map((dim, idx) => `
    <div class="other-dim-row">
      <input class="other-dim-name" type="text" value="${dim.name}" data-dim-idx="${idx}">
      <div class="other-dim-levels">
        ${[1, 2, 3, 4, 5].map(l =>
          `<button class="other-dim-level ${dim.level >= l ? 'filled' : ''}" data-dim-idx="${idx}" data-level="${l}"></button>`
        ).join("")}
      </div>
    </div>
  `).join("");
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

  return `
  <div class="other-rero-card" data-game-id="${gameData.gameId}">
    <div class="other-rero-header">
      <h3 class="other-rero-game-name">${safeName}</h3>
      <button class="other-rero-delete-btn" data-action="delete">×</button>
    </div>
    <div class="other-rero-body">
      <div class="other-rero-cover-wrap">
        <img class="other-rero-cover" src="${coverUrl}" alt="${safeName}" decoding="async">
      </div>
      <div class="other-rero-fields">
        <div class="other-rero-field-row">
          <span class="other-rero-field-label">时长</span>
          <input class="other-rero-field-input" type="text" data-field="duration" value="${gameData.duration || ''}" placeholder="小时">
          <div class="other-rero-checkbox-wrap">
            <input type="checkbox" id="other-completed-${gameData.gameId}" data-field="completed" ${gameData.completed ? 'checked' : ''}>
            <label for="other-completed-${gameData.gameId}">全通</label>
          </div>
        </div>
        <div class="other-rero-field-row">
          <span class="other-rero-field-label">开始日期</span>
          <input class="other-rero-field-input" type="text" data-field="startDate" value="${gameData.startDate || ''}" placeholder="YYYY-MM-DD">
        </div>
        <div class="other-rero-field-row">
          <span class="other-rero-field-label">结束日期</span>
          <input class="other-rero-field-input" type="text" data-field="endDate" value="${gameData.endDate || ''}" placeholder="YYYY-MM-DD">
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
        <div class="other-rero-rating-combo">
          <div class="other-rero-rating-left">
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">总评</span>
              <div class="other-grade-group">${renderGradeGroup('overall', gameData.overall)}</div>
            </div>
            <div class="other-rero-field-row">
              <span class="other-rero-field-label">喜爱度</span>
              <div class="other-rero-hearts">${renderHearts(gameData.love)}</div>
            </div>
          </div>
          <div class="other-rero-five-dim">
            ${renderFiveDim(gameData.fiveDim)}
          </div>
        </div>
      </div>
    </div>
    <div class="other-rero-text-fields">
      <div class="other-rero-text-field">
        <label>优点</label>
        <textarea data-field="pros" placeholder="优点">${gameData.pros || ''}</textarea>
      </div>
      <div class="other-rero-text-field">
        <label>缺点</label>
        <textarea data-field="cons" placeholder="缺点">${gameData.cons || ''}</textarea>
      </div>
      <div class="other-rero-text-field">
        <label>攻略顺序</label>
        <textarea data-field="strategyOrder" placeholder="攻略顺序">${gameData.strategyOrder || ''}</textarea>
      </div>
      <div class="other-rero-text-field">
        <label>好感顺序</label>
        <textarea data-field="favorOrder" placeholder="好感顺序">${gameData.favorOrder || ''}</textarea>
      </div>
    </div>
    <div class="other-rero-impression-wrap">
      <label>感想</label>
      <textarea data-field="impression" placeholder="自定义文本">${gameData.impression || ''}</textarea>
      <div class="resize-handle"></div>
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
    container.innerHTML = '<p class="empty-hint">尚未添加游戏</p>';
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
    container.innerHTML = '<p class="empty-hint">尚未添加游戏</p>';
    return;
  }
  container.innerHTML = otherData.impressionGames.map(g => {
    const gameInfo = getCombinedGameList().find(x => x.id === g.gameId);
    const name = gameInfo ? gameInfo.name : g.gameId;
    return `
    <div class="other-impression-card" data-game-id="${g.gameId}">
      <div class="other-impression-header">
        <h3 class="other-impression-game-name">${name}</h3>
        <button class="other-rero-delete-btn" data-action="delete-impression">×</button>
      </div>
    </div>`;
  }).join("");
}

// 全局游戏搜索弹窗
// 优先调用 annual.js 暴露的打开函数；兜底直接操作 DOM
function openOtherGameModal(target) {
  otherAddTarget = target;
  const modal = document.getElementById('annual-global-game-modal');
  if (!modal) return;
  // annual.js 未将 openAnnualGlobalGameModal 挂载到 window，始终走兜底分支
  modal.classList.add('active');
  document.body.classList.add('modal-lock');
  const searchInput = modal.querySelector('.annual-global-search-input');
  if (searchInput) searchInput.value = "";
  // 重置筛选下拉框（复用 annual.js 的重置逻辑，避免上次筛选残留）
  modal.querySelectorAll(".annual-filter-writer, .annual-filter-art, .annual-filter-year, .annual-filter-publisher, .annual-filter-cn")
    .forEach(sel => { sel.value = ""; });
  const combinedList = getCombinedGameList();
  const listEl = modal.querySelector('.annual-global-game-list');
  if (listEl && combinedList.length > 0) {
    renderOtherModalGameList(listEl, combinedList, "");
  }
  // 填充筛选框（含 FD 游戏的编剧/画师/年份等）
  if (typeof fillFilterOptions === "function") {
    try { fillFilterOptions(combinedList, modal); } catch (e) { /* 旧版不支持 scope，忽略 */ }
  }
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
  };
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

  // input 事件：文本框实时保存
  repoContainer.addEventListener('input', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    const gameData = otherData.repoGames.find(g => g.gameId === gameId);
    if (!gameData) return;

    const field = e.target.dataset.field;
    const textFields = ['duration', 'startDate', 'endDate', 'pros', 'cons', 'strategyOrder', 'favorOrder', 'impression'];
    if (field && textFields.includes(field)) {
      gameData[field] = e.target.value;
      saveOtherData();
      return;
    }

    // 五维维度名修改
    const dimIdx = e.target.dataset.dimIdx;
    if (dimIdx !== undefined && e.target.classList.contains('other-dim-name')) {
      const idx = Number(dimIdx);
      if (gameData.fiveDim && gameData.fiveDim[idx]) {
        gameData.fiveDim[idx].name = e.target.value;
        saveOtherData();
      }
    }
  });

  // click 事件：评级/爱心/五维/删除
  repoContainer.addEventListener('click', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    const gameData = otherData.repoGames.find(g => g.gameId === gameId);
    if (!gameData) return;

    // 删除
    if (e.target.closest('[data-action="delete"]')) {
      otherData.repoGames = otherData.repoGames.filter(g => g.gameId !== gameId);
      saveOtherData();
      renderRepoModule();
      return;
    }

    // SABCDE 评级（再次点击同一等级取消）
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

    // 爱心评分（再次点击同一颗取消）
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

    // 五维等级（再次点击同一等级清零）
    const dimLevel = e.target.closest('.other-dim-level');
    if (dimLevel) {
      const idx = Number(dimLevel.dataset.dimIdx);
      const level = Number(dimLevel.dataset.level);
      if (gameData.fiveDim && gameData.fiveDim[idx]) {
        gameData.fiveDim[idx].level = gameData.fiveDim[idx].level === level ? 0 : level;
        saveOtherData();
        const row = dimLevel.closest('.other-dim-row');
        row.querySelectorAll('.other-dim-level').forEach(btn => {
          btn.classList.toggle('filled', Number(btn.dataset.level) <= gameData.fiveDim[idx].level);
        });
      }
      return;
    }
  });

  // change 事件：全通勾选（键盘/点击均触发，比 click 更可靠）
  repoContainer.addEventListener('change', function (e) {
    const card = e.target.closest('.other-rero-card');
    if (!card) return;
    const gameId = card.dataset.gameId;
    const gameData = otherData.repoGames.find(g => g.gameId === gameId);
    if (!gameData) return;
    if (e.target.dataset.field === 'completed') {
      gameData.completed = e.target.checked;
      saveOtherData();
    }
  });
}

// Impression 模块交互
function bindImpressionEvents() {
  const container = document.getElementById('other-impression-game-container');
  if (!container) return;
  container.addEventListener('click', function (e) {
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

// 导出配置
function bindExportConfig() {
  const wrap = document.querySelector('.mode-wrap[data-mode="other"]');

  const colorMap = [
    { id: 'other-color-bg',         key: 'bg',         cssVar: '--other-export-bg' },
    { id: 'other-color-title',      key: 'title',      cssVar: '--other-export-title' },
    { id: 'other-color-subtitle',   key: 'subtitle',   cssVar: '--other-export-subtitle' },
    { id: 'other-color-gamename',   key: 'gamename',   cssVar: '--other-export-gamename' },
    { id: 'other-color-customtext', key: 'customtext', cssVar: '--other-export-customtext' },
    { id: 'other-color-customborder', key: 'customborder', cssVar: '--other-export-customborder' },
    { id: 'other-color-boxbg',      key: 'boxbg',      cssVar: '--other-export-boxbg' },
    { id: 'other-color-labelcolor', key: 'labelcolor', cssVar: '--other-export-labelcolor' },
    { id: 'other-color-border',     key: 'border',     cssVar: '--other-export-border' }
  ];

  colorMap.forEach(item => {
    const dom = document.getElementById(item.id);
    if (!dom) return;
    dom.value = otherConfig[item.key] || otherExportDefault[item.key];
    if (wrap) wrap.style.setProperty(item.cssVar, dom.value);
    dom.oninput = () => {
      otherConfig[item.key] = dom.value;
      if (wrap) wrap.style.setProperty(item.cssVar, dom.value);
      saveOtherConfig();
    };
  });

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
      if (normalQuality) normalQuality.checked = false;
      document.querySelectorAll('input[name="other-export-size"]').forEach(r => {
        r.checked = (r.value === otherExportDefault.exportSize);
      });
    };
  }

  // 导出尺寸
  document.querySelectorAll('input[name="other-export-size"]').forEach(radio => {
    if (radio.value === otherConfig.exportSize) radio.checked = true;
    radio.onchange = () => {
      otherConfig.exportSize = radio.value;
      saveOtherConfig();
    };
  });

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
  document.querySelectorAll('.mode-wrap[data-mode="other"] .other-rero-impression-wrap .resize-handle').forEach(handle => {
    if (handle.dataset.resizeBinded === "1") return;
    handle.dataset.resizeBinded = "1";
    const wrap = handle.closest('.other-rero-impression-wrap');
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
  bindReroCardEvents();
  bindImpressionEvents();
  bindExportConfig();
  bindTextareaResize();
  // +添加游戏按钮
  const repoAddBtn = document.getElementById('other-repo-add-game-btn');
  if (repoAddBtn) repoAddBtn.onclick = () => openOtherGameModal('repo');
  const impAddBtn = document.getElementById('other-impression-add-game-btn');
  if (impAddBtn) impAddBtn.onclick = () => openOtherGameModal('impression');

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
