/**
 * 年度报告模块 annual.js
 * 存储key: "annual‑report‑data"，与喜好表数据隔离
 */
const ANNUAL_STORE_KEY = "annual-report-data";

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

/**
 * 移除annual.js内部的bindModeSwitch！模式切换交给index.html脚本，不再两套逻辑打架
 */

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

        const searchInput = item.querySelector(".annual-game-search");
        const triggerBtn = item.querySelector(".annual-search-trigger-btn");
        const panel = item.querySelector(".annual-game-select-panel");
        const panelInput = item.querySelector(".annual-panel-search-input");
        const listWrap = item.querySelector(".annual-game-select-list");
        const textarea = item.querySelector(".annual-top-textarea");
        const coverImg = item.querySelector(".annual-top-cover");

        searchInput.value = dataItem.gameName ?? "";
        textarea.value = dataItem.text ?? "";
        if(dataItem.coverSrc) coverImg.src = dataItem.coverSrc;

        // 放大镜：打开关闭面板
        triggerBtn.removeEventListener("click", triggerBtn._clickHandler);
        triggerBtn._clickHandler = () => {
            panel.classList.toggle("active");
            if(panel.classList.contains("active")){
                panelInput.focus();
                renderGameList(listWrap, panelInput.value);
            }
        };
        triggerBtn.addEventListener("click", triggerBtn._clickHandler);

        // 搜索输入过滤游戏
        panelInput.removeEventListener("input", panelInput._inputHandler);
        panelInput._inputHandler = ()=>{
            renderGameList(listWrap, panelInput.value);
        };
        panelInput.addEventListener("input", panelInput._inputHandler);

        // 感想文本框
        textarea.removeEventListener("input", textarea._inputHandler);
        textarea._inputHandler = ()=>{
            annualData.topList[dataIdx].text = textarea.value;
            saveAnnualData();
        };
        textarea.addEventListener("input", textarea._inputHandler);

        // 渲染游戏候选列表
        function renderGameList(wrap, keyword) {
            wrap.innerHTML = "";
            if(!window.gameTemplateList || !window.gameTemplateReady) return;
            const kw = (keyword ?? "").toLowerCase().trim();
            const filtered = window.gameTemplateList.filter(g=>{
                if(!kw) return true;
                return String(g.name).toLowerCase().includes(kw);
            });

            filtered.forEach(game=>{
                const div = document.createElement("div");
                div.className = "game-option-item";
                div.innerHTML = `
                    <img src="${getWebImageUrl(game.cover||'')}" alt="${game.name}" loading="lazy">
                    <div class="game-option-name">${game.name}</div>
                `;
                div.addEventListener("click", ()=>{
                    searchInput.value = game.name;
                    annualData.topList[dataIdx].gameId = game.id;
                    annualData.topList[dataIdx].gameName = game.name;
                    annualData.topList[dataIdx].coverSrc = getWebImageUrl(game.cover||"");
                    coverImg.src = annualData.topList[dataIdx].coverSrc;
                    panel.classList.remove("active");
                    saveAnnualData();
                });
                wrap.appendChild(div);
            });
        }
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
                backgroundColor:"#fff7f9"
            });
            const link = document.createElement("a");
            link.download = "Otome‑Annual‑Report.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch(err) {
            console.error("年度报告导出失败", err);
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
    loadAnnualData();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
}

declare function getWebImageUrl(src:string):string;
