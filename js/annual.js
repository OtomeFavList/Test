/**
 * 年度报告模块 annual.js
 * 存储key: "annual-report-data"，与喜好表数据隔离
 */

// ✅修复：导入模板列表与就绪标记，不再读取window上的变量
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

function bindTop3Items() {
    const topItems = document.querySelectorAll(".annual-top-item");
    topItems.forEach((item, idx)=>{
        const rank = Number(item.dataset.rank);
        const dataIdx = rank - 1;
        const dataItem = annualData.topList[dataIdx];

        const addBtn = item.querySelector(".annual-add-game-btn");
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

        // 添加游戏按钮：打开/关闭候选面板
        addBtn.removeEventListener("click", addBtn._clickHandler);
        addBtn._clickHandler = ()=>{
            console.log("【年度报告】点击添加游戏按钮");
            const isOpen = panel.classList.contains("active");
            if(isOpen){
                panel.classList.remove("active");
                console.log("关闭面板");
            }else{
                panel.classList.add("active");
                panelInput.focus();
                console.log("打开面板，gameTemplateReady：", gameTemplateReady, "列表长度：", gameTemplateList?.length);
                renderGameList(listWrap, panelInput.value);
            }
        };
        addBtn.addEventListener("click", addBtn._clickHandler);

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

        // 渲染候选游戏列表，复用main.js renderGameSelectItem
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
            filtered.forEach((game, index)=>{
                const div = document.createElement("div");
                div.className = "game-option-item";
                div.innerHTML = renderGameSelectItem(game, index);
                div.addEventListener("click", ()=>{
                    nameTextEl.textContent = game.name;
                    annualData.topList[dataIdx].gameId = game.id;
                    annualData.topList[dataIdx].gameName = game.name;
                    annualData.topList[dataIdx].coverSrc = game.cover ?? "";
                    coverImg.src = getWebImageUrl(annualData.topList[dataIdx].coverSrc);
                    refreshTopItemUi(item, annualData.topList[dataIdx]);
                    panel.classList.remove("active");
                    saveAnnualData();
                });
                wrap.appendChild(div);
            });
        }
    });
}

/**
 * 【新增】年度报告导出模块绑定（九、导出）
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
    };
    btnResetColor.addEventListener("click", btnResetColor._handler);

    // 颜色输入双向绑定
    colorBg.oninput = () => { annualExportConfig.bg = colorBg.value; };
    colorTitle.oninput = () => { annualExportConfig.title = colorTitle.value; };
    colorGamename.oninput = () => { annualExportConfig.gamename = colorGamename.value; };
    colorCustomtext.oninput = () => { annualExportConfig.customtext = colorCustomtext.value; };
    colorBorder.oninput = () => { annualExportConfig.border = colorBorder.value; };

    // 字号滑块
    sliderFont.oninput = () => {
        const val = Number(sliderFont.value);
        annualExportConfig.customTextFontSize = val;
        fontValueDisplay.textContent = `${val}px`;
    };

    // 【九、导出】生成并导出图片按钮
    btnExportImage.removeEventListener("click", btnExportImage._handler);
    btnExportImage._handler = async () => {
        const annualWrap = document.querySelector(".mode-wrap[data-mode='annual']");
        if (!annualWrap || !snapshotBox) return;

        // 复制年度报告DOM到快照容器，追加 annual-mode class，隔离FavList变量
        snapshotBox.innerHTML = annualWrap.innerHTML;
        snapshotBox.classList.add("export-snapshot", "annual-mode");

        // 将当前面板的配色写入快照容器CSS变量
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
            console.error("年度报告【九、导出】导出失败", err);
        } finally {
            snapshotBox.innerHTML = "";
            snapshotBox.classList.remove("export-snapshot", "annual-mode");
        }
    };
    btnExportImage.addEventListener("click", btnExportImage._handler);
}

// 原有旧导出（过渡保留）
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
 * 对外暴露初始化函数，**不自己监听DOMContentLoaded**
 * 由index.html 在游戏模板全部就绪之后手动调用
 */
export function initAnnualModule(){
    // 只绑定一次：点击页面空白关闭annual游戏面板
    if(!window._annualPanelClickBound){
        document.addEventListener("click",(e)=>{
            const activePanel = document.querySelector(".annual-game-select-panel.active");
            if(!activePanel) return;
            const clickAddBtn = e.target.closest(".annual-add-game-btn");
            const clickPanelInner = e.target.closest(".annual-game-select-panel");
            if(clickAddBtn || clickPanelInner) return;
            activePanel.classList.remove("active");
        });
        window._annualPanelClickBound = true;
    }

    loadAnnualData();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
    // 【新增：绑定九、导出整套UI逻辑】
    bindAnnualExportPanel();
}
