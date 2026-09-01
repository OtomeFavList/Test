/**
 * 年度报告模块 annual.js
 * 存储key: "annual-report-data"，与喜好表数据隔离
 */
import { renderGameSelectItem, getWebImageUrl, gameTemplateList } from '/js/main.js';

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
    topList: [
        { gameId: "", gameName: "", coverSrc: "", text: "" },
        { gameId: "", gameName: "", coverSrc: "", text: "" },
        { gameId: "", gameName: "", coverSrc: "", text: "" }
    ]
});

let annualData = getDefaultAnnualData();
let btnAnnualExport;

// =========【新增】全局弹窗：记录当前操作的TOP条目下标 0/1/2；null=弹窗关闭
let activeTopItemIndex = null;

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

function isGameTemplateReady() {
    return Array.isArray(gameTemplateList) && gameTemplateList.length > 0;
}

/**
 * 渲染【全局模态弹窗】游戏候选列表
 * @param {HTMLElement} wrap 弹窗内列表容器
 * @param {string} keyword
 */
function renderGameList(wrap, keyword) {
    wrap.innerHTML = "";
    if(!gameTemplateList || !isGameTemplateReady()) {
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
            if (activeTopItemIndex === null) return;
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
 * 打开年度全局游戏选择弹窗
 */
function openAnnualGlobalGameModal(targetIndex){
    activeTopItemIndex = targetIndex;
    const modal = document.getElementById("annual-global-game-modal");
    if(!modal) return;
    modal.classList.add("active");
    const searchInput = modal.querySelector(".annual-global-search-input");
    const listWrap = modal.querySelector(".annual-global-game-list");
    searchInput.value = "";
    searchInput.focus();
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
    topItems.forEach((item, idx)=>{
        const rank = Number(item.dataset.rank);
        const dataIdx = rank - 1;
        const dataItem = annualData.topList[dataIdx];
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

export function initAnnualModule(){
    if(!window._annualPanelClickBound){
        document.addEventListener("click",(e)=>{
            // 点击添加游戏按钮：打开全局弹窗，记录下标
            const clickAddBtn = e.target.closest(".annual-add-game-btn");
            if(clickAddBtn){
                const itemDom = clickAddBtn.closest(".annual-top-item");
                if(!itemDom) return;
                const rank = Number(itemDom.dataset.rank);
                const idx = rank - 1;
                openAnnualGlobalGameModal(idx);
                return;
            }

            // 【新增】弹窗右上角×关闭按钮
            const clickCloseBtn = e.target.closest(".annual-modal-close-btn");
            if(clickCloseBtn){
                closeAnnualGlobalGameModal();
                return;
            }

            const modalEl = document.getElementById("annual-global-game-modal");
            if(!modalEl || !modalEl.classList.contains("active")) return;

            // 点击弹窗内部，不关闭
            const insideModal = e.target.closest(".annual-global-modal-inner");
            if(insideModal) return;

            // 点击遮罩，关闭弹窗
            closeAnnualGlobalGameModal();
        });

        // 全局弹窗搜索input事件委托
        document.addEventListener("input", (e)=>{
            const input = e.target.closest(".annual-global-search-input");
            if(!input) return;
            const listWrap = document.querySelector(".annual-global-game-list");
            if(listWrap){
                renderGameList(listWrap, input.value);
            }
        });
        window._annualPanelClickBound = true;
    }
    loadAnnualData();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
    bindAnnualExportPanel();
}

if(typeof window !== "undefined"){
    window.initAnnualModule = initAnnualModule;
}
