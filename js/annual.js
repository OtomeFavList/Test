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
}

// bindTop3Items内部：按钮handler修改
addBtn._clickHandler = ()=>{
    const isOpen = panel.classList.contains("active");
    if(isOpen){
        panel.classList.remove("active");
    }else{
        panel.classList.add("active");
        panelInput.focus();
        renderGameList(listWrap, panelInput.value);
    }
};
addBtn.addEventListener("click", addBtn._clickHandler);
