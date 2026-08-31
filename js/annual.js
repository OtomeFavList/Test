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
let modeBtns;
let modeWraps;
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

function bindModeSwitch() {
    modeBtns = document.querySelectorAll(".mode-btn");
    modeWraps = document.querySelectorAll(".mode-wrap");
    const hash = window.location.hash.replace("#","");
    let targetMode = "favlist";
    if(hash.startsWith("mode=")) {
        targetMode = hash.split("=")[1];
    }
    function switchMode(modeName) {
        modeBtns.forEach(btn=>{
            const m = btn.dataset.mode;
            if(m === modeName) btn.classList.add("active");
            else btn.classList.remove("active");
        });
        modeWraps.forEach(wrap=>{
            const m = wrap.dataset.mode;
            if(m === modeName) {
                wrap.classList.remove("mode-hidden");
            } else {
                wrap.classList.add("mode-hidden");
            }
        });
        history.replaceState(null, "", `#mode=${modeName}`);
        window.scrollTo({top:0, behavior:"smooth"});
    }
    modeBtns.forEach(btn=>{
        btn.addEventListener("click", ()=>{
            const m = btn.dataset.mode;
            switchMode(m);
        });
    });
    switchMode(targetMode);
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

        // 放大镜开关面板（修复点击无响应）
        triggerBtn.onclick = null;
        triggerBtn.addEventListener("click", ()=>{
            panel.classList.toggle("active");
            if(panel.classList.contains("active")) {
                panelInput.focus();
                renderGameList(listWrap, panelInput.value);
            }
        });

        panelInput.oninput = null;
        panelInput.addEventListener("input", ()=>{
            renderGameList(listWrap, panelInput.value);
        });

        textarea.oninput = null;
        textarea.addEventListener("input", ()=>{
            annualData.topList[dataIdx].text = textarea.value;
            saveAnnualData();
        });

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
    btnAnnualExport.onclick = null;
    btnAnnualExport.addEventListener("click", async ()=>{
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
    });
}

window.addEventListener("DOMContentLoaded", ()=>{
    loadAnnualData();
    bindModeSwitch();
    bindStatInputs();
    bindTop3Items();
    bindAnnualExport();
});

declare function getWebImageUrl(src:string):string;
