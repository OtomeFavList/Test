/**
 * 年度报告模块 annual.js
 * 存储key: "annual‑report‑data"，与喜好表数据隔离
 */

// 存储key
const ANNUAL_STORE_KEY = "annual-report-data";

// 默认空数据模板
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
    ],
    // 记录每个板块折叠状态
    blockCollapse: {
        stats: false,
        top3: false
    }
});

// 当前内存数据
let annualData = getDefaultAnnualData();

// DOM元素引用
let modeBtns;
let modeWraps;
let btnAnnualExport;

/**
 * 读写本地存储
 */
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
 * 模式切换逻辑
 */
function bindModeSwitch() {
    modeBtns = document.querySelectorAll(".mode-btn");
    modeWraps = document.querySelectorAll(".mode-wrap");

    // 读取url hash，恢复上次模式
    const hash = window.location.hash.replace("#","");
    let targetMode = "favlist";
    if(hash.startsWith("mode=")) {
        targetMode = hash.split("=")[1];
    }

    function switchMode(modeName) {
        // 更新按钮active
        modeBtns.forEach(btn=>{
            const m = btn.dataset.mode;
            if(m === modeName) btn.classList.add("active");
            else btn.classList.remove("active");
        });
        // 更新容器显隐（使用visibility+height占位，解决CLS）
        modeWraps.forEach(wrap=>{
            const m = wrap.dataset.mode;
            if(m === modeName) {
                wrap.classList.remove("mode-hidden");
            } else {
                wrap.classList.add("mode-hidden");
            }
        });
        // 更新url hash
        history.replaceState(null, "", `#mode=${modeName}`);
        // 滚动到顶部
        window.scrollTo({top:0, behavior:"smooth"});
    }

    // 绑定按钮点击
    modeBtns.forEach(btn=>{
        btn.addEventListener("click", ()=>{
            const m = btn.dataset.mode;
            switchMode(m);
        });
    });

    // 页面初始化切换到hash记录的模式
    switchMode(targetMode);
}

/**
 * 板块折叠展开
 */
function bindBlockCollapse() {
    const blocks = document.querySelectorAll(".annual-block.block-expand-wrap");
    blocks.forEach(block=>{
        const bid = block.dataset.blockId;
        const toggleBtn = block.querySelector(".annual-toggle-btn");
        if(annualData.blockCollapse[bid]) {
            block.classList.add("collapsed");
        }
        toggleBtn.addEventListener("click", ()=>{
            block.classList.toggle("collapsed");
            annualData.blockCollapse[bid] = block.classList.contains("collapsed");
            saveAnnualData();
        });
    });
}

/**
 * 统计区输入框双向绑定
 */
function bindStatInputs() {
    const statInputs = document.querySelectorAll(".annual-input");
    statInputs.forEach(input=>{
        const key = input.dataset.key;
        // 回填
        input.value = annualData[key] ?? "";
        // 输入变更保存
        input.addEventListener("input", ()=>{
            annualData[key] = input.value;
            saveAnnualData();
        });
    });
}

/**
 * TOP3模块：放大镜按钮、搜索面板、游戏选择、文本域回填
 */
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

        // 回填已有数据
        searchInput.value = dataItem.gameName ?? "";
        textarea.value = dataItem.text ?? "";
        if(dataItem.coverSrc) coverImg.src = dataItem.coverSrc;

        // 放大镜按钮开关面板
        triggerBtn.addEventListener("click", ()=>{
            panel.classList.toggle("active");
            if(panel.classList.contains("active")) {
                panelInput.focus();
                renderGameList(listWrap, panelInput.value);
            }
        });

        // 搜索框过滤游戏
        panelInput.addEventListener("input", ()=>{
            renderGameList(listWrap, panelInput.value);
        });

        // 文本域保存
        textarea.addEventListener("input", ()=>{
            annualData.topList[dataIdx].text = textarea.value;
            saveAnnualData();
        });

        /**
         * 根据关键词渲染游戏列表，服用全局gameTemplateList
         */
        function renderGameList(wrap, keyword) {
            wrap.innerHTML = "";
            if(!window.gameTemplateList) return;
            const kw = keyword.toLowerCase().trim();
            const filtered = window.gameTemplateList.filter(g=>{
                if(!kw) return true;
                return g.name.toLowerCase().includes(kw);
            });
            filtered.forEach(game=>{
                const div = document.createElement("div");
                div.className = "game-option-item";
                div.innerHTML = `
                    <img src="${getWebImageUrl(game.cover||'')}" alt="${game.name}" loading="lazy">
                    <div class="game-option-name">${game.name}</div>
                `;
                div.addEventListener("click", ()=>{
                    // 选中游戏回填
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

/**
 * 年度报告导出按钮，复用全局html2canvas与snapshot‑container
 */
function bindAnnualExport() {
    btnAnnualExport = document.getElementById("btn-annual-export");
    if(!btnAnnualExport) return;
    btnAnnualExport.addEventListener("click", async ()=>{
        const snapshotBox = document.getElementById("snapshot-container");
        const annualWrap = document.querySelector(".mode-wrap[data-mode='annual'] .annual-container");
        // 克隆DOM用于快照
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
    });
}

/**
 * 模块初始化入口，等待DOM加载完成
 */
window.addEventListener("DOMContentLoaded", ()=>{
    loadAnnualData();
    bindModeSwitch();
    bindBlockCollapse();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
});

// 复用main.js暴露的图片url工具，防止未定义
declare function getWebImageUrl(src:string):string;
