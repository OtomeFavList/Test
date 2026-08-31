/**
 * 年度报告模块 annual.js
 * 存储key: "annual-report-data"，与喜好表数据隔离
 */

import { renderGameSelectItem, getWebImageUrl, gameTemplateList, gameTemplateReady } from '/js/main.js';

const ANNUAL_STORE_KEY = "annual-report-data";

// 年度报告导出配置（内存，不持久化localStorage；页面刷新恢复默认）
const annualExportDefault = {
    bg: "#fff7f9",
    title: "#b33a3a",
    gamename: "#000000",
    customtext: "#c98fac",
    border: "#f6a5b8",
    customTextFontSize: 16
};
let annualExportConfig = {...annualExportDefault};

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
    topList: [
        { gameId: "", gameName: "", coverSrc: "", text: "" },
        { gameId: "", gameName: "", coverSrc: "", text: "" },
        { gameId: "", gameName: "", coverSrc: "", text: "" }
    ]
});
let annualData = getDefaultAnnualData();

let btnAnnualExport;

/**
 * 更新单个TOP条目UI显隐状态
 * @param {HTMLElement} itemDom annual-top-item
 * @param {Object} dataItem topList单条数据
 */
function refreshTopItemUi(itemDom, dataItem) {
    const nameEl = itemDom.querySelector(".annual-game-name-text");
    const contentRow = itemDom.querySelector(".annual-top-content-row");
    const addBtn = itemDom.querySelector(".annual-add-game-btn");
    const hasGame = !!dataItem.gameId;

    if (hasGame) {
        nameEl.classList.remove("hidden-when-empty");
        contentRow.classList.remove("hidden-when-empty");
        nameEl.classList.add("render-visible");
        contentRow.classList.add("render-visible");
        addBtn.classList.add("hidden-when-empty");
    } else {
        nameEl.classList.add("hidden-when-empty");
        contentRow.classList.add("hidden-when-empty");
        nameEl.classList.remove("render-visible");
        contentRow.classList.remove("render-visible");
        addBtn.classList.remove("hidden-when-empty");
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

/**
 * 渲染年度报告游戏候选列表（顶层函数）
 * @param {HTMLElement} wrap
 * @param {string} keyword
 */
function renderGameList(wrap, keyword) {
    wrap.innerHTML = "";
    if(!gameTemplateList || !gameTemplateReady) {
        wrap.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">游戏模板尚未加载完成，请稍后再试</div>`;
        return;
    }
    const kw = (keyword ?? "").toLowerCase().trim();
    const filtered = gameTemplateList.filter(g=>{
        if(!kw) return true;
        return String(g.name).toLowerCase().includes(kw);
    });

    filtered.forEach((game, listIndex)=>{
        const div = document.createElement("div");
        div.className = "game-option-item";
        div.innerHTML = renderGameSelectItem(game, listIndex);
        div.addEventListener("click", ()=>{
            const topItemDom = div.closest(".annual-top-item");
            const dataIdx = Number(topItemDom.dataset.rank) - 1;
            const nameTextEl = topItemDom.querySelector(".annual-game-name-text");
            const coverImg = topItemDom.querySelector(".annual-top-cover");
            const panelDom = topItemDom.querySelector(".annual-game-select-panel");

            nameTextEl.textContent = game.name;
            annualData.topList[dataIdx].gameId = game.id;
            annualData.topList[dataIdx].gameName = game.name;
            annualData.topList[dataIdx].coverSrc = game.cover ?? "";
            coverImg.src = getWebImageUrl(annualData.topList[dataIdx].coverSrc);

            refreshTopItemUi(topItemDom, annualData.topList[dataIdx]);
            panelDom.classList.remove("active");
            saveAnnualData();
        });
        wrap.appendChild(div);
    });
}

function bindTop3Items() {
    const topItems = document.querySelectorAll(".annual-top-item");
    topItems.forEach((item, idx)=>{
        const rank = Number(item.dataset.rank);
        const dataIdx = rank - 1;
        const dataItem = annualData.topList[dataIdx];

        const panel = item.querySelector(".annual-game-select-panel");
        const panelInput = item.querySelector(".annual-panel-search-input");
        const listWrap = item.querySelector(".annual-game-select-list");
        const nameTextEl = item.querySelector(".annual-game-name-text");
        const textarea = item.querySelector(".annual-top-textarea");
        const coverImg = item.querySelector(".annual-top-cover");

        // 回填数据
        nameTextEl.textContent = dataItem.gameName ?? "";
        textarea.value = dataItem.text ?? "";
        if(dataItem.coverSrc){
            coverImg.src = getWebImageUrl(dataItem.coverSrc);
        }
        refreshTopItemUi(item, dataItem);

        // 搜索框输入过滤
        panelInput.removeEventListener("input", panelInput._inputHandler);
        panelInput._inputHandler = ()=>{
            renderGameList(listWrap, panelInput.value);
        };
        panelInput.addEventListener("input", panelInput._inputHandler);

        // 自定义文本框双向绑定
        textarea.removeEventListener("input", textarea._inputHandler);
        textarea._inputHandler = ()=>{
            annualData.topList[dataIdx].text = textarea.value;
            saveAnnualData();
        };
        textarea.addEventListener("input", textarea._inputHandler);
    });
}

/**
 * 更新滑块进度百分比（完全对齐script.js实现）
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

    // 初始化控件值
    colorBg.value = annualExportConfig.bg;
    colorTitle.value = annualExportConfig.title;
    colorGamename.value = annualExportConfig.gamename;
    colorCustomtext.value = annualExportConfig.customtext;
    colorBorder.value = annualExportConfig.border;
    sliderFont.value = annualExportConfig.customTextFontSize;
    fontValueDisplay.textContent = `${annualExportConfig.customTextFontSize}px`;
    updateSliderProgress(sliderFont);

    // 初始化页面全局CSS变量【修复：常态页面实时渲染颜色】
    document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
    document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
    document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
    document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
    document.body.style.setProperty("--annual-export-border", annualExportConfig.border);

    // 恢复默认设置按钮
    btnResetColor.removeEventListener("click", btnResetColor._handler);
    btnResetColor._handler = () => {
        annualExportConfig = {...annualExportDefault};
        colorBg.value = annualExportConfig.bg;
        colorTitle.value = annualExportConfig.title;
        colorGamename.value = annualExportConfig.gamename;
        colorCustomtext.value = annualExportConfig.customtext;
        colorBorder.value = annualExportConfig.border;
        sliderFont.value = annualExportConfig.customTextFontSize;
        fontValueDisplay.textContent = `${annualExportConfig.customTextFontSize}px`;

        // 【修复：重置同步更新页面CSS变量，页面立刻刷新配色】
        document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
        document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
        document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
        document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
        document.body.style.setProperty("--annual-export-border", annualExportConfig.border);

        updateSliderProgress(sliderFont);
    };
    btnResetColor.addEventListener("click", btnResetColor._handler);

    // 颜色输入双向绑定【修复：修改颜色立刻更新body CSS变量，页面实时变色】
    colorBg.oninput = () => {
        annualExportConfig.bg = colorBg.value;
        document.body.style.setProperty("--annual-export-bg", annualExportConfig.bg);
    };
    colorTitle.oninput = () => {
        annualExportConfig.title = colorTitle.value;
        document.body.style.setProperty("--annual-export-title", annualExportConfig.title);
    };
    colorGamename.oninput = () => {
        annualExportConfig.gamename = colorGamename.value;
        document.body.style.setProperty("--annual-export-gamename", annualExportConfig.gamename);
    };
    colorCustomtext.oninput = () => {
        annualExportConfig.customtext = colorCustomtext.value;
        document.body.style.setProperty("--annual-export-customtext", annualExportConfig.customtext);
    };
    colorBorder.oninput = () => {
        annualExportConfig.border = colorBorder.value;
        document.body.style.setProperty("--annual-export-border", annualExportConfig.border);
    };

    // 字号滑块
    sliderFont.oninput = () => {
        const val = Number(sliderFont.value);
        annualExportConfig.customTextFontSize = val;
        fontValueDisplay.textContent = `${val}px`;
        updateSliderProgress(sliderFont);
    };

    // 导出图片按钮
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

// 旧导出兼容保留
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
                backgroundColor:"#fff7f9"
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
 * 对外暴露初始化函数，由index.html在游戏模板就绪后手动调用
 */
export function initAnnualModule(){
    if(!window._annualPanelClickBound){
        document.addEventListener("click",(e)=>{
            // =========优先处理添加游戏按钮点击，放到最前面，防止后面activePanel提前return干扰=========
            const clickAddBtn = e.target.closest(".annual-add-game-btn");
            if(clickAddBtn){
                e.stopPropagation();
                const itemDom = clickAddBtn.closest(".annual-top-item");
                const panelDom = itemDom.querySelector(".annual-game-select-panel");
                const searchInput = itemDom.querySelector(".annual-panel-search-input");
                const listContainer = itemDom.querySelector(".annual-game-select-list");
                const isOpen = panelDom.classList.contains("active");
                if(isOpen){
                    panelDom.classList.remove("active");
                }else{
                    // 关闭其他所有面板
                    document.querySelectorAll(".annual-game-select-panel.active").forEach(p=>{
                        if(p!==panelDom) p.classList.remove("active");
                    });
                    panelDom.classList.add("active");
                    searchInput.focus();
                    if(gameTemplateReady){
                        renderGameList(listContainer, searchInput.value ?? "");
                    }else{
                        listContainer.innerHTML = `<div style="padding:12px;color:#888;text-align:center;">游戏模板尚未加载完成，请稍后再试</div>`;
                    }
                }
                return; //处理完按钮直接return，不再往下执行关闭面板逻辑
            }

            const activePanel = document.querySelector(".annual-game-select-panel.active");
            if(!activePanel) return;
            const clickPanelInner = e.target.closest(".annual-game-select-panel");
            if(clickPanelInner) return;
            activePanel.classList.remove("active");
        });
        window._annualPanelClickBound = true;
    }

    loadAnnualData();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
    bindAnnualExportPanel();
}
