// ===================== 年度报告模块 annual.js =====================
// 存储key: "annual-report-data"，与喜好表数据隔离

// =========【修复：不再导入普通变量，改为从 window.Core 实时读取最新状态，同时增加window全局变量兜底】===========

import { renderGameSelectItem, getWebImageUrl } from '/js/main.js';

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
    // 修复：不再预置3条空数据，初始为空数组
    topList: [],
    charTopList: []
});

let annualData = getDefaultAnnualData();

let btnAnnualExport;

// =========【新增】全局弹窗：记录当前操作的TOP条目下标 0/1/2；null=弹窗关闭
let activeTopItemIndex = null;

// ========= キャラTOP3弹窗状态 =========
let activeCharTopItemIndex = null;
// 弹窗内部视图状态：gameList / charList
let charModalViewMode = "gameList";
// 当前弹窗选中的游戏ID（进入角色列表时赋值）
let charModalCurrentGameId = null;
// 弹窗内开关临时状态（只作用弹窗内部，不污染全局appData）
let charModalGlobal = {
    subChar: false,
    hideChar: false,
    fdChar: false
};
let charModalLocal = {
    subChar: false,
    hideChar: false,
    fdChar: false
};

// 模块内部状态标记
let _annualRealInitialized = false;

// 模块级标记，用于全局document click防重复绑定（当前方案已移除，保留作为预留）
let _annualDocClickBound = false;
let _annualSortDocClickHandler = null;

/**
 * 获取游戏模板状态，双重来源：优先window.Core，兜底window.__gameTemplateXXX（main.js挂载全局）
 */
function getGameTemplateState() {
    const core = window.Core;
    if(core && Array.isArray(core.gameTemplateList) && core.gameTemplateReady === true){
        return {
            list: core.gameTemplateList,
            ready: true
        };
    }
    // 兜底读取main导出挂载window的全局变量
    const winList = window.__gameTemplateList;
    const winReady = window.__gameTemplateReady;
    if(Array.isArray(winList) && winList.length>0 && winReady === true){
        return {
            list: winList,
            ready: true
        };
    }
    return {
        list: null,
        ready: false
    };
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
    const state = getGameTemplateState();
    return state.ready;
}

/**
 * 渲染【全局模态弹窗】游戏候选列表（游戏TOP3）
 * @param {HTMLElement} wrap 弹窗内列表容器
 * @param {string} keyword
 */
function renderGameList(wrap, keyword) {
    wrap.innerHTML = "";
    const state = getGameTemplateState();
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
    const state = getGameTemplateState();
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
                charModalLocal = { subChar:false, hideChar:false, fdChar:false };
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
            if(!charNameLow.includes(kw)) continue;

            // 【开关过滤：仅使用全局开关charModalGlobal，不使用游戏局部charModalLocal】
            const isSub = char.isSub ?? false;
            const isHidden = !!char.isHidden;
            const isFD = !!char.isFD;
            const showHide = charModalGlobal.hideChar;
            const showFD = charModalGlobal.fdChar;
            const showSub = charModalGlobal.subChar;

            let pass = false;
            if(isSub){
                if(isHidden && isFD) pass = showSub && showHide && showFD;
                else if(isHidden && !isFD) pass = showSub && showHide;
                else if(!isHidden && isFD) pass = showSub && showFD;
                else pass = showSub;
            }else{
                if(!isHidden && !isFD) pass = true;
                else if(isHidden && !isFD) pass = showHide;
                else if(!isHidden && isFD) pass = showFD;
                else if(isHidden && isFD) pass = showHide || showFD;
                else pass = true;
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
        const imgSrc = getWebImageUrl(char.images?.[0]?.srcList?.[0] || "");
        div.innerHTML = `
            <div class="char-card-img-box">
                <img src="${imgSrc}" alt="${char.name}" decoding="async">
            </div>
            <div class="char-card-name-wrap">
                <div class="char-card-name">${char.name}</div>
                <div class="char-card-game-sub">${game.name}</div>
            </div>
        `;
        div.addEventListener("click", ()=>{
            if(activeCharTopItemIndex === null) return;
            //【问题③】重复角色校验，忽略当前编辑条目
            const isDuplicate = annualData.charTopList.some((item,i)=> i !== activeCharTopItemIndex && item.charId === char.id);
            if(isDuplicate){
                alert("该角色已经添加，不可重复添加");
                return;
            }
            const targetItem = annualData.charTopList[activeCharTopItemIndex];
            targetItem.gameId = game.id;
            targetItem.charId = char.id;
            targetItem.charName = char.name;
            targetItem.coverSrc = imgSrc;

            const charItemDoms = Array.from(document.querySelectorAll(".annual-char-top-item"));
            const targetDom = charItemDoms[activeCharTopItemIndex];
            if(targetDom){
                const nameEl = targetDom.querySelector(".annual-char-name-text");
                const imgEl = targetDom.querySelector(".annual-char-cover");
                nameEl.textContent = char.name;
                imgEl.src = imgSrc;
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
            charModalLocal = { subChar:false, hideChar:false, fdChar:false };
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
    const state = getGameTemplateState();
    const gameInfo = state.list.find(g=>g.id === charModalCurrentGameId);
    if(!gameInfo){
        charWrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">未找到该游戏数据</div>`;
        return;
    }
    // 复制一套getAllGameChar过滤逻辑，使用弹窗本地开关，不碰appData
    let chars = [...(gameInfo.charList || [])];
    chars = chars.filter(c=>{
        const isSub = c.isSub ?? false;
        const isHidden = !!c.isHidden;
        const isFD = !!c.isFD;
        const showHide = charModalGlobal.hideChar || charModalLocal.hideChar;
        const showFD = charModalGlobal.fdChar || charModalLocal.fdChar;
        const showSub = charModalGlobal.subChar || charModalLocal.subChar;

        if(isSub){
            if(isHidden && isFD) return showSub && showHide && showFD;
            if(isHidden && !isFD) return showSub && showHide;
            if(!isHidden && isFD) return showSub && showFD;
            return showSub;
        }
        if(!isHidden && !isFD) return true;
        if(isHidden && !isFD) return showHide;
        if(!isHidden && isFD) return showFD;
        if(isHidden && isFD) return showHide || showFD;
        return true;
    });
    // ✅角色名排序复用sortFilterOptionList
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
        const imgSrc = getWebImageUrl(char.images?.[0]?.srcList?.[0] || "");
        div.innerHTML = `
            <div class="char-card-img-box">
                <img src="${imgSrc}" alt="${char.name}" decoding="async">
            </div>
            <div class="char-card-name">${char.name}</div>
        `;
        div.addEventListener("click",()=>{
            if(activeCharTopItemIndex === null) return;
            //【问题③】重复角色校验
            const isDuplicate = annualData.charTopList.some((item,i)=> i !== activeCharTopItemIndex && item.charId === char.id);
            if(isDuplicate){
                alert("该角色已经添加，不可重复添加");
                return;
            }
            // 回填数据到charTopList
            const targetItem = annualData.charTopList[activeCharTopItemIndex];
            targetItem.gameId = charModalCurrentGameId;
            targetItem.charId = char.id;
            targetItem.charName = char.name;
            targetItem.coverSrc = imgSrc;
            // 更新DOM
            const charItemDoms = Array.from(document.querySelectorAll(".annual-char-top-item"));
            const targetDom = charItemDoms[activeCharTopItemIndex];
            if(targetDom){
                const nameEl = targetDom.querySelector(".annual-char-name-text");
                const imgEl = targetDom.querySelector(".annual-char-cover");
                nameEl.textContent = char.name;
                imgEl.src = imgSrc;
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
    charModalGlobal = { subChar:false, hideChar:false, fdChar:false };
    charModalLocal = { subChar:false, hideChar:false, fdChar:false };
    switchCharModalView("gameList");

    const searchInput = modal.querySelector(".annual-global-char-search-input");
    searchInput.value = "";
    searchInput.focus();
    // 重置开关DOM勾选（对齐HTML真实id）
    modal.querySelector("#annual-modal-global-sub-char").checked = false;
    modal.querySelector("#annual-modal-global-hide-char").checked = false;
    modal.querySelector("#annual-modal-global-fd-game").checked = false;
    modal.querySelector("#annual-modal-game-sub-char").checked = false;
    modal.querySelector("#annual-modal-game-hide-char").checked = false;
    modal.querySelector("#annual-modal-game-fd-game").checked = false;

    renderCharModalGameList(modal.querySelector(".annual-global-char-game-list"), "");
}

/**
 * 关闭角色弹窗
 */
function closeAnnualGlobalCharModal(){
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
    let indicatorDom = null;
    // ✅指示线两次点击状态标记
    let indicatorFirstClick = false;
    // PC鼠标按下临时变量
    let mouseStartY = null;
    let mouseStartX = null;
    // ✅新增：防止长按松手后立刻触发click误清除选中
    let selectCoolDown = false;
    // ==========【新增】选中模式下，第一次click忽略，第二次点击才退出选中
    let selectedFirstClickAfterEnter = false;

    // 清除选中状态、移除指示线
    function clearSelectState(){
        if(selectedItem){
            selectedItem.classList.remove("sort-selected-item");
            selectedItem.classList.remove("sort-lock-layout");
        }
        selectedItem = null;
        selectedIndex = null;
        indicatorFirstClick = false;
        selectCoolDown = false;
        // ✅重置标记
        selectedFirstClickAfterEnter = false;
        if(indicatorDom && indicatorDom.parentNode){
            indicatorDom.parentNode.removeChild(indicatorDom);
        }
        indicatorDom = null;
    }

    //【新增④】进入选中模式立刻渲染指示线占位DOM，解决横线不自动显示
    function renderAllInsertIndicators() {
        if(!selectedItem) return;
        const items = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item"));
        if(items.length === 0) return;
        // 默认先把指示线放在第一个item前面，等待move事件再更新位置
        showInsertIndicator(items[0]);
    }

    // 创建/更新插入指示线，插入到目标item之前
    function showInsertIndicator(beforeItemDom){
        if(!indicatorDom){
            indicatorDom = document.createElement("div");
            indicatorDom.className = "sort-insert-indicator";
            indicatorFirstClick = false;
            indicatorDom.onclick = function(){
                if(selectedIndex === null) return;
                // ✅两击逻辑：第一次激活样式，第二次执行插入
                if(!indicatorFirstClick){
                    indicatorDom.classList.add("active-hit");
                    indicatorFirstClick = true;
                    return;
                }
                // 第二次点击：执行插入
                const allItems = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item"));
                const targetIndex = allItems.indexOf(beforeItemDom);
                if(selectedIndex === targetIndex || selectedIndex === targetIndex - 1){
                    clearSelectState();
                    return;
                }
                const temp = dataArr.splice(selectedIndex, 1)[0];
                const insertPos = (targetIndex > selectedIndex) ? targetIndex - 1 : targetIndex;
                dataArr.splice(insertPos, 0, temp);
                afterSort();
                clearSelectState();
            };
        }
        // 指示线已经在DOM中，不需要重复插入
        if(indicatorDom.parentNode && indicatorDom.nextSibling === beforeItemDom){
            return;
        }
        if(beforeItemDom.parentNode){
            beforeItemDom.parentNode.insertBefore(indicatorDom, beforeItemDom);
        }
        indicatorDom.classList.remove("active-hit");
        indicatorFirstClick = false;
    }

    function updateIndicatorByPoint(clientY){
        if(selectedIndex === null) return;
        const items = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item"));
        let hoverTarget = null;
        for(const it of items){
            const rect = it.getBoundingClientRect();
            if(clientY < rect.top + rect.height * 0.45){
                hoverTarget = it;
                break;
            }
        }
        if(!hoverTarget){
            if(indicatorDom && indicatorDom.parentNode) indicatorDom.remove();
            indicatorDom = null;
        }else{
            showInsertIndicator(hoverTarget);
        }
    }

    // 长按2000ms进入锁定选中模式
    function enterSelectMode(itemDom, itemIndex){
        // 如果长按当前已经选中的条目：直接退出选中模式
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
        // ✅冷却：刚进入选中模式，300ms内忽略click事件，防止松手瞬间误清除
        selectCoolDown = true;
        // ✅进入选中模式：标记需要跳过第一次click
        selectedFirstClickAfterEnter = true;

        setTimeout(()=>{
            selectCoolDown = false;
        },300);
        //【修复④】进入模式立刻渲染指示线DOM
        renderAllInsertIndicators();
    }

    // ============ 移动端 touch 事件 ============
    container.addEventListener("touchstart", (e) => {
        if(pressTimer !== null){
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        const targetRow = e.target.closest(".annual-top-label-row, .annual-top-content-row, .annual-char-top-content-row");
        if (!targetRow) {
            return;
        }
        const itemDom = targetRow.closest(".annual-top-item,.annual-char-top-item");
        if (!itemDom) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }
        // ✅阻止浏览器原生长按选文本
        e.preventDefault();
        const touch = e.touches[0];
        touchStartY = touch.clientY;
        touchStartX = touch.clientX;
        const allItems = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item"));
        const idx = allItems.indexOf(itemDom);
        pressTimer = setTimeout(() => {
            enterSelectMode(itemDom, idx);
        }, 2000); // 需求是长按2s，原值1000改为2000
    });

    container.addEventListener("touchmove", (e) => {
        // 只有还未触发长按的阶段才判断移动阈值，已经进入选中模式不销毁状态【修复③】
        if(pressTimer !== null && touchStartY !== null && touchStartX !== null){
            const touch = e.touches[0];
            const deltaY = Math.abs(touch.clientY - touchStartY);
            const deltaX = Math.abs(touch.clientX - touchStartX);
            if(deltaY > 12 || deltaX >12){
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }
        // 选中模式下只更新指示线，卡片DOM本身禁止位移【修复②】
        if(selectedIndex !== null && e.touches.length>0){
            updateIndicatorByPoint(e.touches[0].clientY);
        }
    }, { passive: true });

    container.addEventListener("touchend", () => {
        // touchend：**只销毁未触发的长按定时器，绝不清除选中状态selectedItem**【修复③】
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

    // ============ PC鼠标 mousedown 长按2000ms逻辑 ============
    container.addEventListener("mousedown", (e)=>{
        const labelRow = e.target.closest(".annual-top-label-row, .annual-top-content-row, .annual-char-top-content-row");
        if (!labelRow) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }
        const itemDom = labelRow.closest(".annual-top-item,.annual-char-top-item");
        if (!itemDom) {
            clearTimeout(pressTimer);
            pressTimer = null;
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        // ✅阻止浏览器鼠标长按选中文本
        document.getSelection()?.removeAllRanges();
        mouseStartY = e.clientY;
        mouseStartX = e.clientX;
        const allItems = Array.from(container.querySelectorAll(".annual-top-item,.annual-char-top-item"));
        const idx = allItems.indexOf(itemDom);
        pressTimer = setTimeout(()=>{
            enterSelectMode(itemDom, idx);
        },2000); // 2000ms长按

        function onMouseMove(me){
            if(pressTimer !== null){
                const deltaY = Math.abs(me.clientY - mouseStartY);
                const deltaX = Math.abs(me.clientX - mouseStartX);
                if(deltaY>12 || deltaX>12){
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            }
            if(selectedIndex !== null){
                updateIndicatorByPoint(me.clientY);
            }
        }

        function onMouseUp(){
            // mouseup：只清除定时器，不清除选中状态【修复③】
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

    // 容器内点击
    container.addEventListener("click", (e)=>{
        if(!selectedItem) return;
        // ✅冷却期直接忽略本次click，解决长按松手立刻触发click清除
        if(selectCoolDown) return;

        const clickIndicator = e.target.closest(".sort-insert-indicator");
        if(clickIndicator){
            return;
        }

        const clickItem = e.target.closest(".annual-top-item,.annual-char-top-item");

        // ✅关键：进入选中模式后的第一次click直接跳过（就是松手后浏览器自动冒泡的那一次click）
        if(selectedFirstClickAfterEnter){
            selectedFirstClickAfterEnter = false;
            return;
        }

        // 只有第二次及以后点击：点击选中卡片本身 / 空白区域，才退出选中模式
        if(clickItem === selectedItem || !clickItem){
            clearSelectState();
        }
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

    btnExportImage.removeEventListener("click", btnExportImage._handler);
    btnExportImage._handler = async () => {
        const annualWrap = document.querySelector(".mode-wrap[data-mode='annual']");
        if (!annualWrap || !snapshotBox) return;
        snapshotBox.innerHTML = annualWrap.innerHTML;
        snapshotBox.classList.add("export-snapshot", "annual-mode");
        snapshotBox.style.setProperty("--annual-export-bg", annualExportConfig.bg);
        snapshotBox.style.setProperty("--annual-export-title", annualExportConfig.title);
        snapshotBox.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
        snapshotBox.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
        snapshotBox.style.setProperty("--annual-export-border", annualExportConfig.border);
        snapshotBox.dataset.annualFontSize = String(annualExportConfig.customTextFontSize);
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
            console.error("年度报告导出失败", err);
        } finally {
            snapshotBox.innerHTML = "";
            snapshotBox.classList.remove("export-snapshot", "annual-mode");
        }
    };
    btnExportImage.addEventListener("click", btnExportImage._handler);
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
 * 真正执行年度模块业务初始化（必须等gameTemplateReady=true）
 */
function realInitAnnualModule(){
    if(_annualRealInitialized) return;
    _annualRealInitialized = true;
    console.log("✅[annual.js] realInitAnnualModule 游戏模板就绪，执行业务初始化");
    loadAnnualData();
    bindStatInputs();
    // 从localStorage读取数据后，完全重建DOM，保证DOM数量与数组长度完全一致
    rebuildGameTopDomAll();
    rebuildCharTopDomAll();
    bindTop3Items();
    bindCharTop3Items();
    bindTouchDrag();
    bindAnnualExport();
    bindAnnualExportPanel();
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

            // ========== 年度TOP条目删除按钮（游戏/角色） ==========
            const delBtn = e.target.closest(".annual-item-delete-btn");
            if(delBtn){
                const itemDom = delBtn.closest(".annual-top-item, .annual-char-top-item");
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
