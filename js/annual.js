// ===================== 年度报告模块 annual.js =====================
// 存储key: "annual-report-data"，与喜好表数据隔离

// =========【修复：不再导入普通变量，改为从 window.Core 实时读取最新状态，同时增加window全局变量兜底】===========

import { renderGameSelectItem, getWebImageUrl, getAvailableCharImages, getCharDisplayName, getCharNameList, getCharShowHide } from '/js/main.js';
import { renderAllAnnualModules } from './annual-canvas-render.js';

const ANNUAL_STORE_KEY = "annual-report-data";

// ============【配色持久化，对齐script.js】============

const annualExportDefault = {
    bg: "#fff7f9",
    title: "#b33a3a",
    gamename: "#000000",
    customtext: "#c98fac",
    border: "#f6a5b8",
    customTextFontSize: 16
};

function loadAnnualExportConfig() {
    const raw = localStorage.getItem("annual-export-config");
    if(raw) {
        try {
            return Object.assign({}, annualExportDefault, JSON.parse(raw));
        } catch(e) {
            return {...annualExportDefault};
        }
    }
    return {...annualExportDefault};
}

function saveAnnualExportConfig() {
    if(!annualExportConfig){
        annualExportConfig = {...annualExportDefault};
    }
    localStorage.setItem("annual-export-config", JSON.stringify(annualExportConfig));
}

let annualExportConfig = loadAnnualExportConfig();

const getDefaultAnnualData = () => ({
    reportYear: "",
    playCount: "",
    totalHours: "",
    likeCharCount: "",
    cpCount: "",
    buyCount: "",
    costMoney: "",
    finished: "",
    ongoing: "",
    notStart: "",
    topList: [],
    charTopList: [],
    cpTopList: []  // ✅新增：カップルTOP数据
});

let annualData = getDefaultAnnualData();

let btnAnnualExport;

// =========【新增】全局弹窗：记录当前操作的TOP条目下标 0/1/2；null=弹窗关闭
let activeTopItemIndex = null;

// ========= キャラTOP3弹窗状态 =========
let activeCharTopItemIndex = null;

// ========= ✅新增：カップルTOP弹窗状态 =========
let activeCpTopItemIndex = null;
let cpModalViewMode = "gameList";       // gameList / femaleList
let cpModalCurrentGameId = null;
let cpModalCurrentFemaleId = null;      // 展开男主列表时记录当前女主
let cpModalGlobal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
let cpModalLocal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
const annualCpImgIndex = new Map();     // key="${gameId}-${charId}"
const annualCpNameIndex = new Map();

// 弹窗内部视图状态：gameList / charList
let charModalViewMode = "gameList";
// 当前弹窗选中的游戏ID（进入角色列表时赋值）
let charModalCurrentGameId = null;
// 弹窗内开关临时状态（只作用弹窗内部，不污染全局appData）
let charModalGlobal = {
    subChar: false,
    hideChar: false,
    fdChar: false,
    fdSubChar: false  // ✅补丁新增：全局显示续作/FD次要角色
};
let charModalLocal = {
    subChar: false,
    hideChar: false,
    fdChar: false,
    fdSubChar: false  // ✅补丁新增：单游戏显示续作/FD次要角色
};

// 模块内部状态标记
let _annualRealInitialized = false;

// 模块级标记，用于全局document click防重复绑定（当前方案已移除，保留作为预留）
let _annualDocClickBound = false;
let _annualSortDocClickHandler = null;
// ✅补丁新增：Annual模式独立角色立绘索引，key="${gameId}-${charId}"，不污染FavList的charImageSelect
const annualCharImgIndex = new Map();
// ✅补丁新增：Annual模式独立角色名字索引，key="${gameId}-${charId}"，0=正常名，与立绘索引完全同构
const annualCharNameIndex = new Map();

/**
 * 获取基础游戏模板（仅普通游戏，不含FD续作）
 * 供：角色弹窗使用，角色弹窗禁止读取FD游戏
 */
function getGameTemplateState_BaseOnly() {
    const core = window.Core;
    let baseList = null;
    let baseReady = false;
    if(core && Array.isArray(core.gameTemplateList) && core.gameTemplateReady === true){
        baseList = core.gameTemplateList;
        baseReady = true;
    }else{
        const winList = window.__gameTemplateList;
        const winReady = window.__gameTemplateReady;
        if(Array.isArray(winList) && winList.length>0 && winReady === true){
            baseList = winList;
            baseReady = true;
        }
    }
    if(!baseReady || !Array.isArray(baseList)){
        return {
            list: null,
            ready: false
        };
    }
    return {
        list: [...baseList],
        ready: true
    };
}

/**
 * 获取游戏模板【包含FD续作】，仅年度报告【游戏TOP弹窗】使用
 * 普通FavList不会读取；角色弹窗不调用此函数
 */
function getGameTemplateState_WithFD() {
    const baseState = getGameTemplateState_BaseOnly();
    if(!baseState.ready){
        return {
            list: null,
            ready: false
        };
    }
    const fdList = Array.isArray(window.__fdGameTemplateList) ? window.__fdGameTemplateList : [];
    const combinedList = [...baseState.list, ...fdList];
    return {
        list: combinedList,
        ready: true
    };
}

/**
 * ✅补丁新增：获取角色在当前弹窗开关状态下的全部可用立绘src列表
 * 复用 main.js getAvailableCharImages，传入弹窗全局/局部开关
 * @param {Object} char 角色对象
 * @returns {string[]} 可用图片相对路径数组
 */
function getAnnualCharAvailImages(char) {
    if (!char) return [];
    const availUnits = getAvailableCharImages(
        char,
        charModalGlobal.hideChar,
        charModalGlobal.fdChar,
        charModalLocal.hideChar,
        charModalLocal.fdChar
    );
    const allSrc = [];
    availUnits.forEach(u => {
        if (Array.isArray(u.srcList)) allSrc.push(...u.srcList);
    });
    return allSrc;
}

/**
 * ✅补丁新增：重置角色弹窗局部开关（逻辑状态 + DOM勾选状态同步）
 * 每次进入新游戏的角色列表时调用，确保各游戏单独开关完全独立，
 * 防止上一个游戏的开关DOM勾选残留到下一个游戏造成显示与逻辑相反
 */
function resetCharModalLocalSwitches() {
    charModalLocal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    const modal = document.getElementById("annual-global-char-modal");
    if (!modal) return;
    const subEl = modal.querySelector("#annual-modal-game-sub-char");
    const hideEl = modal.querySelector("#annual-modal-game-hide-char");
    const fdEl = modal.querySelector("#annual-modal-game-fd-game");
    const fdSubEl = modal.querySelector("#annual-modal-game-fd-sub-char");
    if (subEl) subEl.checked = false;
    if (hideEl) hideEl.checked = false;
    if (fdEl) fdEl.checked = false;
    if (fdSubEl) fdSubEl.checked = false;
}

/**
 * ✅新增：重置CP弹窗局部开关（逻辑+DOM同步）
 */
function resetCpModalLocalSwitches() {
    cpModalLocal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    const modal = document.getElementById("annual-global-cp-modal");
    if (!modal) return;
    const ids = ["#annual-modal-cp-game-sub-char","#annual-modal-cp-game-hide-char",
                 "#annual-modal-cp-game-fd-game","#annual-modal-cp-game-fd-sub-char"];
    ids.forEach(sel=>{ const el = modal.querySelector(sel); if(el) el.checked = false; });
}

/**
 * ✅新增：CP弹窗角色可用立绘列表
 */
function getAnnualCpAvailImages(char) {
    if (!char) return [];
    const availUnits = getAvailableCharImages(
        char, cpModalGlobal.hideChar, cpModalGlobal.fdChar,
        cpModalLocal.hideChar, cpModalLocal.fdChar
    );
    const allSrc = [];
    availUnits.forEach(u => { if (Array.isArray(u.srcList)) allSrc.push(...u.srcList); });
    return allSrc;
}

/**
 * 更新单个TOP条目UI显隐状态（游戏）
 * @param {HTMLElement} itemDom annual-top-item
 * @param {Object} dataItem topList单条数据
 */
function refreshTopItemUi(itemDom, dataItem) {
    const labelRow = itemDom.querySelector(".annual-top-label-row");
    const contentRow = itemDom.querySelector(".annual-top-content-row");
    const hasGame = !!dataItem.gameId;
    if (hasGame) {
        labelRow.classList.remove("hidden-when-empty");
        contentRow.classList.remove("hidden-when-empty");
        labelRow.classList.add("render-visible");
        contentRow.classList.add("render-visible");
    } else {
        labelRow.classList.add("hidden-when-empty");
        contentRow.classList.add("hidden-when-empty");
        labelRow.classList.remove("render-visible");
        contentRow.classList.remove("render-visible");
    }
}

/**
 * 更新キャラTOP3单条UI
 * @param {HTMLElement} itemDom .annual-char-top-item
 * @param {Object} dataItem charTopList子项
 */
function refreshCharTopItemUi(itemDom, dataItem) {
    const labelRow = itemDom.querySelector(".annual-top-label-row");
    const contentRow = itemDom.querySelector(".annual-char-top-content-row");
    const hasChar = !!dataItem.charId;
    if (hasChar) {
        labelRow.classList.remove("hidden-when-empty");
        contentRow.classList.remove("hidden-when-empty");
        labelRow.classList.add("render-visible");
        contentRow.classList.add("render-visible");
    } else {
        labelRow.classList.add("hidden-when-empty");
        contentRow.classList.add("hidden-when-empty");
        labelRow.classList.remove("render-visible");
        contentRow.classList.remove("render-visible");
    }
}

/**
 * ✅新增：更新カップルTOP单条UI显隐
 */
function refreshCpTopItemUi(itemDom, dataItem) {
    const labelRow = itemDom.querySelector(".annual-top-label-row");
    const contentRow = itemDom.querySelector(".annual-cp-top-content-row");
    const hasCp = !!(dataItem.femaleId && dataItem.maleId);
    if (hasCp) {
        labelRow.classList.remove("hidden-when-empty");
        contentRow.classList.remove("hidden-when-empty");
        labelRow.classList.add("render-visible");
        contentRow.classList.add("render-visible");
    } else {
        labelRow.classList.add("hidden-when-empty");
        contentRow.classList.add("hidden-when-empty");
        labelRow.classList.remove("render-visible");
        contentRow.classList.remove("render-visible");
    }
}

function loadAnnualData() {
    const raw = localStorage.getItem(ANNUAL_STORE_KEY);
    if(raw) {
        try {
            const parsed = JSON.parse(raw);
            annualData = Object.assign(getDefaultAnnualData(), parsed);
        } catch(e) {
            annualData = getDefaultAnnualData();
        }
    }
}

function saveAnnualData() {
    localStorage.setItem(ANNUAL_STORE_KEY, JSON.stringify(annualData));
}

function bindStatInputs() {
    const statInputs = document.querySelectorAll(".annual-input");
    statInputs.forEach(input=>{
        const key = input.dataset.key;
        input.value = annualData[key] ?? "";
        input.addEventListener("input", ()=>{
            annualData[key] = input.value;
            saveAnnualData();
        });
    });
}

function isGameTemplateReady() {
    const state = getGameTemplateState_BaseOnly();
    return state.ready;
}

/**
 * 渲染【全局模态弹窗】游戏候选列表（游戏TOP3）
 * @param {HTMLElement} wrap 弹窗内列表容器
 * @param {string} keyword
 */
function renderGameList(wrap, keyword) {
    wrap.innerHTML = "";
    const state = getGameTemplateState_WithFD();
    const gameTemplateList = state.list;
    const gameTemplateReady = state.ready;
    console.log("[annual.js renderGameList] gameTemplateReady=", gameTemplateReady, "listLength=", gameTemplateList?.length);

    if(!gameTemplateList || !isGameTemplateReady()) {
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">游戏模板尚未加载完成，请稍后再试</div>`;
        return;
    }

    const kw = (keyword ?? "").toLowerCase().trim();
    const filtered = gameTemplateList.filter(g=>{
        if(!kw) return true;
        return String(g.name).toLowerCase().includes(kw);
    });

    // ✅【核心修改：完全复用FavList主列表的中英日排序逻辑 localeCompare("zh-CN")】
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    sorted.forEach((game, listIndex)=>{
        if(!game) return;
        const div = document.createElement("div");
        div.className = "game-option-item";
        div.innerHTML = renderGameSelectItem(game, listIndex);
        div.addEventListener("click", ()=>{
            if (activeTopItemIndex === null) return;
            //【问题③】重复游戏校验：排除当前正在编辑这一条，其余不能重复
            const isDuplicate = annualData.topList.some((item,i)=> i !== activeTopItemIndex && item.gameId === game.id);
            if(isDuplicate){
                alert("该游戏已经添加，不可重复添加");
                return;
            }
            // 回填到当前激活的topList条目
            const targetItem = annualData.topList[activeTopItemIndex];
            targetItem.gameId = game.id;
            targetItem.gameName = game.name;
            targetItem.coverSrc = game.cover ?? "";
            // 更新对应DOM条目UI
            const topItemDomList = Array.from(document.querySelectorAll(".annual-top-item"));
            const targetDom = topItemDomList[activeTopItemIndex];
            if(targetDom){
                const nameTextEl = targetDom.querySelector(".annual-game-name-text");
                const coverImg = targetDom.querySelector(".annual-top-cover");
                nameTextEl.textContent = game.name;
                coverImg.src = getWebImageUrl(targetItem.coverSrc);
                refreshTopItemUi(targetDom, targetItem);
            }
            saveAnnualData();
            // 关闭全局弹窗
            closeAnnualGlobalGameModal();
        });
        wrap.appendChild(div);
    });
}

/**
 * 角色弹窗：渲染游戏列表（キャラTOP3）
 * @param {HTMLElement} wrap
 * @param {string} keyword
 */
function renderCharModalGameList(wrap, keyword) {
    wrap.innerHTML = "";
    const state = getGameTemplateState_BaseOnly();
    const gameTemplateList = state.list;
    if (!gameTemplateList || !isGameTemplateReady()) {
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">游戏模板尚未加载完成，请稍后再试</div>`;
        return;
    }
    const kw = (keyword ?? "").toLowerCase().trim();

    // 关键词为空：原始逻辑，只渲染游戏列表
    if (!kw) {
        const filtered = [...gameTemplateList];
        const { sortFilterOptionList } = window.Core || {};
        let sorted = filtered;
        if (typeof sortFilterOptionList === 'function') {
            const sortedNames = sortFilterOptionList(filtered.map(g=>g.name));
            sorted = sortedNames.map(name=>filtered.find(g=>g.name===name)).filter(Boolean);
        } else {
            sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        }
        sorted.forEach((game) => {
            if (!game) return;
            const div = document.createElement("div");
            div.className = "game-option-item";
            div.innerHTML = renderGameSelectItem(game);
            div.addEventListener("click", () => {
                charModalCurrentGameId = game.id;
                // ✅补丁修改：统一重置局部开关（逻辑+DOM同步），防止跨游戏开关状态残留
                resetCharModalLocalSwitches();
                switchCharModalView("charList");
                renderCharModalCharList();
            });
            wrap.appendChild(div);
        });
        return;
    }

    // ====== 有搜索词：同时收集匹配角色、匹配游戏 ======
    const matchedCharacters = [];
    const matchedGames = new Set();

    for(const game of gameTemplateList) {
        const gameNameLow = String(game.name).toLowerCase();
        const matchGame = gameNameLow.includes(kw);
        if(matchGame) matchedGames.add(game.id);

        if(!Array.isArray(game.charList)) continue;
        for(const char of game.charList) {
            const charNameLow = String(char.name).toLowerCase();
            // ✅补丁修改：隐藏开关或FD开关（角色isFD时）任一开启即可搜索隐藏名
            const showHideForSearch = getCharShowHide(char, charModalGlobal.hideChar, false, charModalGlobal.fdChar, false);
            let hiddenNameMatch = false;
            if (showHideForSearch && char.hiddenName) {
                if (Array.isArray(char.hiddenName)) {
                    hiddenNameMatch = char.hiddenName.some(n => String(n).toLowerCase().includes(kw));
                } else {
                    hiddenNameMatch = String(char.hiddenName).toLowerCase().includes(kw);
                }
            }
            if(!charNameLow.includes(kw) && !hiddenNameMatch) continue;
            // ✅改为OR逻辑：角色有多个状态true时任一对应开关开启即显示
            const isSub = char.isSub ?? false;
            const isHidden = !!char.isHidden;
            const isFD = !!char.isFD;
            const isFdSub = !!char.isFdSub;
            const showHide = charModalGlobal.hideChar;
            const showFD = charModalGlobal.fdChar;
            const showSub = charModalGlobal.subChar;
            const showFdSub = charModalGlobal.fdSubChar;
            let pass = false;
            if (!isSub && !isHidden && !isFD && !isFdSub) {
                pass = true;
            } else {
                pass = (isSub && showSub) || (isHidden && showHide) || (isFD && showFD) || (isFdSub && showFdSub);
            }
            if(pass){
                matchedCharacters.push({game, char});
                // ✅移除 matchedGames.add(game.id);
            }
        }
    }

    // ✅【改动：创建两个独立子容器，角色、游戏上下分块，不混在同一个grid】
    const searchCharWrap = document.createElement("div");
    searchCharWrap.className = "search-char-result-wrap";

    const searchGameWrap = document.createElement("div");
    searchGameWrap.className = "search-game-result-wrap";

    // 渲染搜索命中的角色项（优先展示角色卡片，全部放入角色子容器）
    for(const {game, char} of matchedCharacters){
        const div = document.createElement("div");
        div.className = "char-item search-result-char-item";
        // ========== ✅补丁新增：搜索结果角色卡片支持多立绘切换 ==========
        // 搜索视图只有全局开关生效，局部开关传false
        const availUnits = getAvailableCharImages(char, charModalGlobal.hideChar, charModalGlobal.fdChar, false, false);
        const allSrc = [];
        availUnits.forEach(u => { if (Array.isArray(u.srcList)) allSrc.push(...u.srcList); });
        const imgKey = `${game.id}-${char.id}`;
        if (!annualCharImgIndex.has(imgKey)) annualCharImgIndex.set(imgKey, 0);
        let imgIdx = annualCharImgIndex.get(imgKey);
        if (imgIdx >= allSrc.length) imgIdx = 0;
        const hasMultiImg = allSrc.length > 1;
        const currentImgSrc = getWebImageUrl(allSrc[imgIdx] || "");
        // ========== ✅补丁修改：搜索结果角色卡片名字切换（隐藏或FD开关任一开启） ==========
        const searchShowHide = getCharShowHide(char, charModalGlobal.hideChar, false, charModalGlobal.fdChar, false);
        const searchNameList = getCharNameList(char, searchShowHide);
        const searchTotalNames = searchNameList.length;
        const searchCanSwitchName = searchTotalNames > 1;
        if (!annualCharNameIndex.has(imgKey)) annualCharNameIndex.set(imgKey, 0);
        let searchNameIdx = annualCharNameIndex.get(imgKey);
        if (searchNameIdx >= searchTotalNames) searchNameIdx = 0;
        const searchDisplayName = searchNameList[searchNameIdx] || char.name;
        const searchNameMultiCls = searchCanSwitchName ? "char-name-multi" : "";
        const searchNameSwitchBtns = searchCanSwitchName ? `
            <button class="char-name-switch-btn char-name-switch-prev annual-search-name-prev" data-game-id="${game.id}" data-char-id="${char.id}">&lt;</button>
            <button class="char-name-switch-btn char-name-switch-next annual-search-name-next" data-game-id="${game.id}" data-char-id="${char.id}">&gt;</button>
        ` : "";
        // ========== 补丁结束 ==========
        div.innerHTML = `
            <div class="char-card-img-box ${hasMultiImg ? 'char-multi-img' : ''}">
                ${hasMultiImg ? `<button class="char-switch-btn char-switch-prev annual-search-img-prev" data-game-id="${game.id}" data-char-id="${char.id}">&lt;</button>` : ""}
                <img src="${currentImgSrc}" alt="${searchDisplayName}" decoding="async">
                ${hasMultiImg ? `<button class="char-switch-btn char-switch-next annual-search-img-next" data-game-id="${game.id}" data-char-id="${char.id}">&gt;</button>` : ""}
            </div>
            <div class="char-card-name-wrap">
                <div class="char-card-name ${searchNameMultiCls}">
                    ${searchNameSwitchBtns}
                    <span class="char-name-text">${searchDisplayName}</span>
                </div>
                <div class="char-card-game-sub">${game.name}</div>
            </div>
        `;
        if (hasMultiImg) {
            const imgEl = div.querySelector("img");
            const prevBtn = div.querySelector(".annual-search-img-prev");
            const nextBtn = div.querySelector(".annual-search-img-next");
            prevBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharImgIndex.get(imgKey) ?? 0;
                idx = idx - 1;
                if (idx < 0) idx = allSrc.length - 1;
                annualCharImgIndex.set(imgKey, idx);
                imgEl.src = getWebImageUrl(allSrc[idx] || "");
            });
            nextBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharImgIndex.get(imgKey) ?? 0;
                idx = idx + 1;
                if (idx >= allSrc.length) idx = 0;
                annualCharImgIndex.set(imgKey, idx);
                imgEl.src = getWebImageUrl(allSrc[idx] || "");
            });
        }
        // ========== ✅补丁新增：搜索结果名字切换事件 ==========
        if (searchCanSwitchName) {
            const nameTextEl = div.querySelector(".char-name-text");
            const namePrevBtn = div.querySelector(".annual-search-name-prev");
            const nameNextBtn = div.querySelector(".annual-search-name-next");
            namePrevBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharNameIndex.get(imgKey) ?? 0;
                idx = (idx - 1 + searchTotalNames) % searchTotalNames;
                annualCharNameIndex.set(imgKey, idx);
                nameTextEl.textContent = searchNameList[idx] || char.name;
            });
            nameNextBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharNameIndex.get(imgKey) ?? 0;
                idx = (idx + 1) % searchTotalNames;
                annualCharNameIndex.set(imgKey, idx);
                nameTextEl.textContent = searchNameList[idx] || char.name;
            });
        }
        // ========== 补丁结束 ==========
        div.addEventListener("click", ()=>{
            if(activeCharTopItemIndex === null) return;
            const isDuplicate = annualData.charTopList.some((item,i)=> i !== activeCharTopItemIndex && item.charId === char.id);
            if(isDuplicate){
                alert("该角色已经添加，不可重复添加");
                return;
            }
            const targetItem = annualData.charTopList[activeCharTopItemIndex];
            targetItem.gameId = game.id;
            targetItem.charId = char.id;
            // ✅补丁新增：保存用户当前选择的名字及索引
            const finalNameIdx = annualCharNameIndex.get(imgKey) ?? 0;
            targetItem.nameIndex = finalNameIdx;
            targetItem.charName = searchNameList[finalNameIdx] || char.name;
            // ✅使用当前选中的立绘索引
            const finalIdx = annualCharImgIndex.get(imgKey) ?? 0;
            targetItem.coverSrc = allSrc[finalIdx] || "";
            const charItemDoms = Array.from(document.querySelectorAll(".annual-char-top-item"));
            const targetDom = charItemDoms[activeCharTopItemIndex];
            if(targetDom){
                const nameEl = targetDom.querySelector(".annual-char-name-text");
                const imgEl = targetDom.querySelector(".annual-char-cover");
                nameEl.textContent = targetItem.charName;
                imgEl.src = getWebImageUrl(targetItem.coverSrc);
                refreshCharTopItemUi(targetDom, targetItem);
            }
            saveAnnualData();
            closeAnnualGlobalCharModal();
        });
        searchCharWrap.appendChild(div);
    }

    // 渲染匹配的游戏卡片，全部放入游戏子容器
    const gameList = gameTemplateList.filter(g=>matchedGames.has(g.id));
    const { sortFilterOptionList } = window.Core || {};
    let sortedGames = gameList;
    if (typeof sortFilterOptionList === 'function') {
        const sortedNames = sortFilterOptionList(gameList.map(g=>g.name));
        sortedGames = sortedNames.map(name=>gameList.find(g=>g.name===name)).filter(Boolean);
    } else {
        sortedGames = [...gameList].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    sortedGames.forEach((game) => {
        if (!game) return;
        const div = document.createElement("div");
        div.className = "game-option-item";
        div.innerHTML = renderGameSelectItem(game);
        div.addEventListener("click", () => {
            charModalCurrentGameId = game.id;
            // ✅补丁修改：统一重置局部开关（逻辑+DOM同步），防止跨游戏开关状态残留
            resetCharModalLocalSwitches();
            switchCharModalView("charList");
            renderCharModalCharList();
        });
        searchGameWrap.appendChild(div);
    });

    // 输出到外层wrap：角色块在上，游戏块在下，完全上下分开
    wrap.innerHTML = "";
    if(matchedCharacters.length > 0) {
        wrap.appendChild(searchCharWrap);
    }
    if(sortedGames.length > 0) {
        wrap.appendChild(searchGameWrap);
    }

    // 无结果提示
    if(matchedCharacters.length === 0 && matchedGames.size === 0){
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">未匹配到游戏或角色</div>`;
    }
}

/**
 * 角色弹窗：渲染当前游戏待选角色列表
 */
function renderCharModalCharList() {
    const modal = document.getElementById("annual-global-char-modal");
    const charWrap = modal.querySelector(".annual-global-char-char-list");
    charWrap.innerHTML = "";
    const state = getGameTemplateState_BaseOnly();
    const gameInfo = state.list.find(g=>g.id === charModalCurrentGameId);
    if(!gameInfo){
        charWrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">未找到该游戏数据</div>`;
        return;
    }
    // ========== ✅补丁新增：有相关角色才显示对应单独开关（复用FavList逻辑） ==========
    const rawCharList = gameInfo.charList || [];
    const localSwitchVisibility = {
        "#annual-modal-game-sub-char":   rawCharList.some(c => c.isSub === true),
        "#annual-modal-game-hide-char":  rawCharList.some(c => c.isHidden === true),
        "#annual-modal-game-fd-game":    rawCharList.some(c => c.isFD === true),
        "#annual-modal-game-fd-sub-char": rawCharList.some(c => c.isFdSub === true)
    };
    Object.entries(localSwitchVisibility).forEach(([sel, visible]) => {
        const inputEl = modal.querySelector(sel);
        if (!inputEl) return;
        const switchWrap = inputEl.closest("label")?.parentElement;
        if (switchWrap) switchWrap.style.display = visible ? "" : "none";
    });
    // ========== 补丁结束 ==========
    // 复制一套getAllGameChar过滤逻辑，使用弹窗本地开关，不碰appData
    let chars = [...rawCharList];
    chars = chars.filter(c=>{
        const isSub = c.isSub ?? false;
        const isHidden = !!c.isHidden;
        const isFD = !!c.isFD;
        const isFdSub = !!c.isFdSub;
        const showHide = charModalGlobal.hideChar || charModalLocal.hideChar;
        const showFD = charModalGlobal.fdChar || charModalLocal.fdChar;
        const showSub = charModalGlobal.subChar || charModalLocal.subChar;
        const showFdSub = charModalGlobal.fdSubChar || charModalLocal.fdSubChar;
        if (!isSub && !isHidden && !isFD && !isFdSub) return true;
        return (isSub && showSub) || (isHidden && showHide) || (isFD && showFD) || (isFdSub && showFdSub);
    });
    const { sortFilterOptionList } = window.Core || {};
    let sortedChars = chars;
    if (typeof sortFilterOptionList === 'function') {
        const sortedNames = sortFilterOptionList(chars.map(c=>c.name));
        sortedChars = sortedNames.map(name=>chars.find(c=>c.name===name)).filter(Boolean);
    } else {
        sortedChars = [...chars].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    sortedChars.forEach(char=>{
        if(!char) return;
        const div = document.createElement("div");
        div.className = "char-item";
        // ========== ✅补丁新增：多立绘切换逻辑（复用FavList char-switch-btn） ==========
        const allSrc = getAnnualCharAvailImages(char);
        const imgKey = `${charModalCurrentGameId}-${char.id}`;
        if (!annualCharImgIndex.has(imgKey)) annualCharImgIndex.set(imgKey, 0);
        let imgIdx = annualCharImgIndex.get(imgKey);
        if (imgIdx >= allSrc.length) imgIdx = 0;
        const hasMultiImg = allSrc.length > 1;
        const currentImgSrc = getWebImageUrl(allSrc[imgIdx] || "");
        // ========== ✅补丁修改：角色列表卡片名字切换（隐藏或FD开关任一开启） ==========
        const charListShowHide = getCharShowHide(char, charModalGlobal.hideChar, charModalLocal.hideChar, charModalGlobal.fdChar, charModalLocal.fdChar);
        const charNameList = getCharNameList(char, charListShowHide);
        const charTotalNames = charNameList.length;
        const charCanSwitchName = charTotalNames > 1;
        if (!annualCharNameIndex.has(imgKey)) annualCharNameIndex.set(imgKey, 0);
        let charNameIdx = annualCharNameIndex.get(imgKey);
        if (charNameIdx >= charTotalNames) charNameIdx = 0;
        const charDisplayName = charNameList[charNameIdx] || char.name;
        const charNameMultiCls = charCanSwitchName ? "char-name-multi" : "";
        const charNameSwitchBtns = charCanSwitchName ? `
            <button class="char-name-switch-btn char-name-switch-prev annual-char-name-prev" data-char-id="${char.id}">&lt;</button>
            <button class="char-name-switch-btn char-name-switch-next annual-char-name-next" data-char-id="${char.id}">&gt;</button>
        ` : "";
        // ========== 补丁结束 ==========
        div.innerHTML = `
            <div class="char-card-img-box ${hasMultiImg ? 'char-multi-img' : ''}">
                ${hasMultiImg ? `<button class="char-switch-btn char-switch-prev annual-char-img-prev" data-char-id="${char.id}">&lt;</button>` : ""}
                <img src="${currentImgSrc}" alt="${charDisplayName}" decoding="async">
                ${hasMultiImg ? `<button class="char-switch-btn char-switch-next annual-char-img-next" data-char-id="${char.id}">&gt;</button>` : ""}
            </div>
            <div class="char-card-name ${charNameMultiCls}">
                ${charNameSwitchBtns}
                <span class="char-name-text">${charDisplayName}</span>
            </div>
        `;
        // 切换按钮事件（阻止冒泡，避免触发角色选中）
        if (hasMultiImg) {
            const imgEl = div.querySelector("img");
            const prevBtn = div.querySelector(".annual-char-img-prev");
            const nextBtn = div.querySelector(".annual-char-img-next");
            prevBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharImgIndex.get(imgKey) ?? 0;
                idx = idx - 1;
                if (idx < 0) idx = allSrc.length - 1;
                annualCharImgIndex.set(imgKey, idx);
                imgEl.src = getWebImageUrl(allSrc[idx] || "");
            });
            nextBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharImgIndex.get(imgKey) ?? 0;
                idx = idx + 1;
                if (idx >= allSrc.length) idx = 0;
                annualCharImgIndex.set(imgKey, idx);
                imgEl.src = getWebImageUrl(allSrc[idx] || "");
            });
        }
        // ========== ✅补丁新增：角色列表名字切换事件 ==========
        if (charCanSwitchName) {
            const nameTextEl = div.querySelector(".char-name-text");
            const namePrevBtn = div.querySelector(".annual-char-name-prev");
            const nameNextBtn = div.querySelector(".annual-char-name-next");
            namePrevBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharNameIndex.get(imgKey) ?? 0;
                idx = (idx - 1 + charTotalNames) % charTotalNames;
                annualCharNameIndex.set(imgKey, idx);
                nameTextEl.textContent = charNameList[idx] || char.name;
            });
            nameNextBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let idx = annualCharNameIndex.get(imgKey) ?? 0;
                idx = (idx + 1) % charTotalNames;
                annualCharNameIndex.set(imgKey, idx);
                nameTextEl.textContent = charNameList[idx] || char.name;
            });
        }
        // ========== 补丁结束 ==========
        div.addEventListener("click",()=>{
            if(activeCharTopItemIndex === null) return;
            const isDuplicate = annualData.charTopList.some((item,i)=> i !== activeCharTopItemIndex && item.charId === char.id);
            if(isDuplicate){
                alert("该角色已经添加，不可重复添加");
                return;
            }
            const targetItem = annualData.charTopList[activeCharTopItemIndex];
            targetItem.gameId = charModalCurrentGameId;
            targetItem.charId = char.id;
            // ✅补丁新增：保存用户当前选择的名字及索引
            const finalNameIdx = annualCharNameIndex.get(imgKey) ?? 0;
            targetItem.nameIndex = finalNameIdx;
            targetItem.charName = charNameList[finalNameIdx] || char.name;
            // ✅使用当前选中的立绘索引，而非固定第一张
            const finalIdx = annualCharImgIndex.get(imgKey) ?? 0;
            targetItem.coverSrc = allSrc[finalIdx] || "";
            const charItemDoms = Array.from(document.querySelectorAll(".annual-char-top-item"));
            const targetDom = charItemDoms[activeCharTopItemIndex];
            if(targetDom){
                const nameEl = targetDom.querySelector(".annual-char-name-text");
                const imgEl = targetDom.querySelector(".annual-char-cover");
                nameEl.textContent = targetItem.charName;
                imgEl.src = getWebImageUrl(targetItem.coverSrc);
                refreshCharTopItemUi(targetDom, targetItem);
            }
            saveAnnualData();
            closeAnnualGlobalCharModal();
        });
        charWrap.appendChild(div);
    });
}

/**
 * 角色弹窗视图切换 gameList / charList
 * @param {string} mode
 */
function switchCharModalView(mode){
    charModalViewMode = mode;
    const modal = document.getElementById("annual-global-char-modal");
    const inner = modal.querySelector(".annual-global-modal-inner");
    const backBtn = modal.querySelector(".annual-modal-back-btn");
    // 清除旧视图class
    inner.classList.remove("char-modal-gamelist-view", "char-modal-charlist-view");

    if(mode === "gameList"){
        inner.classList.add("char-modal-gamelist-view");
        backBtn.style.display = "none";
    }else if(mode === "charList"){
        inner.classList.add("char-modal-charlist-view");
        backBtn.style.display = "flex";
    }
}

/**
 * 打开角色选择弹窗
 * @param {number} targetIndex charTopList下标 0/1/2
 */
function openAnnualGlobalCharModal(targetIndex){
    if(!_annualRealInitialized && isGameTemplateReady()){
        realInitAnnualModule();
    }
    activeCharTopItemIndex = targetIndex;
    const modal = document.getElementById("annual-global-char-modal");
    if(!modal) return;
    modal.classList.add("active");
    // 初始化弹窗状态
    charModalViewMode = "gameList";
    charModalCurrentGameId = null;
    charModalGlobal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    charModalLocal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    // ✅补丁新增：每次打开弹窗清空立绘索引缓存，避免上次选择残留
    annualCharImgIndex.clear();
    // ✅补丁新增：清空名字索引缓存
    annualCharNameIndex.clear();
    switchCharModalView("gameList");

    const searchInput = modal.querySelector(".annual-global-char-search-input");
    searchInput.value = "";
    searchInput.focus();
    // 重置开关DOM勾选（对齐HTML真实id）
    modal.querySelector("#annual-modal-global-sub-char").checked = false;
    modal.querySelector("#annual-modal-global-hide-char").checked = false;
    modal.querySelector("#annual-modal-global-fd-game").checked = false;
    const globalFdSubEl = modal.querySelector("#annual-modal-global-fd-sub-char");
    if (globalFdSubEl) globalFdSubEl.checked = false;
    modal.querySelector("#annual-modal-game-sub-char").checked = false;
    modal.querySelector("#annual-modal-game-hide-char").checked = false;
    modal.querySelector("#annual-modal-game-fd-game").checked = false;
    const localFdSubEl = modal.querySelector("#annual-modal-game-fd-sub-char");
    if (localFdSubEl) localFdSubEl.checked = false;

    renderCharModalGameList(modal.querySelector(".annual-global-char-game-list"), "");
}

/**
 * 关闭角色弹窗
 */
function closeAnnualGlobalCharModal(){
    // 用户取消选择时，清理残留的空条目
    if (activeCharTopItemIndex !== null) {
        const item = annualData.charTopList[activeCharTopItemIndex];
        if (item && !item.charId) {
            annualData.charTopList.splice(activeCharTopItemIndex, 1);
            rebuildCharTopDomAll();
            bindCharTop3Items();
            rerenderCharTopNoLabel();
            saveAnnualData();
        }
    }
    activeCharTopItemIndex = null;
    charModalViewMode = "gameList";
    charModalCurrentGameId = null;
    const modal = document.getElementById("annual-global-char-modal");
    if(!modal) return;
    modal.classList.remove("active");
}

/**
 * 打开年度全局游戏选择弹窗（游戏TOP3）
 */
function openAnnualGlobalGameModal(targetIndex){
    // 【修复】打开弹窗的时候再次尝试执行业务初始化，如果之前超时还没初始化完成
    if(!_annualRealInitialized && isGameTemplateReady()){
        realInitAnnualModule();
    }
    activeTopItemIndex = targetIndex;
    const modal = document.getElementById("annual-global-game-modal");
    if(!modal) return;
    modal.classList.add("active");
    const searchInput = modal.querySelector(".annual-global-search-input");
    const listWrap = modal.querySelector(".annual-global-game-list");
    searchInput.value = "";
    searchInput.focus();
    // 打开弹窗，再次校验模板状态
    renderGameList(listWrap, "");
}

/**
 * 关闭年度全局游戏选择弹窗
 */
function closeAnnualGlobalGameModal(){
    // 用户取消选择时，清理残留的空条目（防止NO跳号、排序横线异常）
    if (activeTopItemIndex !== null) {
        const item = annualData.topList[activeTopItemIndex];
        if (item && !item.gameId) {
            annualData.topList.splice(activeTopItemIndex, 1);
            rebuildGameTopDomAll();
            bindTop3Items();
            rerenderGameTopNoLabel();
            saveAnnualData();
        }
    }
    activeTopItemIndex = null;
    const modal = document.getElementById("annual-global-game-modal");
    if(!modal) return;
    modal.classList.remove("active");
}

function bindTop3Items() {
    const topItems = document.querySelectorAll(".annual-top-item");
    topItems.forEach((item, domIndex)=>{
        // domIndex：DOM遍历顺序 = 数组真实下标，不再读取data-rank做索引
        const dataItem = annualData.topList[domIndex];
        const nameTextEl = item.querySelector(".annual-game-name-text");
        const textarea = item.querySelector(".annual-top-textarea");
        const coverImg = item.querySelector(".annual-top-cover");

        nameTextEl.textContent = dataItem.gameName ?? "";
        textarea.value = dataItem.text ?? "";
        if(dataItem.coverSrc){
            coverImg.src = getWebImageUrl(dataItem.coverSrc);
        }
        refreshTopItemUi(item, dataItem);

        textarea.removeEventListener("input", textarea._inputHandler);
        textarea._inputHandler = ()=>{
            annualData.topList[domIndex].text = textarea.value;
            saveAnnualData();
        };
        textarea.addEventListener("input", textarea._inputHandler);
    });
}

function bindCharTop3Items() {
    const charItems = document.querySelectorAll(".annual-char-top-item");
    charItems.forEach((item, domIndex)=>{
        const dataItem = annualData.charTopList[domIndex];
        const nameTextEl = item.querySelector(".annual-char-name-text");
        const textarea = item.querySelector(".annual-char-textarea");
        const coverImg = item.querySelector(".annual-char-cover");

        nameTextEl.textContent = dataItem.charName ?? "";
        textarea.value = dataItem.text ?? "";
        if(dataItem.coverSrc){
            coverImg.src = getWebImageUrl(dataItem.coverSrc);
        }
        refreshCharTopItemUi(item, dataItem);

        textarea.removeEventListener("input", textarea._charInputHandler);
        textarea._charInputHandler = ()=>{
            annualData.charTopList[domIndex].text = textarea.value;
            saveAnnualData();
        };
        textarea.addEventListener("input", textarea._charInputHandler);
    });
}

/**
 * ✅新增：绑定カップルTOP全部条目（名称、双封面、感想框）
 */
function bindCpTop3Items() {
    const cpItems = document.querySelectorAll(".annual-cp-top-item");
    cpItems.forEach((item, domIndex)=>{
        const dataItem = annualData.cpTopList[domIndex];
        if(!dataItem) return;
        const nameTextEl = item.querySelector(".annual-cp-name-text");
        const textarea = item.querySelector(".annual-cp-textarea");
        const femaleImg = item.querySelector(".annual-cp-female-cover");
        const maleImg = item.querySelector(".annual-cp-male-cover");
        // ✅修改点9a：名称显示为"女角色×男角色"
        nameTextEl.textContent = `${dataItem.femaleName ?? ''}×${dataItem.maleName ?? ''}`;
        textarea.value = dataItem.text ?? "";
        if(dataItem.femaleCoverSrc) femaleImg.src = getWebImageUrl(dataItem.femaleCoverSrc);
        if(dataItem.maleCoverSrc) maleImg.src = getWebImageUrl(dataItem.maleCoverSrc);
        refreshCpTopItemUi(item, dataItem);
        textarea.removeEventListener("input", textarea._cpInputHandler);
        textarea._cpInputHandler = ()=>{
            annualData.cpTopList[domIndex].text = textarea.value;
            saveAnnualData();
        };
        textarea.addEventListener("input", textarea._cpInputHandler);
    });
}

/**
 * ✅新增：拖拽后，刷新游戏TOP全部NO.N标签文本（根据数组真实下标，不依赖data-rank）
 */
function rerenderGameTopNoLabel(){
    const items = Array.from(document.querySelectorAll(".annual-top-item"));
    items.forEach((dom, arrIdx)=>{
        const labelEl = dom.querySelector(".annual-top-label");
        labelEl.textContent = `NO.${arrIdx+1}`;
        dom.dataset.rank = String(arrIdx + 1); // 同步更新属性
    });
}
/**
 * ✅新增：拖拽后，刷新角色TOP全部NO.N标签文本
 */
function rerenderCharTopNoLabel(){
    const items = Array.from(document.querySelectorAll(".annual-char-top-item"));
    items.forEach((dom, arrIdx)=>{
        const labelEl = dom.querySelector(".annual-top-label");
        labelEl.textContent = `NO.${arrIdx+1}`;
        dom.dataset.rank = String(arrIdx + 1); //同步更新属性
    });
}

function rerenderCpTopNoLabel(){
    const items = Array.from(document.querySelectorAll(".annual-cp-top-item"));
    items.forEach((dom, arrIdx)=>{
        const labelEl = dom.querySelector(".annual-top-label");
        labelEl.textContent = `NO.${arrIdx+1}`;
        dom.dataset.rank = String(arrIdx + 1);
    });
}

/**
 * 【问题②】动态追加游戏TOP DOM条目，不限数量
 */
function appendNewGameTopDom(){
    const container = document.getElementById("annual-game-top-drag-container");
    const itemDom = document.createElement("div");
    itemDom.className = "annual-top-item";
    itemDom.dataset.dragType = "game-top";
    // 不写死NO.xxx、不写死data-rank，全部交给rerenderGameTopNoLabel
    itemDom.innerHTML = `
        <div class="annual-top-label-row hidden-when-empty">
            <div class="annual-top-label"></div>
            <div class="annual-game-name-text"></div>
            <button class="annual-item-delete-btn" data-type="game">×</button>
        </div>
        <div class="annual-top-content-row hidden-when-empty">
            <div class="annual-top-cover-wrap">
                <img class="annual-top-cover" alt="">
            </div>
            <div class="annual-top-text-wrap">
                <div class="annual-custom-text-wrap">
                    <textarea class="annual-top-textarea" placeholder="填写感想"></textarea>
                    <div class="resize-handle"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(itemDom);
    bindTop3Items();
    rerenderGameTopNoLabel();
}

/**
 * 【问题②】动态追加角色TOP DOM条目，不限数量
 */
function appendNewCharTopDom(){
    const container = document.getElementById("annual-char-top-drag-container");
    const itemDom = document.createElement("div");
    itemDom.className = "annual-char-top-item";
    itemDom.dataset.dragType = "char-top";
    itemDom.innerHTML = `
        <div class="annual-top-label-row hidden-when-empty">
            <div class="annual-top-label"></div>
            <div class="annual-char-name-text"></div>
            <button class="annual-item-delete-btn" data-type="char">×</button>
        </div>
        <div class="annual-char-top-content-row hidden-when-empty">
            <div class="annual-char-cover-wrap">
                <img class="annual-char-cover" alt="">
            </div>
            <div class="annual-char-text-wrap">
                <div class="annual-custom-text-wrap">
                    <textarea class="annual-char-textarea" placeholder="填写感想"></textarea>
                    <div class="resize-handle"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(itemDom);
    bindCharTop3Items();
    rerenderCharTopNoLabel();
}

/**
 * ✅新增：动态追加カップルTOP DOM条目
 */
function appendNewCpTopDom(){
    const container = document.getElementById("annual-cp-top-drag-container");
    const itemDom = document.createElement("div");
    itemDom.className = "annual-cp-top-item";
    itemDom.dataset.dragType = "cp-top";
    itemDom.innerHTML = `
        <div class="annual-top-label-row hidden-when-empty">
            <div class="annual-top-label"></div>
            <div class="annual-cp-name-text"></div>
            <button class="annual-item-delete-btn" data-type="cp">×</button>
        </div>
        <div class="annual-cp-top-content-row hidden-when-empty">
            <div class="annual-cp-cover-wrap">
                <img class="annual-cp-female-cover" alt="">
                <img class="annual-cp-male-cover" alt="">
            </div>
            <div class="annual-cp-text-wrap">
                <div class="annual-custom-text-wrap">
                    <textarea class="annual-cp-textarea" placeholder="填写感想"></textarea>
                    <div class="resize-handle"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(itemDom);
    bindCpTop3Items();
    rerenderCpTopNoLabel();
}

/**
 * 根据 topList 数组完整重建游戏TOP DOM，初始化使用
 */
function rebuildGameTopDomAll(){
    const container = document.getElementById("annual-game-top-drag-container");
    container.innerHTML = "";
    annualData.topList.forEach(()=>{
        appendNewGameTopDom();
    });
}

/**
 * 根据 charTopList 数组完整重建角色TOP DOM，初始化使用
 */
function rebuildCharTopDomAll(){
    const container = document.getElementById("annual-char-top-drag-container");
    container.innerHTML = "";
    annualData.charTopList.forEach(()=>{
        appendNewCharTopDom();
    });
}

function rebuildCpTopDomAll(){
    const container = document.getElementById("annual-cp-top-drag-container");
    if(!container) return;
    container.innerHTML = "";
    annualData.cpTopList.forEach(()=>{
        appendNewCpTopDom();
    });
}

// ==========【问题⑥】移动端触摸拖拽兼容（替代HTML5 draggable，解决移动端无反应） ==========
function bindTouchDrag(){
    // 游戏TOP触摸拖拽
    setupTouchSort("#annual-game-top-drag-container", annualData.topList, ()=>{
        bindTop3Items();
        rerenderGameTopNoLabel();
        saveAnnualData();
    });
    // 角色TOP触摸拖拽
    setupTouchSort("#annual-char-top-drag-container", annualData.charTopList, ()=>{
        bindCharTop3Items();
        rerenderCharTopNoLabel();
        saveAnnualData();
    });
    // ✅新增：CP TOP触摸拖拽
    setupTouchSort("#annual-cp-top-drag-container", annualData.cpTopList, ()=>{
        bindCpTop3Items();
        rerenderCpTopNoLabel();
        saveAnnualData();
    });
}

/**
 * 统一排序工具函数：PC鼠标 / Mobile触摸 共用
 * 行为：长按NO+名称行2000ms进入选中模式
 *  - 进入选中模式：源卡片外层卡片虚线#f6a5b8高亮；出现红色插入指示横线
 *  - 松手后可以自由滚动页面，鼠标hover卡片更新指示线位置，**第一次点击横线变色，第二次点击执行【移动插入splice】，不是交换**
 *  - 再次长按任意NO+名称行：退出选中模式，清除指示线、清除选中框，停止插入逻辑
 * @param {string} containerSel 容器选择器
 * @param {Array} dataArr 对应数据数组
 * @param {Function} afterSort 插入完成回调
 */
function setupTouchSort(containerSel, dataArr, afterSort){
    const container = document.querySelector(containerSel);
    if (!container) return;
    // -------- 内部状态 --------
    let pressTimer = null;
    let touchStartY = null;
    let touchStartX = null;
    // 选中锁定模式状态
    let selectedItem = null;
    let selectedIndex = null;
    // PC鼠标按下临时变量
    let mouseStartY = null;
    let mouseStartX = null;
    // ✅防止长按松手后立刻触发click误清除选中
    let selectCoolDown = false;
    let selectedFirstClickAfterEnter = false;

    // 清除选中状态、**销毁全部**插入指示线DOM
    function clearSelectState(){
        if(selectedItem){
            selectedItem.classList.remove("sort-selected-item");
            selectedItem.classList.remove("sort-lock-layout");
        }
        selectedItem = null;
        selectedIndex = null;
        selectCoolDown = false;
        selectedFirstClickAfterEnter = false;
        // 删除容器内所有横线DOM
        const allIndicators = Array.from(container.querySelectorAll(".sort-insert-indicator"));
        allIndicators.forEach(el=>{
            if(el.parentNode) el.parentNode.removeChild(el);
        });
    }

    /**
     * 进入排序模式：批量生成全部卡片之间的插入横线DOM
     * 每条横线挂载 dataset.beforeIndex：代表插入到第beforeIndex条卡片之前
     */
    function renderAllInsertIndicators() {
        if(!selectedItem) return;
        const items = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item,.annual-cp-top-item"));
        if(items.length === 0) return;
        // 统一创建横线的工厂函数（避免前后两处重复写onclick逻辑）
        function createIndicator(beforeIndex) {
            const indicatorDom = document.createElement("div");
            indicatorDom.className = "sort-insert-indicator";
            indicatorDom.dataset.beforeIndex = String(beforeIndex);
            indicatorDom.dataset.firstClick = "false";
            indicatorDom.onclick = function(){
                if(selectedIndex === null) return;
                const bIndex = Number(indicatorDom.dataset.beforeIndex);
                const isFirst = indicatorDom.dataset.firstClick === "true";
                if(!isFirst){
                    // 第一次点击：变红
                    indicatorDom.classList.add("active-hit");
                    indicatorDom.dataset.firstClick = "true";
                    return;
                }
                // 第二次点击：执行插入
                // 边界：选中条目已经就在目标位置，直接退出
                if(selectedIndex === bIndex || selectedIndex === bIndex -1){
                    clearSelectState();
                    return;
                }
                const temp = dataArr.splice(selectedIndex, 1)[0];
                const insertPos = (bIndex > selectedIndex) ? bIndex - 1 : bIndex;
                dataArr.splice(insertPos, 0, temp);
                afterSort();
                // 插入完成自动退出排序模式
                clearSelectState();
            };
            return indicatorDom;
        }
        // 循环：在每一个item前面插入指示线（beforeIndex = 0 ~ items.length-1）
        items.forEach((beforeItemDom, beforeIndex)=>{
            const indicatorDom = createIndicator(beforeIndex);
            beforeItemDom.parentNode.insertBefore(indicatorDom, beforeItemDom);
        });
        // ✅新增：在最后一个item后面追加一条横线（beforeIndex = items.length），支持插入到最后一位
        const lastIndicator = createIndicator(items.length);
        container.appendChild(lastIndicator);
    }

    // 长按1000ms进入锁定选中模式
    function enterSelectMode(itemDom, itemIndex){
        // 如果长按当前已经选中的条目：直接退出选中模式（需求：再次长按NO/封面退出）
        if(selectedItem === itemDom){
            clearSelectState();
            console.log("[sort] 退出选中模式");
            return;
        }
        if(selectedItem !== null){
            clearSelectState();
        }
        selectedItem = itemDom;
        selectedIndex = itemIndex;
        selectedItem.classList.add("sort-selected-item");
        selectedItem.classList.add("sort-lock-layout");
        console.log("[sort] 进入选中模式 index=", itemIndex);
        selectedFirstClickAfterEnter = true;
        selectCoolDown = true;
        setTimeout(()=>{
            selectCoolDown = false;
        },300);
        // ✅进入排序模式，批量生成全部卡片中间横线
        renderAllInsertIndicators();
    }

    // ============ 移动端 touch 事件 ============
    container.addEventListener("touchstart", (e) => {
        if(pressTimer !== null){
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        // 触发源：NO+名称行 / 内容封面区域
        const targetRow = e.target.closest(".annual-top-label-row, .annual-top-content-row, .annual-char-top-content-row, .annual-cp-top-content-row");
        if (!targetRow) {
            return;
        }
        const itemDom = targetRow.closest(".annual-top-item,.annual-char-top-item,.annual-cp-top-item");
        if (!itemDom) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }

        // ========= 新增判断：只在 NO标签 / 名称文本 / 封面图片 才执行 preventDefault =========
        const hitDragTrigger = !!e.target.closest(`
            .annual-top-label,
            .annual-game-name-text,
            .annual-char-name-text,
            .annual-cp-name-text,
            .annual-top-cover,
            .annual-char-cover,
            .annual-cp-female-cover,
            .annual-cp-male-cover
        `);
        // textarea、空白区域一律不阻止默认
        if(hitDragTrigger){
            e.preventDefault();
        }

        const touch = e.touches[0];
        touchStartY = touch.clientY;
        touchStartX = touch.clientX;
        const allItems = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item,.annual-cp-top-item"));
        const idx = allItems.indexOf(itemDom);
        pressTimer = setTimeout(() => {
            enterSelectMode(itemDom, idx);
        }, 1000);
    }, {passive: false});

    // ✅【重大修改】touchmove：**只处理还未触发长按阶段的移动阈值判断；进入选中模式后完全不操作指示线，删除updateIndicatorByPoint调用**
    container.addEventListener("touchmove", (e) => {
        if(pressTimer !== null && touchStartY !== null && touchStartX !== null){
            const touch = e.touches[0];
            const deltaY = Math.abs(touch.clientY - touchStartY);
            const deltaX = Math.abs(touch.clientX - touchStartX);
            if(deltaY > 12 || deltaX >12){
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }
        // 选中模式：不再做任何横线跟随移动逻辑；页面可以自由滑动
    }, { passive: true });

    container.addEventListener("touchend", () => {
        if(pressTimer !== null){
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        touchStartY = null;
        touchStartX = null;
    }, { passive: true });

    container.addEventListener("touchcancel", () => {
        if(pressTimer !== null){
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        touchStartY = null;
        touchStartX = null;
    }, { passive: true });

    // ============ PC鼠标 mousedown 长按1000ms逻辑 ============
    container.addEventListener("mousedown", (e)=>{
        const labelRow = e.target.closest(".annual-top-label-row, .annual-top-content-row, .annual-char-top-content-row, .annual-cp-top-content-row");
        if (!labelRow) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }
        const itemDom = labelRow.closest(".annual-top-item,.annual-char-top-item,.annual-cp-top-item");
        if (!itemDom) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        mouseStartY = e.clientY;
        mouseStartX = e.clientX;
        const allItems = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item,.annual-cp-top-item"));
        const idx = allItems.indexOf(itemDom);
        pressTimer = setTimeout(()=>{
            enterSelectMode(itemDom, idx);
        },1000);

        function onMouseMove(me){
            // mousemove：仅长按未触发时判断移动阈值；进入排序模式**彻底删除更新指示线逻辑**
            if(pressTimer !== null){
                const deltaY = Math.abs(me.clientY - mouseStartY);
                const deltaX = Math.abs(me.clientX - mouseStartX);
                if(deltaY>12 || deltaX>12){
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            }
        }
        function onMouseUp(){
            clearTimeout(pressTimer);
            pressTimer = null;
            mouseStartY = null;
            mouseStartX = null;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    // 容器内点击事件
    container.addEventListener("click", (e)=>{
        if(!selectedItem) return;
        if(selectCoolDown) return;
        // 如果点击对象是横线，onclick已经在DOM回调处理，此处直接return
        const clickIndicator = e.target.closest(".sort-insert-indicator");
        if(clickIndicator){
            return;
        }
        const clickItem = e.target.closest(".annual-top-item,.annual-char-top-item,.annual-cp-top-item");
        if(selectedFirstClickAfterEnter){
            selectedFirstClickAfterEnter = false;
            return;
        }
        // 点击空白 / 其他卡片，不会退出；只有再次长按NO/封面区域才退出（符合需求）
    });
}

/**
 * 更新滑块进度百分比
 * @param {HTMLInputElement} sliderEl
 */
function updateSliderProgress(sliderEl) {
    const min = Number(sliderEl.min);
    const max = Number(sliderEl.max);
    const val = Number(sliderEl.value);
    const percent = ((val - min) / (max - min)) * 100;
    const rowWrap = sliderEl.closest('.font-size-set-row');
    if(rowWrap){
        rowWrap.style.setProperty('--annual-slider-progress', `${percent}%`);
    }
}

/**
 * 从DOM读取年度报告各模块标题（去掉序号前缀）
 */
function getAnnualModuleTitles() {
    const cards = document.querySelectorAll('.mode-wrap[data-mode="annual"] .big-card');
    const titles = { stats: '', gameTop: '', charTop: '', cpTop: '' };
    const keys = ['stats', 'gameTop', 'charTop', 'cpTop'];
    cards.forEach((card, i) => {
        if (i >= keys.length) return;
        const h2 = card.querySelector('h2');
        if (!h2) return;
        // 去掉"数字+顿号"前缀，如"二、TOP" → "TOP"
        const raw = h2.textContent.trim();
        const cleaned = raw.replace(/^[一二三四五六七八九十\d]+[、.]\s*/, '');
        titles[keys[i]] = cleaned;
    });
    return titles;
}

/**
 * 年度报告导出面板绑定
 */
function bindAnnualExportPanel() {
    const btnResetColor = document.getElementById("annual-btn-reset-color");
    const colorBg = document.getElementById("annual-color-bg");
    const colorTitle = document.getElementById("annual-color-title");
    const colorGamename = document.getElementById("annual-color-gamename");
    const colorCustomtext = document.getElementById("annual-color-customtext");
    const colorBorder = document.getElementById("annual-color-border");
    const sliderFont = document.getElementById("annual-slider-custom-text-font");
    const fontValueDisplay = document.getElementById("annual-custom-text-font-value");
    const btnExportImage = document.getElementById("annual-btn-export-image");
    const canvasEl = document.getElementById("annual-export-canvas");
    const snapshotBox = document.getElementById("snapshot-container");

    if (!btnResetColor || !colorBg || !colorTitle || !colorGamename || !colorCustomtext || !colorBorder || !sliderFont || !fontValueDisplay || !btnExportImage || !canvasEl || !snapshotBox) {
        return;
    }

    colorBg.value = annualExportConfig.bg;
    colorTitle.value = annualExportConfig.title;
    colorGamename.value = annualExportConfig.gamename;
    colorCustomtext.value = annualExportConfig.customtext;
    colorBorder.value = annualExportConfig.border;
    sliderFont.value = annualExportConfig.customTextFontSize;
    fontValueDisplay.textContent = `${annualExportConfig.customTextFontSize}px`;
    updateSliderProgress(sliderFont);

    document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
    document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
    document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
    document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
    document.body.style.setProperty("--annual-export-border", annualExportConfig.border);

    btnResetColor.removeEventListener("click", btnResetColor._handler);
    btnResetColor._handler = () => {
        annualExportConfig = {...annualExportDefault};
        saveAnnualExportConfig();
        colorBg.value = annualExportConfig.bg;
        colorTitle.value = annualExportConfig.title;
        colorGamename.value = annualExportConfig.gamename;
        colorCustomtext.value = annualExportConfig.customtext;
        colorBorder.value = annualExportConfig.border;
        sliderFont.value = annualExportConfig.customTextFontSize;
        fontValueDisplay.textContent = `${annualExportConfig.customTextFontSize}px`;
        document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
        document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
        document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
        document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
        document.body.style.setProperty("--annual-export-border", annualExportConfig.border);
        updateSliderProgress(sliderFont);
    };
    btnResetColor.addEventListener("click", btnResetColor._handler);

    colorBg.oninput = () => {
        annualExportConfig.bg = colorBg.value;
        document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
        saveAnnualExportConfig();
    };
    colorTitle.oninput = () => {
        annualExportConfig.title = colorTitle.value;
        document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
        saveAnnualExportConfig();
    };
    colorGamename.oninput = () => {
        annualExportConfig.gamename = colorGamename.value;
        document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
        saveAnnualExportConfig();
    };
    colorCustomtext.oninput = () => {
        annualExportConfig.customtext = colorCustomtext.value;
        document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
        saveAnnualExportConfig();
    };
    colorBorder.oninput = () => {
        annualExportConfig.border = colorBorder.value;
        document.body.style.setProperty("--annual-export-border", annualExportConfig.border);
        saveAnnualExportConfig();
    };
    sliderFont.oninput = () => {
        const val = Number(sliderFont.value);
        annualExportConfig.customTextFontSize = val;
        fontValueDisplay.textContent = `${val}px`;
        updateSliderProgress(sliderFont);
        saveAnnualExportConfig();
    };

    // ========== 修改点3：导出按钮改为预览弹窗 ==========
    btnExportImage.removeEventListener("click", btnExportImage._handler);
    btnExportImage._handler = async () => {
        if (btnExportImage.disabled) return;
        const originalText = btnExportImage.textContent;
        btnExportImage.disabled = true;
        btnExportImage.textContent = "生成中…";

        const sizeRadio = document.querySelector('input[name="annual-export-size"]:checked');
        const sizeVal = sizeRadio?.value || 'long-810';
        const selectedExportWidth = Number(sizeVal.replace('long-', ''));
        // 修改点2：修复 designW 计算，不再除以 DPR
        const designW = selectedExportWidth;
        const titleMap = getAnnualModuleTitles();

        // 打开预览弹窗，先显示loading
        const modal = document.getElementById("export-preview-modal");
        const scrollWrap = modal.querySelector(".preview-scroll-wrap");
        const downloadBtn = document.getElementById("preview-download-btn");
        scrollWrap.innerHTML = `
            <div class="preview-inner-loading">
                <div class="loading-spinner"></div>
                <p>正在生成预览，请稍候…</p>
            </div>`;
        modal.classList.add("active");
        document.body.classList.add("modal-lock");
        downloadBtn.disabled = true;

        try {
            const results = await renderAllAnnualModules(designW, annualData, annualExportConfig, titleMap);
            if (!results || results.length === 0) {
                alert("没有可导出的内容，请先在各模块中添加数据。");
                modal.classList.remove("active");
                document.body.classList.remove("modal-lock");
                return;
            }
            // 填充预览图 + 绑定按钮
            showAnnualPreviewModal(results, selectedExportWidth);
        } catch (err) {
            console.error("年度报告导出失败", err);
            alert("导出失败：" + (err?.message || "未知错误") + "\n请打开控制台查看详情。");
            modal.classList.remove("active");
            document.body.classList.remove("modal-lock");
        } finally {
            btnExportImage.disabled = false;
            btnExportImage.textContent = originalText;
        }
    };
    btnExportImage.addEventListener("click", btnExportImage._handler);
}

// ===================== 年度报告预览弹窗管理（复用 #export-preview-modal） =====================
let _annualPreviewResults = [];
let _annualPreviewUrls = [];
let _annualPreviewWidth = 810;
let _annualPreviewBound = false;

function showAnnualPreviewModal(results, exportWidth) {
    _annualPreviewResults = results;
    _annualPreviewWidth = exportWidth;
    const modal = document.getElementById("export-preview-modal");
    const scrollWrap = modal.querySelector(".preview-scroll-wrap");
    const downloadBtn = document.getElementById("preview-download-btn");

    // 清理旧URL
    _annualPreviewUrls.forEach(u => URL.revokeObjectURL(u));
    _annualPreviewUrls = [];

    // 填充预览图片
    scrollWrap.innerHTML = "";
    results.forEach((r, i) => {
        const url = URL.createObjectURL(r.blob);
        _annualPreviewUrls.push(url);
        const img = document.createElement("img");
        img.src = url;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        img.style.margin = "0 auto 16px auto";
        img.style.borderRadius = "8px";
        img.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
        scrollWrap.appendChild(img);
    });
    downloadBtn.disabled = false;

    // 绑定弹窗按钮（只绑定一次）
    if (!_annualPreviewBound) {
        bindAnnualPreviewButtons();
        _annualPreviewBound = true;
    }
}

function bindAnnualPreviewButtons() {
    const closeBtn = document.getElementById("preview-close-btn");
    const regenBtn = document.getElementById("preview-regen-btn");
    const downloadBtn = document.getElementById("preview-download-btn");
    const modal = document.getElementById("export-preview-modal");

    // 关闭
    closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
        document.body.classList.remove("modal-lock");
        _annualPreviewUrls.forEach(u => URL.revokeObjectURL(u));
        _annualPreviewUrls = [];
        _annualPreviewResults = [];
    });

    // 遮罩点击关闭
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeBtn.click();
    });

    // 重新生成
    regenBtn.addEventListener("click", async () => {
        const scrollWrap = modal.querySelector(".preview-scroll-wrap");
        scrollWrap.innerHTML = `
            <div class="preview-inner-loading">
                <div class="loading-spinner"></div>
                <p>正在生成预览，请稍候…</p>
            </div>`;
        downloadBtn.disabled = true;
        try {
            const sizeRadio = document.querySelector('input[name="annual-export-size"]:checked');
            const sizeVal = sizeRadio?.value || 'long-810';
            const selectedExportWidth = Number(sizeVal.replace('long-', ''));
            const designW = selectedExportWidth;
            const titleMap = getAnnualModuleTitles();
            const results = await renderAllAnnualModules(designW, annualData, annualExportConfig, titleMap);
            if (!results || results.length === 0) {
                alert("没有可导出的内容。");
                return;
            }
            showAnnualPreviewModal(results, selectedExportWidth);
        } catch (err) {
            console.error("重新生成失败", err);
            alert("重新生成失败：" + (err?.message || "未知错误"));
        }
    });

    // 导出图片（下载所有模块）
    downloadBtn.addEventListener("click", () => {
        _annualPreviewResults.forEach((r, i) => {
            const url = URL.createObjectURL(r.blob);
            const a = document.createElement("a");
            a.download = `Annual_${r.moduleType}_${_annualPreviewWidth}.png`;
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
    });
}

function bindAnnualExport() {
    btnAnnualExport = document.getElementById("btn-annual-export");
    if(!btnAnnualExport) return;
    btnAnnualExport.removeEventListener("click", btnAnnualExport._clickHandler);
    btnAnnualExport._clickHandler = async ()=>{
        const snapshotBox = document.getElementById("snapshot-container");
        const annualWrap = document.querySelector(".mode-wrap[data-mode='annual']");
        snapshotBox.innerHTML = annualWrap.innerHTML;
        snapshotBox.classList.add("export-snapshot");
        try {
            const canvas = await html2canvas(snapshotBox, {
                useCORS:true,
                scale:2,
                backgroundColor: annualExportConfig.bg
            });
            const link = document.createElement("a");
            link.download = "Otome-Annual-Report.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch(err) {
            console.error("Annual Report导出失败", err);
        } finally {
            snapshotBox.innerHTML = "";
            snapshotBox.classList.remove("export-snapshot");
        }
    };
    btnAnnualExport.addEventListener("click", btnAnnualExport._clickHandler);
}

/**
 * ✅新增：annual模式悬浮滚动按钮逻辑
 * ▲：模块中间→滚到当前模块顶部；已在顶部→滚到上一个模块顶部
 * ▼：模块中间→滚到当前模块底部；已在底部→滚到下一个模块底部
 */
function bindAnnualFloatScrollButtons() {
    const upBtn = document.getElementById("annual-back-to-top-btn");
    const downBtn = document.getElementById("annual-scroll-to-bottom-btn");
    if(!upBtn || !downBtn) return;

    const TOLERANCE = 30; // 容差像素，小于此值视为"已到达"

    // 获取annual模式所有big-card模块（按DOM顺序）
    function getAnnualModules() {
        const wrap = document.querySelector('.mode-wrap[data-mode="annual"]');
        if(!wrap) return [];
        return Array.from(wrap.querySelectorAll('.big-card'));
    }

    // 根据视口垂直中心判断当前在哪个模块
    function getCurrentModuleIndex() {
        const modules = getAnnualModules();
        if(modules.length === 0) return -1;
        const viewCenter = window.scrollY + window.innerHeight / 2;
        // 优先：视口中心落在某个模块范围内
        for(let i = 0; i < modules.length; i++) {
            const rect = modules[i].getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const bottom = rect.bottom + window.scrollY;
            if(viewCenter >= top && viewCenter <= bottom) return i;
        }
        // 兜底：视口中心在模块间隙中，找距离最近的模块
        let closest = 0;
        let minDist = Infinity;
        for(let i = 0; i < modules.length; i++) {
            const rect = modules[i].getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const dist = Math.abs(viewCenter - top);
            if(dist < minDist) { minDist = dist; closest = i; }
        }
        return closest;
    }

    // ▲按钮
    upBtn.addEventListener("click", () => {
        const modules = getAnnualModules();
        if(modules.length === 0) return;
        const idx = getCurrentModuleIndex();
        if(idx < 0) return;
        const currentTop = modules[idx].getBoundingClientRect().top + window.scrollY;

        if(window.scrollY > currentTop + TOLERANCE) {
            // 在模块中间：滚动到当前模块顶部
            modules[idx].scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            // 已在当前模块顶部：滚动到上一个模块顶部
            if(idx > 0) {
                modules[idx - 1].scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                // 已是第一个模块：滚动到页面最顶
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }
    });

    // ▼按钮
    downBtn.addEventListener("click", () => {
        const modules = getAnnualModules();
        if(modules.length === 0) return;
        const idx = getCurrentModuleIndex();
        if(idx < 0) return;
        const currentBottom = modules[idx].getBoundingClientRect().bottom + window.scrollY;
        const viewBottom = window.scrollY + window.innerHeight;

        if(viewBottom < currentBottom - TOLERANCE) {
            // 在模块中间：滚动到当前模块底部（元素底部对齐视口底部）
            modules[idx].scrollIntoView({ behavior: "smooth", block: "end" });
        } else {
            // 已在当前模块底部：滚动到下一个模块底部
            if(idx < modules.length - 1) {
                modules[idx + 1].scrollIntoView({ behavior: "smooth", block: "end" });
            }
            // 已是最后一个模块：不动作
        }
    });
}

/**
 * ✅新增：CP弹窗游戏列表（只搜索游戏名，不搜索角色名）
 */
function renderCpModalGameList(wrap, keyword) {
    wrap.innerHTML = "";
    const state = getGameTemplateState_BaseOnly();
    const gameTemplateList = state.list;
    if (!gameTemplateList || !isGameTemplateReady()) {
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">游戏模板尚未加载完成，请稍后再试</div>`;
        return;
    }
    const kw = (keyword ?? "").toLowerCase().trim();
    const filtered = gameTemplateList.filter(g=> !kw || String(g.name).toLowerCase().includes(kw));
    const { sortFilterOptionList } = window.Core || {};
    let sorted;
    if (typeof sortFilterOptionList === 'function') {
        const sortedNames = sortFilterOptionList(filtered.map(g=>g.name));
        sorted = sortedNames.map(name=>filtered.find(g=>g.name===name)).filter(Boolean);
    } else {
        sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    sorted.forEach((game) => {
        if (!game) return;
        const div = document.createElement("div");
        div.className = "annual-cp-game-option-item";
        div.innerHTML = renderGameSelectItem(game);
        div.addEventListener("click", (e) => {
            // ✅阻止同一元素上script.js设置的onclick，以及冒泡到document的事件委托
            e.stopImmediatePropagation();
            cpModalCurrentGameId = game.id;
            cpModalCurrentFemaleId = null;
            resetCpModalLocalSwitches();
            switchCpModalView("femaleList");
            renderCpModalFemaleList();
        });
        wrap.appendChild(div);
    });
    if(sorted.length === 0){
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">未匹配到游戏</div>`;
    }
}

/**
 * ✅新增：CP弹窗女主列表（点击女主展开男主列表，点击男主保存并关闭弹窗）
 */
function renderCpModalFemaleList() {
    const modal = document.getElementById("annual-global-cp-modal");
    const charWrap = modal.querySelector(".annual-global-cp-female-list");
    charWrap.innerHTML = "";
    const state = getGameTemplateState_BaseOnly();
    const gameInfo = state.list.find(g=>g.id === cpModalCurrentGameId);
    if(!gameInfo){
        charWrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">未找到该游戏数据</div>`;
        return;
    }
    const rawCharList = gameInfo.charList || [];

    // 局部开关显隐控制
    const visMap = {
        "#annual-modal-cp-game-sub-char":   rawCharList.some(c => c.isSub === true),
        "#annual-modal-cp-game-hide-char":  rawCharList.some(c => c.isHidden === true),
        "#annual-modal-cp-game-fd-game":    rawCharList.some(c => c.isFD === true),
        "#annual-modal-cp-game-fd-sub-char": rawCharList.some(c => c.isFdSub === true)
    };
    Object.entries(visMap).forEach(([sel, visible]) => {
        const inputEl = modal.querySelector(sel);
        if (!inputEl) return;
        const sw = inputEl.closest("label")?.parentElement;
        if (sw) sw.style.display = visible ? "" : "none";
    });

    // 过滤角色（同角色弹窗逻辑）
    let chars = [...rawCharList].filter(c=>{
        const isSub = c.isSub ?? false, isHidden = !!c.isHidden, isFD = !!c.isFD, isFdSub = !!c.isFdSub;
        const showHide = cpModalGlobal.hideChar || cpModalLocal.hideChar;
        const showFD = cpModalGlobal.fdChar || cpModalLocal.fdChar;
        const showSub = cpModalGlobal.subChar || cpModalLocal.subChar;
        const showFdSub = cpModalGlobal.fdSubChar || cpModalLocal.fdSubChar;
        if (!isSub && !isHidden && !isFD && !isFdSub) return true;
        return (isSub && showSub) || (isHidden && showHide) || (isFD && showFD) || (isFdSub && showFdSub);
    });
    const femaleChars = chars.filter(c => c.gender === "female");
    const maleChars = chars.filter(c => c.gender === "male");
    const { sortFilterOptionList } = window.Core || {};
    const sortByName = (arr) => {
        if (typeof sortFilterOptionList === 'function') {
            const sn = sortFilterOptionList(arr.map(c=>c.name));
            return sn.map(name=>arr.find(c=>c.name===name)).filter(Boolean);
        }
        return [...arr].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    };
    const sortedFemales = sortByName(femaleChars);
    const sortedMales = sortByName(maleChars);

    // 工具：渲染单个角色卡片HTML（女主/男主共用）
    function renderCharCardHtml(char, imgKey, allSrc, nameList, totalNames, nameIdx, displayName,
                                 imgPrevCls, imgNextCls, namePrevCls, nameNextCls, cardClass) {
        const hasMultiImg = allSrc.length > 1;
        const canSwitchName = totalNames > 1;
        const nameMultiCls = canSwitchName ? "annual-cp-char-name-multi" : "";
        const nameSwitchBtns = canSwitchName ? `
            <button class="annual-cp-char-name-switch-btn annual-cp-char-name-switch-prev ${namePrevCls}" data-char-id="${char.id}">&lt;</button>
            <button class="annual-cp-char-name-switch-btn annual-cp-char-name-switch-next ${nameNextCls}" data-char-id="${char.id}">&gt;</button>` : "";
        return `
            <div class="annual-cp-char-card-img-box ${hasMultiImg ? 'annual-cp-char-multi-img' : ''}">
                ${hasMultiImg ? `<button class="annual-cp-char-switch-btn annual-cp-char-switch-prev ${imgPrevCls}" data-char-id="${char.id}">&lt;</button>` : ""}
                <img src="${getWebImageUrl(allSrc[annualCpImgIndex.get(imgKey)] || "")}" alt="${displayName}" decoding="async">
                ${hasMultiImg ? `<button class="annual-cp-char-switch-btn annual-cp-char-switch-next ${imgNextCls}" data-char-id="${char.id}">&gt;</button>` : ""}
            </div>
            <div class="${cardClass === 'female' ? 'annual-cp-female-name' : 'annual-cp-char-card-name'} ${nameMultiCls}">
                ${nameSwitchBtns}
                <span class="annual-cp-char-name-text">${displayName}</span>
            </div>`;
    }

    // 工具：绑定立绘切换
    function bindImgSwitch(cardEl, imgKey, allSrc, prevSel, nextSel) {
        const imgEl = cardEl.querySelector("img");
        cardEl.querySelector(prevSel)?.addEventListener("click", (e)=>{
            e.stopPropagation();
            let idx = annualCpImgIndex.get(imgKey) ?? 0;
            idx = idx <= 0 ? allSrc.length - 1 : idx - 1;
            annualCpImgIndex.set(imgKey, idx);
            imgEl.src = getWebImageUrl(allSrc[idx] || "");
        });
        cardEl.querySelector(nextSel)?.addEventListener("click", (e)=>{
            e.stopPropagation();
            let idx = annualCpImgIndex.get(imgKey) ?? 0;
            idx = idx >= allSrc.length - 1 ? 0 : idx + 1;
            annualCpImgIndex.set(imgKey, idx);
            imgEl.src = getWebImageUrl(allSrc[idx] || "");
        });
    }

    // 工具：绑定名字切换
    function bindNameSwitch(cardEl, imgKey, nameList, totalNames, prevSel, nextSel) {
        const nameEl = cardEl.querySelector(".annual-cp-char-name-text");
        cardEl.querySelector(prevSel)?.addEventListener("click", (e)=>{
            e.stopPropagation();
            let idx = annualCpNameIndex.get(imgKey) ?? 0;
            idx = (idx - 1 + totalNames) % totalNames;
            annualCpNameIndex.set(imgKey, idx);
            nameEl.textContent = nameList[idx] || "";
        });
        cardEl.querySelector(nextSel)?.addEventListener("click", (e)=>{
            e.stopPropagation();
            let idx = annualCpNameIndex.get(imgKey) ?? 0;
            idx = (idx + 1) % totalNames;
            annualCpNameIndex.set(imgKey, idx);
            nameEl.textContent = nameList[idx] || "";
        });
    }

    // 渲染每个女主
    sortedFemales.forEach(fChar=>{
        if(!fChar) return;
        const fImgKey = `${cpModalCurrentGameId}-${fChar.id}`;
        if (!annualCpImgIndex.has(fImgKey)) annualCpImgIndex.set(fImgKey, 0);
        if (!annualCpNameIndex.has(fImgKey)) annualCpNameIndex.set(fImgKey, 0);
        const fAllSrc = getAnnualCpAvailImages(fChar);
        let fImgIdx = annualCpImgIndex.get(fImgKey);
        if (fImgIdx >= fAllSrc.length) fImgIdx = 0;
        const fShowHide = getCharShowHide(fChar, cpModalGlobal.hideChar, cpModalLocal.hideChar, cpModalGlobal.fdChar, cpModalLocal.fdChar);
        const fNameList = getCharNameList(fChar, fShowHide);
        const fTotalNames = fNameList.length;
        let fNameIdx = annualCpNameIndex.get(fImgKey);
        if (fNameIdx >= fTotalNames) fNameIdx = 0;
        const fDisplayName = fNameList[fNameIdx] || fChar.name;
        const isFemaleSelected = cpModalCurrentFemaleId === fChar.id;

        // ✅修改点8：blockDiv添加条件类，展开时使用annual-cp-female-block-expanded
        const blockDiv = document.createElement("div");
        blockDiv.className = `annual-cp-female-block ${isFemaleSelected ? 'annual-cp-female-block-expanded' : ''}`;
        blockDiv.dataset.fid = fChar.id;

        const femaleCard = document.createElement("div");
        femaleCard.className = `annual-cp-female-card-btn annual-cp-female-card ${isFemaleSelected ? 'selected' : ''}`;
        femaleCard.dataset.fid = fChar.id;
        femaleCard.dataset.charId = fChar.id;
        femaleCard.dataset.gameId = cpModalCurrentGameId;
        femaleCard.dataset.totalImg = fAllSrc.length;
        femaleCard.innerHTML = renderCharCardHtml(fChar, fImgKey, fAllSrc, fNameList, fTotalNames, fNameIdx, fDisplayName,
            "annual-cp-female-img-prev", "annual-cp-female-img-next",
            "annual-cp-name-prev", "annual-cp-name-next", "female");
        blockDiv.appendChild(femaleCard);

        // 女主点击：展开/收起男主列表
        femaleCard.addEventListener("click", (e)=>{
            // ✅阻止冒泡到script.js的全局事件委托
            e.stopPropagation();
            if(e.target.closest(".annual-cp-char-switch-btn, .annual-cp-char-name-switch-btn")) return;
            cpModalCurrentFemaleId = isFemaleSelected ? null : fChar.id;
            renderCpModalFemaleList();
        });
        if(fAllSrc.length > 1) bindImgSwitch(femaleCard, fImgKey, fAllSrc, ".annual-cp-female-img-prev", ".annual-cp-female-img-next");
        if(fTotalNames > 1) bindNameSwitch(femaleCard, fImgKey, fNameList, fTotalNames, ".annual-cp-name-prev", ".annual-cp-name-next");

        // 选中女主时渲染男主列表
        if(isFemaleSelected){
            const maleWrap = document.createElement("div");
            maleWrap.className = "annual-cp-male-select-wrap";
            maleWrap.dataset.fid = fChar.id;
            let maleListHtml = `<div class="annual-cp-male-title">为【${fChar.name}】选择角色</div><div class="annual-cp-male-list">`;
            sortedMales.forEach(mChar=>{
                if(!mChar) return;
                const mImgKey = `${cpModalCurrentGameId}-${mChar.id}`;
                if (!annualCpImgIndex.has(mImgKey)) annualCpImgIndex.set(mImgKey, 0);
                if (!annualCpNameIndex.has(mImgKey)) annualCpNameIndex.set(mImgKey, 0);
                const mAllSrc = getAnnualCpAvailImages(mChar);
                let mImgIdx = annualCpImgIndex.get(mImgKey);
                if (mImgIdx >= mAllSrc.length) mImgIdx = 0;
                const mShowHide = getCharShowHide(mChar, cpModalGlobal.hideChar, cpModalLocal.hideChar, cpModalGlobal.fdChar, cpModalLocal.fdChar);
                const mNameList = getCharNameList(mChar, mShowHide);
                const mTotalNames = mNameList.length;
                let mNameIdx = annualCpNameIndex.get(mImgKey);
                if (mNameIdx >= mTotalNames) mNameIdx = 0;
                const mDisplayName = mNameList[mNameIdx] || mChar.name;
                maleListHtml += `
                <div class="annual-cp-male-item-btn annual-cp-male-item" data-fid="${fChar.id}" data-mid="${mChar.id}"
                     data-char-id="${mChar.id}" data-game-id="${cpModalCurrentGameId}" data-total-img="${mAllSrc.length}">
                    ${renderCharCardHtml(mChar, mImgKey, mAllSrc, mNameList, mTotalNames, mNameIdx, mDisplayName,
                        "annual-cp-male-img-prev", "annual-cp-male-img-next",
                        "annual-cp-name-prev", "annual-cp-name-next", "male")}
                </div>`;
            });
            maleListHtml += `</div>`;
            maleWrap.innerHTML = maleListHtml;
            blockDiv.appendChild(maleWrap);

            // 绑定男主立绘/名字切换 + 点击保存
            maleWrap.querySelectorAll(".annual-cp-male-item-btn").forEach(maleItem=>{
                const mCharId = maleItem.dataset.mid;
                const mChar = sortedMales.find(c=>c.id === mCharId);
                if(!mChar) return;
                const mImgKey = `${cpModalCurrentGameId}-${mCharId}`;
                const mAllSrc = getAnnualCpAvailImages(mChar);
                const mShowHide = getCharShowHide(mChar, cpModalGlobal.hideChar, cpModalLocal.hideChar, cpModalGlobal.fdChar, cpModalLocal.fdChar);
                const mNameList = getCharNameList(mChar, mShowHide);
                const mTotalNames = mNameList.length;
                if(mAllSrc.length > 1) bindImgSwitch(maleItem, mImgKey, mAllSrc, ".annual-cp-male-img-prev", ".annual-cp-male-img-next");
                if(mTotalNames > 1) bindNameSwitch(maleItem, mImgKey, mNameList, mTotalNames, ".annual-cp-name-prev", ".annual-cp-name-next");

                // 男主点击：保存CP，关闭弹窗
                maleItem.addEventListener("click", (e)=>{
                    // ✅阻止冒泡到script.js的全局事件委托
                    e.stopPropagation();
                    if(e.target.closest(".annual-cp-char-switch-btn, .annual-cp-char-name-switch-btn")) return;
                    if(activeCpTopItemIndex === null) return;
                    const isDup = annualData.cpTopList.some((item,i)=>
                        i !== activeCpTopItemIndex &&
                        item.gameId === cpModalCurrentGameId &&
                        item.femaleId === fChar.id &&
                        item.maleId === mCharId);
                    if(isDup){ alert("该CP已经添加，不可重复添加"); return; }
                    const targetItem = annualData.cpTopList[activeCpTopItemIndex];
                    targetItem.gameId = cpModalCurrentGameId;
                    targetItem.gameName = gameInfo.name;
                    targetItem.femaleId = fChar.id;
                    targetItem.femaleName = fNameList[annualCpNameIndex.get(fImgKey) ?? 0] || fChar.name;
                    targetItem.femaleCoverSrc = fAllSrc[annualCpImgIndex.get(fImgKey) ?? 0] || "";
                    targetItem.maleId = mCharId;
                    targetItem.maleName = mNameList[annualCpNameIndex.get(mImgKey) ?? 0] || mChar.name;
                    targetItem.maleCoverSrc = mAllSrc[annualCpImgIndex.get(mImgKey) ?? 0] || "";
                    const doms = Array.from(document.querySelectorAll(".annual-cp-top-item"));
                    const targetDom = doms[activeCpTopItemIndex];
                    if(targetDom){
                        targetDom.querySelector(".annual-cp-name-text").textContent = `${targetItem.femaleName}×${targetItem.maleName}`; // ✅修改点9b
                        targetDom.querySelector(".annual-cp-female-cover").src = getWebImageUrl(targetItem.femaleCoverSrc);
                        targetDom.querySelector(".annual-cp-male-cover").src = getWebImageUrl(targetItem.maleCoverSrc);
                        refreshCpTopItemUi(targetDom, targetItem);
                    }
                    saveAnnualData();
                    closeAnnualGlobalCpModal();
                });
            });
        }
        charWrap.appendChild(blockDiv);
    });

    if(sortedFemales.length === 0){
        charWrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">该游戏暂无可用女主角</div>`;
    }
}

function switchCpModalView(mode){
    cpModalViewMode = mode;
    const modal = document.getElementById("annual-global-cp-modal");
    const inner = modal.querySelector(".annual-global-modal-inner");
    const backBtn = modal.querySelector(".annual-cp-modal-back-btn");
    inner.classList.remove("cp-modal-gamelist-view", "cp-modal-femalelist-view");
    if(mode === "gameList"){
        inner.classList.add("cp-modal-gamelist-view");
        backBtn.style.display = "none";
    }else{
        inner.classList.add("cp-modal-femalelist-view");
        backBtn.style.display = "flex";
    }
}

function openAnnualGlobalCpModal(targetIndex){
    if(!_annualRealInitialized && isGameTemplateReady()) realInitAnnualModule();
    activeCpTopItemIndex = targetIndex;
    const modal = document.getElementById("annual-global-cp-modal");
    if(!modal) return;
    modal.classList.add("active");
    cpModalViewMode = "gameList";
    cpModalCurrentGameId = null;
    cpModalCurrentFemaleId = null;
    cpModalGlobal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    cpModalLocal = { subChar:false, hideChar:false, fdChar:false, fdSubChar:false };
    annualCpImgIndex.clear();
    annualCpNameIndex.clear();
    switchCpModalView("gameList");
    const searchInput = modal.querySelector(".annual-global-cp-search-input");
    searchInput.value = "";
    searchInput.focus();
    ["#annual-modal-cp-global-sub-char","#annual-modal-cp-global-hide-char",
     "#annual-modal-cp-global-fd-game","#annual-modal-cp-global-fd-sub-char",
     "#annual-modal-cp-game-sub-char","#annual-modal-cp-game-hide-char",
     "#annual-modal-cp-game-fd-game","#annual-modal-cp-game-fd-sub-char"].forEach(sel=>{
        const el = modal.querySelector(sel); if(el) el.checked = false;
    });
    renderCpModalGameList(modal.querySelector(".annual-global-cp-game-list"), "");
}

function closeAnnualGlobalCpModal(){
    // 用户取消选择时，清理残留的空条目
    if (activeCpTopItemIndex !== null) {
        const item = annualData.cpTopList[activeCpTopItemIndex];
        if (item && (!item.femaleId || !item.maleId)) {
            annualData.cpTopList.splice(activeCpTopItemIndex, 1);
            rebuildCpTopDomAll();
            bindCpTop3Items();
            rerenderCpTopNoLabel();
            saveAnnualData();
        }
    }
    activeCpTopItemIndex = null;
    cpModalViewMode = "gameList";
    cpModalCurrentGameId = null;
    cpModalCurrentFemaleId = null;
    const modal = document.getElementById("annual-global-cp-modal");
    if(!modal) return;
    modal.classList.remove("active");
}

/**
 * 真正执行年度模块业务初始化（必须等gameTemplateReady=true）
 */
function realInitAnnualModule(){
    if(_annualRealInitialized) return;
    _annualRealInitialized = true;
    console.log("✅[annual.js] realInitAnnualModule 游戏模板就绪，执行业务初始化");
    loadAnnualData();
    // 清理历史残留的空条目（修复旧数据导致的NO跳号、排序横线异常）
    annualData.topList = (annualData.topList || []).filter(item => item && item.gameId);
    annualData.charTopList = (annualData.charTopList || []).filter(item => item && item.charId);
    annualData.cpTopList = (annualData.cpTopList || []).filter(item => item && item.femaleId && item.maleId);
    saveAnnualData();
    bindStatInputs();
    // 从localStorage读取数据后，完全重建DOM，保证DOM数量与数组长度完全一致
    rebuildGameTopDomAll();
    rebuildCharTopDomAll();
    rebuildCpTopDomAll();  // ✅新增
    bindTop3Items();
    bindCharTop3Items();
    bindCpTop3Items();  // ✅新增
    bindTouchDrag();
    bindAnnualExport();
    bindAnnualExportPanel();
    bindAnnualFloatScrollButtons();  // ✅新增：悬浮滚动按钮
    // 如果游戏弹窗打开刷新列表
    const modalGame = document.getElementById("annual-global-game-modal");
    if(modalGame && modalGame.classList.contains("active")){
        const listWrap = modalGame.querySelector(".annual-global-game-list");
        const searchInput = modalGame.querySelector(".annual-global-search-input");
        renderGameList(listWrap, searchInput?.value ?? "");
    }
    // 如果角色弹窗打开刷新
    const modalChar = document.getElementById("annual-global-char-modal");
    if(modalChar && modalChar.classList.contains("active")){
        const gameWrap = modalChar.querySelector(".annual-global-char-game-list");
        const searchInput = modalChar.querySelector(".annual-global-char-search-input");
        renderCharModalGameList(gameWrap, searchInput?.value ?? "");
    }
}

export function initAnnualModule(){
    if(!window._annualPanelClickBound){
        document.addEventListener("click",(e)=>{
            // ========== ✅修改：全局板块添加游戏按钮，不再使用item内部按钮 ==========
            const globalAddGameBtn = e.target.closest("#annual-global-add-game-btn");
            if(globalAddGameBtn){
                //【问题②】不限数量：直接push空对象，不再依赖固定3个数组空位；【问题①】彻底解决离散空位NO1/NO3有值NO2空
                const newIndex = annualData.topList.length;
                annualData.topList.push({ gameId: "", gameName: "", coverSrc: "", text: "" });
                saveAnnualData();
                // 新增DOM条目
                appendNewGameTopDom();
                openAnnualGlobalGameModal(newIndex);
                return;
            }
            // ========== ✅修改：全局板块添加角色按钮 ==========
            const globalAddCharBtn = e.target.closest("#annual-global-add-char-btn");
            if(globalAddCharBtn){
                const newIndex = annualData.charTopList.length;
                annualData.charTopList.push({ gameId: "", charId: "", charName: "", coverSrc: "", text: "" });
                saveAnnualData();
                appendNewCharTopDom();
                openAnnualGlobalCharModal(newIndex);
                return;
            }
            // ========== ✅新增：全局板块添加CP按钮 ==========
            const globalAddCpBtn = e.target.closest("#annual-global-add-cp-btn");
            if(globalAddCpBtn){
                const newIndex = annualData.cpTopList.length;
                annualData.cpTopList.push({ gameId:"", gameName:"", femaleId:"", femaleName:"", femaleCoverSrc:"", maleId:"", maleName:"", maleCoverSrc:"", text:"" });
                saveAnnualData();
                appendNewCpTopDom();
                openAnnualGlobalCpModal(newIndex);
                return;
            }
            // ========== ✅新增：模块折叠/展开按钮 ==========
            const foldBtn = e.target.closest(".annual-card-fold-btn");
            if(foldBtn){
                const card = foldBtn.closest(".big-card");
                if(!card) return;
                const isFolded = card.classList.toggle("annual-folded");
                foldBtn.textContent = isFolded ? "▼" : "▲";
                return;
            }
            // ========== 年度TOP条目删除按钮（游戏/角色） ==========
            const delBtn = e.target.closest(".annual-item-delete-btn");
            if(delBtn){
                const itemDom = delBtn.closest(".annual-top-item, .annual-char-top-item, .annual-cp-top-item");
                if(!itemDom) return;
                const type = delBtn.dataset.type;
                let dataIdx;
                if(type === "game"){
                    const all = Array.from(document.querySelectorAll(".annual-top-item"));
                    dataIdx = all.indexOf(itemDom);
                    annualData.topList.splice(dataIdx,1);
                    itemDom.remove();
                    bindTop3Items();
                    rerenderGameTopNoLabel();
                }else if(type === "char"){
                    const all = Array.from(document.querySelectorAll(".annual-char-top-item"));
                    dataIdx = all.indexOf(itemDom);
                    annualData.charTopList.splice(dataIdx,1);
                    itemDom.remove();
                    bindCharTop3Items();
                    rerenderCharTopNoLabel();
                }else if(type === "cp"){  // ✅新增
                    const all = Array.from(document.querySelectorAll(".annual-cp-top-item"));
                    dataIdx = all.indexOf(itemDom);
                    annualData.cpTopList.splice(dataIdx,1);
                    itemDom.remove();
                    bindCpTop3Items();
                    rerenderCpTopNoLabel();
                }
                saveAnnualData();
                return;
            }

            // ========== 游戏弹窗关闭按钮 ==========
            const clickCloseBtn = e.target.closest("#annual-global-game-modal .annual-modal-close-btn");
            if(clickCloseBtn){
                closeAnnualGlobalGameModal();
                return;
            }

            // ========== 角色弹窗关闭按钮 ==========
            const charModalCloseBtn = e.target.closest("#annual-global-char-modal .annual-modal-close-btn");
            if(charModalCloseBtn){
                closeAnnualGlobalCharModal();
                return;
            }

            // ========== ✅新增：CP弹窗关闭按钮 ==========
            const cpModalCloseBtn = e.target.closest("#annual-global-cp-modal .annual-modal-close-btn");
            if(cpModalCloseBtn){ closeAnnualGlobalCpModal(); return; }

            // ========== 角色弹窗返回按钮 ==========
            const charModalBackBtn = e.target.closest(".annual-modal-back-btn");
            if(charModalBackBtn){
                charModalCurrentGameId = null;
                switchCharModalView("gameList");
                const modal = document.getElementById("annual-global-char-modal");
                const searchInput = modal.querySelector(".annual-global-char-search-input");
                renderCharModalGameList(modal.querySelector(".annual-global-char-game-list"), searchInput.value);
                return;
            }

            // ========== ✅新增：CP弹窗返回按钮（独立class，不与角色弹窗.annual-modal-back-btn冲突） ==========
            const cpModalBackBtn = e.target.closest("#annual-global-cp-modal .annual-cp-modal-back-btn");
            if(cpModalBackBtn){
                cpModalCurrentGameId = null;
                cpModalCurrentFemaleId = null;
                switchCpModalView("gameList");
                const modal = document.getElementById("annual-global-cp-modal");
                const searchInput = modal.querySelector(".annual-global-cp-search-input");
                renderCpModalGameList(modal.querySelector(".annual-global-cp-game-list"), searchInput.value);
                return;
            }

            // ========== 游戏弹窗遮罩点击关闭 ==========
            const modalGameEl = document.getElementById("annual-global-game-modal");
            if(modalGameEl && modalGameEl.classList.contains("active")){
                const insideModal = e.target.closest(".annual-global-modal-inner");
                if(!insideModal){
                    closeAnnualGlobalGameModal();
                    return;
                }
            }

            // ========== 角色弹窗遮罩点击关闭 ==========
            const modalCharEl = document.getElementById("annual-global-char-modal");
            if(modalCharEl && modalCharEl.classList.contains("active")){
                const insideCharModal = e.target.closest(".annual-global-modal-inner");
                if(!insideCharModal){
                    closeAnnualGlobalCharModal();
                    return;
                }
            }

            // ========== ✅新增：CP弹窗遮罩点击关闭 ==========
            const modalCpEl = document.getElementById("annual-global-cp-modal");
            if(modalCpEl && modalCpEl.classList.contains("active")){
                const insideCpModal = e.target.closest("#annual-global-cp-modal .annual-global-modal-inner");
                if(!insideCpModal){ closeAnnualGlobalCpModal(); return; }
            }

            // -------- 弹窗开关点击事件委托（角色弹窗） --------
            // 全局开关
            if(e.target.closest("#annual-modal-global-sub-char")){
                charModalGlobal.subChar = !charModalGlobal.subChar;
                if(charModalViewMode === "charList") renderCharModalCharList();
                return;
            }
            if(e.target.closest("#annual-modal-global-hide-char")){
                charModalGlobal.hideChar = !charModalGlobal.hideChar;
                if(charModalViewMode === "charList") renderCharModalCharList();
                return;
            }
            if(e.target.closest("#annual-modal-global-fd-game")){
                charModalGlobal.fdChar = !charModalGlobal.fdChar;
                if(charModalViewMode === "charList") renderCharModalCharList();
                return;
            }
            // ✅补丁新增：全局续作/FD次要角色开关
            if(e.target.closest("#annual-modal-global-fd-sub-char")){
                charModalGlobal.fdSubChar = !charModalGlobal.fdSubChar;
                if(charModalViewMode === "charList") renderCharModalCharList();
                return;
            }
            // 本游戏局部开关
            if(e.target.closest("#annual-modal-game-sub-char")){
                charModalLocal.subChar = !charModalLocal.subChar;
                renderCharModalCharList();
                return;
            }
            if(e.target.closest("#annual-modal-game-hide-char")){
                charModalLocal.hideChar = !charModalLocal.hideChar;
                renderCharModalCharList();
                return;
            }
            if(e.target.closest("#annual-modal-game-fd-game")){
                charModalLocal.fdChar = !charModalLocal.fdChar;
                renderCharModalCharList();
                return;
            }
            // ✅补丁新增：单游戏续作/FD次要角色开关
            if(e.target.closest("#annual-modal-game-fd-sub-char")){
                charModalLocal.fdSubChar = !charModalLocal.fdSubChar;
                renderCharModalCharList();
                return;
            }

            // ========== ✅新增：CP弹窗全局开关 ==========
            if(e.target.closest("#annual-modal-cp-global-sub-char")){
                cpModalGlobal.subChar = !cpModalGlobal.subChar;
                if(cpModalViewMode === "femaleList") renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-global-hide-char")){
                cpModalGlobal.hideChar = !cpModalGlobal.hideChar;
                if(cpModalViewMode === "femaleList") renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-global-fd-game")){
                cpModalGlobal.fdChar = !cpModalGlobal.fdChar;
                if(cpModalViewMode === "femaleList") renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-global-fd-sub-char")){
                cpModalGlobal.fdSubChar = !cpModalGlobal.fdSubChar;
                if(cpModalViewMode === "femaleList") renderCpModalFemaleList();
                return;
            }
            // ========== ✅新增：CP弹窗局部开关 ==========
            if(e.target.closest("#annual-modal-cp-game-sub-char")){
                cpModalLocal.subChar = !cpModalLocal.subChar;
                renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-game-hide-char")){
                cpModalLocal.hideChar = !cpModalLocal.hideChar;
                renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-game-fd-game")){
                cpModalLocal.fdChar = !cpModalLocal.fdChar;
                renderCpModalFemaleList();
                return;
            }
            if(e.target.closest("#annual-modal-cp-game-fd-sub-char")){
                cpModalLocal.fdSubChar = !cpModalLocal.fdSubChar;
                renderCpModalFemaleList();
                return;
            }
        });

        // ========== 全局弹窗搜索input事件委托 ==========
        document.addEventListener("input", (e)=>{
            // 游戏TOP3搜索
            const input = e.target.closest(".annual-global-search-input");
            if(input){
                const modal = document.getElementById("annual-global-game-modal");
                const listWrap = modal?.querySelector(".annual-global-game-list");
                if(listWrap){
                    renderGameList(listWrap, input.value);
                }
                return;
            }
            // 角色弹窗搜索（游戏列表视图）
            const charSearchInput = e.target.closest(".annual-global-char-search-input");
            if(charSearchInput){
                const modal = document.getElementById("annual-global-char-modal");
                const wrap = modal?.querySelector(".annual-global-char-game-list");
                if(wrap){
                    renderCharModalGameList(wrap, charSearchInput.value);
                }
                return;
            }
            // ✅新增：CP弹窗搜索（只搜游戏名）
            const cpSearchInput = e.target.closest(".annual-global-cp-search-input");
            if(cpSearchInput){
                const modal = document.getElementById("annual-global-cp-modal");
                const wrap = modal?.querySelector(".annual-global-cp-game-list");
                if(wrap){ renderCpModalGameList(wrap, cpSearchInput.value); }
                return;
            }
        });

        window._annualPanelClickBound = true;
    }

    // 如果游戏模板已经就绪，直接执行真实初始化
    if(isGameTemplateReady()){
        realInitAnnualModule();
    }else{
        // 轮询等待 gameTemplateReady 变为true，最大等待2s
        console.log("[annual.js] 游戏模板尚未就绪，等待加载完成");
        let pollCount = 0;
        const pollTimer = setInterval(()=>{
            pollCount++;
            if(isGameTemplateReady() || pollCount >= 40){
                clearInterval(pollTimer);
                if(isGameTemplateReady()){
                    realInitAnnualModule();
                }else{
                    console.warn("[annual.js]等待游戏模板超时，将在打开弹窗时再次尝试初始化");
                    // 【修复】超时不锁死，打开弹窗时重新尝试
                    _annualRealInitialized = false;
                }
            }
        }, 50);
    }
}

if(typeof window !== "undefined"){
    window.initAnnualModule = initAnnualModule;
}
