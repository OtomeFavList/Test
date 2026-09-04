// ===================== script.js UI交互层（模块化导出） =====================
// 【重要说明】剧透弹窗、全局开关click事件全部迁移至main.js，本文件不再处理全局开关点击逻辑
// 游戏卡片动态生成的局部开关：使用事件委托对接main.js剧透弹窗逻辑
// 改造：每个游戏卡片内部渲染两套独立滑出面板 char / cp；不再使用全局唯一char-slide-panel
// 注意：main.js禁止import本文件，避免循环依赖
import {
  appData,
  gameTemplateList,
  currentEditGameId,
  charPoolMode,
  loadAllGameTemplates,
  loadData,
  saveData,
  syncSingleGameSwitch,
  fillFilterOptions,
  renderSelectedChar,
  renderCP,
  getAllGameChar,
  getAvailableCharImages,
  getCharDisplayName,
  getCharNameList,
  getCharShowHide,  // ✅补丁新增
  isTodayConfirmed,
  saveConfirmDate,
  renderGameSelectItem,
  bindDynamicGameCardSwitchEvents,
  toggleCharItemSelect,
  toggleCpItemSelect,
  switchCharImage,
  switchCharImageWithLoading,
  getWebImageUrl
} from './main.js';

// ========== 导入原生Canvas绘制导出模块 ==========
import { renderExportCanvas } from './export-canvas-render.js';

// ========== 导出预览全局状态锁与缓存 ==========
let isRendering = false;
let snapshotBlobCache = null;
// 【新增】全局保存所有预览页面url列表，用于多页预览
let previewPageUrlList = [];

// 缓存使用完毕后释放资源公共函数
function clearPreviewCacheResource() {
    // 释放所有分页图片资源
    previewPageUrlList.forEach(url => {
        if (url) URL.revokeObjectURL(url);
    });
    previewPageUrlList = [];
    snapshotBlobCache = null;
}

export function initPage(Core = {}) {
  // 安全兜底，防止不传Core报错
  Core = Core || {};

  /**
   * 在指定游戏卡片内部渲染滑出面板内容
   * @param {HTMLElement} cardDom 游戏卡片dom .added-game-card
   * @param {string} gameId
   * @param {'char'|'cp'} mode
   * @param {HTMLElement} panelDom 本卡片内的滑出面板容器
   */
  function renderCharSelectPanel(cardDom, gameId, mode, panelDom) {
    if (!Array.isArray(gameTemplateList)) return;
    const gameInfo = gameTemplateList.find(g => g.id === gameId);
    const gameItem = appData.gameList?.find(g => g?.gameId === gameId);
    if (!gameInfo || !gameItem || !panelDom) return;

    // ==========新增：本面板图片预加载收集池==========
    const preloadSrcList = [];

    // 面板头部
    const titleEl = panelDom.querySelector(".panel-game-title");
    const heroineBox = panelDom.querySelector(".heroine-box");
    const heroListBox = panelDom.querySelector(".hero-list-box");
    if (!titleEl || !heroineBox || !heroListBox) return;

    titleEl.innerText = `${gameInfo.name} — ${mode === "char" ? "选择角色 Character" : "选择角色 Couple"}`;

    // 废弃：renderLocalSwitchModalContent，开关已经渲染在卡片头部，此处不再调用
    const localWrap = panelDom.querySelector(".local-switch-wrap");
    if(localWrap) localWrap.innerHTML = "";

    const allChars = getAllGameChar(gameInfo);
    const femaleChars = allChars.filter(c => c.gender === "female");
    const maleChars = allChars.filter(c => c.gender === "male");

    if(mode === "char"){
        // ========= Character模式：改为草稿临时勾选，确认才写入真实数据 =========
        // 临时草稿集合，只在本次面板生命周期有效 Set<string>
        const tempCharDraftSet = new Set(gameItem.selectChars);

        let femHtml = "";
        femaleChars.forEach(char => {
            const imgsUnitList = getAvailableCharImages(char, appData.globalHideChar, appData.globalFD, gameItem.localHideChar, gameItem.localFD);
            if (imgsUnitList.length === 0) return;

            let allSrc = [];
            imgsUnitList.forEach(u => allSrc.push(...u.srcList));
            if (allSrc.length === 0) return;

            // ★ 修改：只加入当前图片 + 前后相邻图片（用完整 URL）
            if (allSrc.length > 0) {
                const saveKey = `char-img-${gameId}-${char.id}`;
                if(!appData.charImageSelect) appData.charImageSelect = {};
                let imgIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
                if (imgIndex >= allSrc.length) imgIndex = 0;

                const currentSrc = allSrc[imgIndex];
                if (currentSrc) preloadSrcList.push(getWebImageUrl(currentSrc));

                if (allSrc.length > 1) {
                    const prevIndex = (imgIndex - 1 + allSrc.length) % allSrc.length;
                    const nextIndex = (imgIndex + 1) % allSrc.length;
                    const prevSrc = allSrc[prevIndex];
                    const nextSrc = allSrc[nextIndex];
                    if (prevSrc) preloadSrcList.push(getWebImageUrl(prevSrc));
                    if (nextSrc) preloadSrcList.push(getWebImageUrl(nextSrc));
                }
            }

            // ★★★ 修改点：将 saveKey 改为带 char-img- 前缀 ★★★
            const saveKey = `char-img-${gameId}-${char.id}`;
            if(!appData.charImageSelect) appData.charImageSelect = {};
            let imgIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
            if (imgIndex >= allSrc.length) imgIndex = 0;
            const showSrc = allSrc[imgIndex];
            // ✅重点：selected 来自临时草稿，不再读取 gameItem.selectChars
            let selected = tempCharDraftSet.has(char.id) ? "selected" : "";

            // ✅补丁修改：待选角色多名字循环切换
            const showHideChar = getCharShowHide(char, appData.globalHideChar, gameItem.localHideChar, appData.globalFD, gameItem.localFD);
            const nmList = getCharNameList(char, showHideChar);
            const nmTotal = nmList.length;
            const canSwitchNm = nmTotal > 1;
            const nameSaveKey = `char-name-${gameId}-${char.id}`;
            if (!appData.charNameSelect) appData.charNameSelect = {};
            let nmIdx = Number(appData.charNameSelect[nameSaveKey] ?? 0);
            if (nmIdx >= nmTotal) nmIdx = 0;
            const dispNm = nmList[nmIdx] || char.name || "";
            const nmMultiCls = canSwitchNm ? "char-name-multi" : "";
            const nmSwitchBtns = canSwitchNm ? `
                <button class="char-name-switch-btn char-name-switch-prev" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&lt;</button>
                <button class="char-name-switch-btn char-name-switch-next" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&gt;</button>
            ` : "";
            // ✅补丁结束

            femHtml += `
            <div class="char-item ${selected}" data-cid="${char.id}" data-char-id="${char.id}" data-game-id="${gameId}" data-total-img="${allSrc.length}" data-panel-mode="char">
              <div class="char-card-img-box ${allSrc.length>1?'char-multi-img':''}">
                ${allSrc.length>1?`<button class="char-switch-btn char-switch-prev" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&lt;</button>`: ""}
                <img src="${getWebImageUrl(showSrc)}" alt="${dispNm}" decoding="async">
                ${allSrc.length>1?`<button class="char-switch-btn char-switch-next" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&gt;</button>`: ""}
              </div>
              <div class="char-card-name ${nmMultiCls}">
                ${nmSwitchBtns}
                <span class="char-name-text">${dispNm}</span>
              </div>
            </div>`;
        });
        heroineBox.innerHTML = femHtml;

        let maleHtml = "";
        maleChars.forEach(char => {
            const imgsUnitList = getAvailableCharImages(char, appData.globalHideChar, appData.globalFD, gameItem.localHideChar, gameItem.localFD);
            if (imgsUnitList.length === 0) return;

            let allSrc = [];
            imgsUnitList.forEach(u => allSrc.push(...u.srcList));
            if (allSrc.length === 0) return;

            // ★ 修改：只加入当前图片 + 前后相邻图片（用完整 URL）
            if (allSrc.length > 0) {
                const saveKey = `char-img-${gameId}-${char.id}`;
                if(!appData.charImageSelect) appData.charImageSelect = {};
                let imgIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
                if (imgIndex >= allSrc.length) imgIndex = 0;

                const currentSrc = allSrc[imgIndex];
                if (currentSrc) preloadSrcList.push(getWebImageUrl(currentSrc));

                if (allSrc.length > 1) {
                    const prevIndex = (imgIndex - 1 + allSrc.length) % allSrc.length;
                    const nextIndex = (imgIndex + 1) % allSrc.length;
                    const prevSrc = allSrc[prevIndex];
                    const nextSrc = allSrc[nextIndex];
                    if (prevSrc) preloadSrcList.push(getWebImageUrl(prevSrc));
                    if (nextSrc) preloadSrcList.push(getWebImageUrl(nextSrc));
                }
            }

            // ★★★ 修改点：将 saveKey 改为带 char-img- 前缀 ★★★
            const saveKey = `char-img-${gameId}-${char.id}`;
            if(!appData.charImageSelect) appData.charImageSelect = {};
            let imgIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
            if (imgIndex >= allSrc.length) imgIndex = 0;
            const showSrc = allSrc[imgIndex];
            // ✅重点：selected 来自临时草稿
            let selected = tempCharDraftSet.has(char.id) ? "selected" : "";

            // ✅补丁修改：待选角色多名字循环切换
            const showHideChar = getCharShowHide(char, appData.globalHideChar, gameItem.localHideChar, appData.globalFD, gameItem.localFD);
            const nmList = getCharNameList(char, showHideChar);
            const nmTotal = nmList.length;
            const canSwitchNm = nmTotal > 1;
            const nameSaveKey = `char-name-${gameId}-${char.id}`;
            if (!appData.charNameSelect) appData.charNameSelect = {};
            let nmIdx = Number(appData.charNameSelect[nameSaveKey] ?? 0);
            if (nmIdx >= nmTotal) nmIdx = 0;
            const dispNm = nmList[nmIdx] || char.name || "";
            const nmMultiCls = canSwitchNm ? "char-name-multi" : "";
            const nmSwitchBtns = canSwitchNm ? `
                <button class="char-name-switch-btn char-name-switch-prev" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&lt;</button>
                <button class="char-name-switch-btn char-name-switch-next" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&gt;</button>
            ` : "";
            // ✅补丁结束

            maleHtml += `
            <div class="char-item ${selected}" data-cid="${char.id}" data-char-id="${char.id}" data-game-id="${gameId}" data-total-img="${allSrc.length}" data-panel-mode="char">
              <div class="char-card-img-box ${allSrc.length>1?'char-multi-img':''}">
                ${allSrc.length>1?`<button class="char-switch-btn char-switch-prev" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&lt;</button>`: ""}
                <img src="${getWebImageUrl(showSrc)}" alt="${dispNm}" decoding="async">
                ${allSrc.length>1?`<button class="char-switch-btn char-switch-next" data-char-id="${char.id}" data-game-id="${gameId}" data-panel-mode="char">&gt;</button>`: ""}
              </div>
              <div class="char-card-name ${nmMultiCls}">
                ${nmSwitchBtns}
                <span class="char-name-text">${dispNm}</span>
              </div>
            </div>`;
        });
        heroListBox.innerHTML = maleHtml;

        // ✅追加确认/取消按钮栏，直接复用cp的css类
        const btnBarHtml = `
        <div class="cp-select-btn-bar">
            <button class="char-panel-cancel-btn" data-gid="${gameId}">取消</button>
            <button class="char-panel-confirm-btn" data-gid="${gameId}">确认</button>
        </div>`;
        panelDom.insertAdjacentHTML('beforeend', btnBarHtml);

        // 将草稿集合挂载到panelDom，委托事件可以读取
        panelDom._tempCharDraftSet = tempCharDraftSet;
    }else{
        // ====================== mode === "cp" 全新草稿模式逻辑 ======================
        // 兜底：旧存档没有cpEditState则自动生成【修改点1：增加femaleImgIndex:0】
        if(!Array.isArray(gameItem.cpEditState) || gameItem.cpEditState.length ===0){
            gameItem.cpEditState = femaleChars.map(f=>({
                femaleId: f.id,
                openMalePanel: false,
                maleIds: [],
                maleItems: [],
                femaleImgIndex: 0,
                femaleNameIndex: 0  // ✅补丁新增
            }));
        }

        // 【重构草稿结构：对齐Character，草稿只保存选中ID Set，不缓存imgIndex】
        const tempCpDraftMap = {};
        femaleChars.forEach(fChar=>{
            const state = gameItem.cpEditState.find(s=>s.femaleId === fChar.id);
            if(state){
                const selectedMidSet = new Set();
                if(Array.isArray(state.maleItems)){
                    state.maleItems.forEach(mi=>{
                        selectedMidSet.add(mi.charId);
                    })
                }
                tempCpDraftMap[fChar.id] = selectedMidSet;
            }
        });

        // 渲染CP面板HTML：每一位女主作为可点击按钮；展开则下方显示该女主专属男主选择区，自动换行
        let cpPanelHtml = "";
        femaleChars.forEach(fChar=>{
            const state = gameItem.cpEditState.find(s=>s.femaleId === fChar.id);
            if(!state) return;
            const draftMap = tempCpDraftMap[fChar.id];

            const imgsUnitList = getAvailableCharImages(fChar, appData.globalHideChar, appData.globalFD, gameItem.localHideChar, gameItem.localFD);
            let allSrc = [];
            imgsUnitList.forEach(u=>allSrc.push(...u.srcList));
            if(allSrc.length === 0) return;

            // ★ 修改：只加入当前图片 + 前后相邻图片（用完整 URL）
            if (allSrc.length > 0) {
                let imgIndex = Number(state.femaleImgIndex ?? 0);
                if (imgIndex >= allSrc.length) imgIndex = 0;

                const currentSrc = allSrc[imgIndex];
                if (currentSrc) preloadSrcList.push(getWebImageUrl(currentSrc));

                if (allSrc.length > 1) {
                    const prevIndex = (imgIndex - 1 + allSrc.length) % allSrc.length;
                    const nextIndex = (imgIndex + 1) % allSrc.length;
                    const prevSrc = allSrc[prevIndex];
                    const nextSrc = allSrc[nextIndex];
                    if (prevSrc) preloadSrcList.push(getWebImageUrl(prevSrc));
                    if (nextSrc) preloadSrcList.push(getWebImageUrl(nextSrc));
                }
            }

            //【修改点2：从cpEditState读取女主立绘下标，不再读appData.charImageSelect】
            let imgIndex = Number(state.femaleImgIndex ?? 0);
            if(imgIndex >= allSrc.length) imgIndex = 0;
            const showSrc = allSrc[imgIndex];

            // ✅补丁修改：CP女主待选多名字循环切换
            const fShowHideNm = getCharShowHide(fChar, appData.globalHideChar, gameItem.localHideChar, appData.globalFD, gameItem.localFD);
            const fNmList = getCharNameList(fChar, fShowHideNm);
            const fNmTotal = fNmList.length;
            const fCanSwitchNm = fNmTotal > 1;
            let fNmIdx = Number(state.femaleNameIndex ?? 0);
            if (fNmIdx >= fNmTotal) fNmIdx = 0;
            const fDispNm = fNmList[fNmIdx] || fChar.name || "";
            const fNmMultiCls = fCanSwitchNm ? "char-name-multi" : "";
            const fNmSwitchBtns = fCanSwitchNm ? `
                <button class="char-name-switch-btn char-name-switch-prev" data-char-id="${fChar.id}" data-game-id="${gameId}" data-panel-mode="cp" data-cp-female="1">&lt;</button>
                <button class="char-name-switch-btn char-name-switch-next" data-char-id="${fChar.id}" data-game-id="${gameId}" data-panel-mode="cp" data-cp-female="1">&gt;</button>
            ` : "";
            // ✅补丁结束

            // 女主卡片：增加data-char-id，多立绘渲染切换按钮，标记panel-mode="cp"
            // ★★★ 修复点：为 cp-female-card-btn 添加 data-game-id 属性 ★★★
            cpPanelHtml += `
            <div class="cp-female-block" data-fid="${fChar.id}" data-gid="${gameId}">
                <!-- 女主点击按钮 -->
                <div class="cp-female-card-btn" 
                    data-fid="${fChar.id}" 
                    data-char-id="${fChar.id}" 
                    data-game-id="${gameId}"
                    data-total-img="${allSrc.length}"
                    data-panel-mode="cp">
                    <div class="char-card-img-box ${allSrc.length>1?'char-multi-img':''}">
                        ${allSrc.length>1?`<button class="char-switch-btn char-switch-prev" data-char-id="${fChar.id}" data-game-id="${gameId}" data-total-img="${allSrc.length}" data-panel-mode="cp">&lt;</button>`:""}
                        <img src="${getWebImageUrl(showSrc)}" alt="${fDispNm}" decoding="async">
                        ${allSrc.length>1?`<button class="char-switch-btn char-switch-next" data-char-id="${fChar.id}" data-game-id="${gameId}" data-total-img="${allSrc.length}" data-panel-mode="cp">&gt;</button>`:""}
                    </div>
                    <div class="cp-female-name ${fNmMultiCls}">
                        ${fNmSwitchBtns}
                        <span class="char-name-text">${fDispNm}</span>
                    </div>
                </div>
                <!-- 如果openMalePanel=true，渲染该女主对应的男主候选列表 -->
                ${state.openMalePanel ? `
                <div class="cp-male-select-wrap" data-fid="${fChar.id}">
                    <div class="cp-male-title">为【${fChar.name}】选择角色</div>
                    <div class="cp-male-list">
                        ${maleChars.map(mChar=>{
                            const mImgs = getAvailableCharImages(mChar, appData.globalHideChar, appData.globalFD, gameItem.localHideChar, gameItem.localFD);
                            let mSrcArr = [];
                            mImgs.forEach(u=>mSrcArr.push(...u.srcList));
                            if(mSrcArr.length===0) return "";

                            // ★ 修改：只加入当前图片 + 前后相邻图片（用完整 URL）
                            if (mSrcArr.length > 0) {
                                // 预加载用，不影响逻辑
                                const mSaveKey = `cp-img-${gameId}-${mChar.id}`;
                                let mImgIndex = Number(appData.charImageSelect?.[mSaveKey] ?? 0);
                                if (mImgIndex >= mSrcArr.length) mImgIndex = 0;
                                const currentSrc = mSrcArr[mImgIndex];
                                if (currentSrc) preloadSrcList.push(getWebImageUrl(currentSrc));

                                if (mSrcArr.length > 1) {
                                    const prevIndex = (mImgIndex - 1 + mSrcArr.length) % mSrcArr.length;
                                    const nextIndex = (mImgIndex + 1) % mSrcArr.length;
                                    const prevSrc = mSrcArr[prevIndex];
                                    const nextSrc = mSrcArr[nextIndex];
                                    if (prevSrc) preloadSrcList.push(getWebImageUrl(prevSrc));
                                    if (nextSrc) preloadSrcList.push(getWebImageUrl(nextSrc));
                                }
                            }

                            // 【修改】草稿只存ID，渲染始终读取全局最新下标
                            const mSaveKey = `cp-img-${gameId}-${mChar.id}`;
                            let mImgIndex = Number(appData.charImageSelect?.[mSaveKey] ?? 0);
                            if(mImgIndex >= mSrcArr.length) mImgIndex = 0;
                            const mShowSrc = mSrcArr[mImgIndex];
                            const mSel = draftMap.has(mChar.id) ? "selected" : "";

                            // ✅补丁修改：CP男主待选多名字循环切换
                            const mShowHideNm = getCharShowHide(mChar, appData.globalHideChar, gameItem.localHideChar, appData.globalFD, gameItem.localFD);
                            const mNmList = getCharNameList(mChar, mShowHideNm);
                            const mNmTotal = mNmList.length;
                            const mCanSwitchNm = mNmTotal > 1;
                            const mNameSaveKey = `char-name-${gameId}-${mChar.id}`;
                            if (!appData.charNameSelect) appData.charNameSelect = {};
                            let mNmIdx = Number(appData.charNameSelect[mNameSaveKey] ?? 0);
                            if (mNmIdx >= mNmTotal) mNmIdx = 0;
                            const mDispNm = mNmList[mNmIdx] || mChar.name || "";
                            const mNmMultiCls = mCanSwitchNm ? "char-name-multi" : "";
                            const mNmSwitchBtns = mCanSwitchNm ? `
                                <button class="char-name-switch-btn char-name-switch-prev" data-char-id="${mChar.id}" data-game-id="${gameId}" data-panel-mode="cp">&lt;</button>
                                <button class="char-name-switch-btn char-name-switch-next" data-char-id="${mChar.id}" data-game-id="${gameId}" data-panel-mode="cp">&gt;</button>
                            ` : "";
                            // ✅补丁结束

                            return `
                            <div class="cp-male-item ${mSel}" 
                                data-fid="${fChar.id}" 
                                data-mid="${mChar.id}" 
                                data-char-id="${mChar.id}" 
                                data-game-id="${gameId}" 
                                data-total-img="${mSrcArr.length}"
                                data-panel-mode="cp">
                                <div class="char-card-img-box ${mSrcArr.length>1?'char-multi-img':''}">
                                    ${mSrcArr.length>1?`<button class="char-switch-btn char-switch-prev" data-char-id="${mChar.id}" data-game-id="${gameId}" data-total-img="${mSrcArr.length}" data-panel-mode="cp">&lt;</button>`:""}
                                    <img src="${getWebImageUrl(mShowSrc)}" alt="${mDispNm}" decoding="async">
                                    ${mSrcArr.length>1?`<button class="char-switch-btn char-switch-next" data-char-id="${mChar.id}" data-game-id="${gameId}" data-total-img="${mSrcArr.length}" data-panel-mode="cp">&gt;</button>`:""}
                                </div>
                                <div class="char-card-name ${mNmMultiCls}">
                                    ${mNmSwitchBtns}
                                    <span class="char-name-text">${mDispNm}</span>
                                </div>
                            </div>`;
                        }).join("")}
                    </div>
                </div>
                <!-- ✅按钮栏提升到cp-male-select-wrap外部，cp-female-block直接子节点 -->
                <div class="cp-select-btn-bar">
                    <button class="cp-cancel-btn" data-fid="${fChar.id}" data-gid="${gameId}">取消</button>
                    <button class="cp-confirm-btn" data-fid="${fChar.id}" data-gid="${gameId}">确认</button>
                </div>
                ` : ""}
            </div>
            `;
        });

        // cp模式下，清空原有heroineBox/heroListBox，直接输出新排版
        heroineBox.innerHTML = "";
        heroListBox.innerHTML = cpPanelHtml;

        // ==========【修改点5：cpList带上femaleImgIndex】==========
        gameItem.cpList = gameItem.cpEditState
            .filter(st=> Array.isArray(st.maleItems) && st.maleItems.length>0)
            .map(st=>({
                femaleId: st.femaleId,
                femaleImgIndex: st.femaleImgIndex ?? 0,
                femaleNameIndex: st.femaleNameIndex ?? 0,  // ✅补丁新增
                maleItems: st.maleItems.map(x=>({...x}))
            }));

        // 将草稿map挂载到panel dom上，事件委托可以读取
        panelDom._tempCpDraftMap = tempCpDraftMap;
    }

    // ==========渲染HTML全部完成后，执行空闲预加载==========
    if(Core && typeof Core.preloadImagesInIdle === "function" && preloadSrcList.length > 0){
        // 去重：避免同一个图片url多次传入
        const uniqueSrc = [...new Set(preloadSrcList)];
        Core.preloadImagesInIdle(uniqueSrc);
    }
  }

  /**
   * 生成单个游戏卡片内部滑出面板HTML字符串
   * @param {'char'|'cp'} mode
   */
  function getInnerSlidePanelHtml(mode){
    const cls = mode === "char" ? "char-slide-panel-char" : "char-slide-panel-cp";
    // 移除hide-block，默认无class，靠 .active 控制显示
    return `
    <div class="${cls}">
      <div class="panel-header">
        <h4 class="panel-game-title"></h4>
        <button class="panel-close-btn">×</button>
      </div>
      <div class="local-switch-wrap"></div>
      <div class="heroine-box"></div>
      <div class="hero-list-box"></div>
    </div>
    `;
  }

  // ===================== 页面启动bootstrap，UI渲染、表单、导出、卡片事件 =====================
  async function bootstrap() {
    // 防止多次调用bootstrap重复注册click监听
    if((window).__uiListenerRegistered) return;
    (window).__uiListenerRegistered = true;

    // DOM元素缓存，移除全局char-slide-panel
    const el = {
      globalHideChar: document.getElementById("global-hide-char"),
      globalFD: document.getElementById("global-fd-game"),
      spoilerModal: document.getElementById("spoiler-modal"),
      spoilerConfirm: document.getElementById("spoiler-confirm"),
      addGameBtn: document.getElementById("btn-add-game"),
      searchPanel: document.getElementById("search-panel"),
      gameSearchInput: document.getElementById("game-search-input"),
      gameSelectList: document.getElementById("game-select-list"),
      addedGameBox: document.getElementById("added-game-container"),
      inputNick: document.getElementById("input-nick"),
      inputCount: document.getElementById("input-count"),
      inputStory: document.getElementById("input-story"),
      inputFirstgame: document.getElementById("input-firstgame"),
      colorBg: document.getElementById("color-bg"),
      colorTitle: document.getElementById("color-title"),
      colorBaseInfoText: document.getElementById("color-baseinfotext"),
      colorCustomText: document.getElementById("color-customtext"),
      colorBorder: document.getElementById("color-border"),
      colorSubtitle: document.getElementById("color-subtitle"),
      colorGamename: document.getElementById("color-gamename"),
      exportBtn: document.getElementById("btn-export"),
      canvas: document.getElementById("export-canvas"),
      snapshotContainer: document.getElementById("snapshot-container"),
      // =========新增：导出折叠内容开关==========
      exportFoldContentSwitch: document.getElementById("export-fold-content"),
      // =========新增：显示隐藏/续作FD角色名开关==========
      exportShowHiddenFDNameSwitch: document.getElementById("export-show-hidden-fd-name"),
      // =========新增：恢复默认配色按钮==========
      resetColorBtn: document.getElementById("btn-reset-color"),
      // =========【新增】自定义文本字号滑块 ==========
      sliderCustomTextFont: document.getElementById("slider-custom-text-font"),
      customTextFontValueDisplay: document.getElementById("custom-text-font-value")
    };

    // ========== 预览弹窗元素 ==========
    const previewModal = document.getElementById("export-preview-modal");
    const previewScrollWrap = previewModal?.querySelector(".preview-scroll-wrap");
    const previewCloseBtn = document.getElementById("preview-close-btn");
    const previewRegenBtn = document.getElementById("preview-regen-btn");
    const previewDownloadBtn = document.getElementById("preview-download-btn");

    // ========== 预览弹窗按钮事件绑定 ==========
    if (previewModal) {
        // 点击遮罩关闭
        previewModal.addEventListener("click", function(e) {
            if (e.target === previewModal) {
                previewModal.classList.remove("active");
                clearPreviewCacheResource();
            }
        });

        // 关闭按钮
        if (previewCloseBtn) {
            previewCloseBtn.addEventListener("click", () => {
                previewModal.classList.remove("active");
                clearPreviewCacheResource();
            });
        }

        // 重新生成按钮
        if (previewRegenBtn) {
            previewRegenBtn.addEventListener("click", () => {
                previewModal.classList.remove("active");
                // 触发重新生成
                if (el.exportBtn) el.exportBtn.click();
            });
        }

        // 导出按钮（默认行为，会被导出逻辑覆盖）
        // 注意：这里使用 addEventListener，但在导出逻辑中会重新赋值 onclick 以支持多页
        if (previewDownloadBtn) {
            previewDownloadBtn.addEventListener("click", () => {
                // 这个监听器会被导出逻辑中的 onclick 覆盖，但保留以防万一
                if (!snapshotBlobCache) return;
                const link = document.createElement('a');
                link.download = `Otome_FavList_${new Date().getTime()}.png`;
                link.href = URL.createObjectURL(snapshotBlobCache);
                link.click();
                previewModal.classList.remove("active");
                clearPreviewCacheResource();
            });
        }
    }

    /**
     * 渲染已添加游戏卡片
     * 每个卡片内部嵌入两套滑出面板 char / cp
     * ✅传入容器对象el，消除ReferenceError
     */
    function renderAddedGame(el) {
      if (!el.addedGameBox) return;
      if (!Array.isArray(gameTemplateList) || gameTemplateList.length === 0) {
        el.addedGameBox.innerHTML = "<p>⚠️ 游戏数据加载失败，检查data/games路径</p>";
        return;
      }

      document.querySelectorAll(".modal-trigger").forEach(dom => dom.classList.remove("modal-trigger"));

      // =========【修复：第一步：预处理所有游戏数据，先补全cpEditState / cpList，不操作DOM】=========
      appData.gameList?.forEach((gameItem) => {
        if (!gameItem) return;
        const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
        if (!gameInfo) return;

        const allChars = getAllGameChar(gameInfo);
        const femaleChars = allChars.filter(c => c.gender === "female");

        //【修改点1：初始化增加femaleImgIndex:0】
        if(!Array.isArray(gameItem.cpEditState) || gameItem.cpEditState.length ===0){
            gameItem.cpEditState = femaleChars.map(f=>({
                femaleId: f.id,
                openMalePanel: false,
                maleIds: [],
                maleItems: [],
                femaleImgIndex: 0,
                femaleNameIndex: 0  // ✅补丁新增
            }));
        }
        // 预生成cpList，保证renderCP拿到最新数据【修改点5带上femaleImgIndex】
        gameItem.cpList = gameItem.cpEditState
            .filter(st=> Array.isArray(st.maleItems) && st.maleItems.length>0)
            .map(st=>({
                femaleId: st.femaleId,
                femaleImgIndex: st.femaleImgIndex ?? 0,
                femaleNameIndex: st.femaleNameIndex ?? 0,  // ✅补丁新增
                maleItems: st.maleItems.map(x=>({...x}))
            }));
      });

      // 全部预处理完成，再拼接HTML
      let html = "";
      appData.gameList?.forEach((gameItem, index) => {
        if (!gameItem) return;
        const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
        if (!gameInfo) return;

        // 使用 SVG 矢量爱心，防止移动端强制渲染为 emoji
        const heartSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        let heartHtml = "";
        for (let i = 1; i <= 5; i++) {
          heartHtml += `<span class="heart ${gameItem.loveRate >= i ? 'active' : ''}" data-val="${i}">${heartSvg}</span>`;
        }

        // =========【新增：条件渲染本游戏局部开关】=========
        const hasLocalHideChar = gameInfo.charList.some(c => c.isHidden === true);
        const hasLocalFDChar = gameInfo.charList.some(c => c.isFD === true);
        const hasLocalSubChar = gameInfo.charList.some(c => c.isSub === true);
        const hasLocalFdSubChar = gameInfo.charList.some(c => c.isFdSub === true); // ✅补丁新增：检测是否存在续作/FD次要角色
        let switchRowInnerHtml = "";

        // 新增【单独显示本游戏次要角色】
        if(hasLocalSubChar){
            switchRowInnerHtml += `
            <div>
                <label class="switch">
                    <input type="checkbox" class="game-sub-switch" data-gameidx="${index}" ${(gameItem.localSubChar ?? false) ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>单独显示本游戏次要角色</span>
            </div>`;
        }

        // ✅补丁新增：单独显示本游戏续作/FD次要角色
        if(hasLocalFdSubChar){
            switchRowInnerHtml += `
            <div>
                <label class="switch">
                    <input type="checkbox" class="game-fd-sub-switch" data-gameidx="${index}" ${(gameItem.localFdSubChar ?? false) ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>单独显示本游戏续作/FD次要角色</span>
            </div>`;
        }

        if(hasLocalHideChar){
            switchRowInnerHtml += `
            <div>
                <label class="switch">
                    <input type="checkbox" class="game-hide-char" data-gameidx="${index}" ${(gameItem.localHideChar ?? false) ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>单独显示本游戏隐藏角色</span>
            </div>`;
        }
        if(hasLocalFDChar){
            switchRowInnerHtml += `
            <div>
                <label class="switch">
                    <input type="checkbox" class="game-fd-switch" data-gameidx="${index}" ${(gameItem.localFD ?? false) ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>单独显示本游戏续作/FD角色</span>
            </div>`;
        }
        const switchRowHtml = switchRowInnerHtml ? `<div class="game-switch-row">${switchRowInnerHtml}</div>` : "";
        // =========【新增结束】=========

        // ========== 新增三个自定义文本区域的HTML（已消除换行空白） ==========
        // 【修改点1】统一 placeholder 为 "自定义文本"，并在 textarea 后追加 <span class="resize-handle"></span>
        const headTextHtml = `<div class="game-custom-text-wrap"><textarea class="game-head-text-input" data-gid="${gameItem.gameId}" placeholder="自定义文本">${gameItem.gameHeadText || ''}</textarea><span class="resize-handle"></span></div>`;
        const charTextHtml = `<div class="game-custom-text-wrap"><textarea class="game-char-text-input" data-gid="${gameItem.gameId}" placeholder="自定义文本">${gameItem.charSectionText || ''}</textarea><span class="resize-handle"></span></div>`;
        const cpTextHtml = `<div class="game-custom-text-wrap"><textarea class="game-cp-text-input" data-gid="${gameItem.gameId}" placeholder="自定义文本">${gameItem.cpSectionText || ''}</textarea><span class="resize-handle"></span></div>`;

        html += `
        <div class="added-game-card" data-gameid="${gameItem.gameId}" data-fold="${!!gameItem.fold}">
          <div class="game-card-head">
            <div class="game-card-head-title-wrap">
              <h3>${gameInfo.name}</h3>
              ${gameItem.fold ? `<button class="game-fold-icon-expand" data-gid="${gameItem.gameId}">▼</button>` : ''}
            </div>
            <div class="heart-rate" data-gid="${gameItem.gameId}">
              ${heartHtml}
            </div>
            ${switchRowHtml}
            ${headTextHtml}
          </div>
          <!-- ✅全部移出game-card-head，作为added-game-card直接子节点 -->
          <div class="game-card-block-item char-section block-margin-gap">
            <button class="btn-character" data-gid="${gameItem.gameId}">选择角色 Character</button>
            ${getInnerSlidePanelHtml("char")}
            <div class="game-card-empty-tip char-card-wrapper char-selected-row" data-gid="${gameItem.gameId}">${renderSelectedChar(gameItem, gameInfo) || `<div class="empty-hint">暂未选择角色</div>`}</div>
            ${charTextHtml}
          </div>
          <div class="game-card-block-item cp-group block-margin-gap">
            <button class="btn-couple" data-gid="${gameItem.gameId}">选择角色 Couple</button>
            ${getInnerSlidePanelHtml("cp")}
            <div class="game-card-empty-tip cp-render-box" data-gid="${gameItem.gameId}">${renderCP(gameItem, gameInfo) || `<div class="empty-hint">暂未选择角色</div>`}</div>
            ${cpTextHtml}
          </div>
          <div class="card-bottom-buttons block-margin-gap">
            <button class="btn-fold fold-game btn-gray-bg" data-gid="${gameItem.gameId}">折叠</button>
            <button class="btn-del del-game btn-gray-bg" data-gid="${gameItem.gameId}">删除</button>
          </div>
        </div>
        `;
      });

      el.addedGameBox.innerHTML = html;
      bindGameCardEvent();

      document.querySelectorAll(".added-game-card").forEach(cardDom => {
        const gid = cardDom.dataset.gameid;
        const gameItem = appData.gameList.find(g => g.gameId === gid);
        const gameInfo = gameTemplateList.find(g => g.id === gid);
        if(!gameItem || !gameInfo) return;

        const charPanel = cardDom.querySelector(".char-slide-panel-char");
        const cpPanel = cardDom.querySelector(".char-slide-panel-cp");

        // DOM面板填充（只负责渲染滑出面板内部HTML，数据已经预处理完毕）
        if(charPanel) renderCharSelectPanel(cardDom, gid, "char", charPanel);
        if(cpPanel) renderCharSelectPanel(cardDom, gid, "cp", cpPanel);

        // 2.内容填充完毕，再根据状态打开面板
        if (!gameItem.fold) {
            if(gameItem.charPanelOpen) charPanel?.classList.add("active");
            if(gameItem.cpPanelOpen) cpPanel?.classList.add("active");
        }
      });
    }

    window.refreshGameCardUi = () => renderAddedGame(el);

    // ==========【全局事件委托：角色立绘左右切换 + CP全部业务逻辑】==========
    document.addEventListener("click", async function (e) {
      // ==========【新增：自定义文本输入框点击不处理，避免干扰】==========
      const textInput = e.target.closest(".game-head-text-input,.game-char-text-input,.game-cp-text-input");
      if (textInput) {
          // 不阻止默认行为，仅忽略点击事件，由input事件处理
          return;
      }

      // ==========【新增：图片点击冒泡兼容，解决cp面板点击图片需要两次】==========
      if(e.target.tagName === "IMG"){
          // 允许事件向上冒泡至父级char-item / cp-male-item，不拦截
      }

      // ==========【新增】折叠状态：游戏标题旁图标展开按钮 ==========
      const iconExpandBtn = e.target.closest(".game-fold-icon-expand");
      if (iconExpandBtn) {
          e.stopPropagation();
          const gid = iconExpandBtn.dataset.gid;
          const gameItem = appData.gameList?.find(g => g.gameId === gid);
          if (!gameItem) return;
          // 图标按钮只做【展开】，只把fold置false
          gameItem.fold = false;
          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
          return;
      }

      const switchBtn = e.target.closest(".char-switch-btn");
      if (switchBtn) {
        e.stopPropagation();

        const charCard = switchBtn.closest(".char-item, .char-card-item, .cp-female-card-btn, .cp-male-item");
        const charId = charCard.dataset.charId;
        const gameId = charCard.dataset.gameId;
        const panelMode = switchBtn.dataset.panelMode || charCard.dataset.panelMode;
        const gameInfo = gameTemplateList.find(g => g.id === gameId);
        if (!gameInfo) return;

        const char = gameInfo.charList.find(c => c.id === charId);
        if (!char) return;

        const gameItem = appData.gameList?.find(g => g.gameId === gameId);
        if (!gameItem) return;

        const availImgUnits = getAvailableCharImages(
          char,
          appData.globalHideChar,
          appData.globalFD,
          gameItem.localHideChar,
          gameItem.localFD
        );

        let allSrc = [];
        availImgUnits.forEach(unit => allSrc.push(...unit.srcList));
        if (allSrc.length <= 1) return;

        // ========== 修复：区分 char/CP女主/CP男主 ==========
        let currentIndex;
        let saveKey = "";
        const isCpFemaleCard = charCard.classList.contains("cp-female-card-btn");

        if (panelMode === "char") {
            // char普通角色：char-img-{gid}-{cid}
            saveKey = `char-img-${gameId}-${charId}`;
            if(!appData.charImageSelect) appData.charImageSelect = {};
            currentIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
        } else if (panelMode === "cp") {
            if (isCpFemaleCard) {
                // CP女主：唯一数据源 cpEditState.femaleImgIndex
                const targetGameItem = appData.gameList?.find(g=>g.gameId === gameId);
                const st = targetGameItem?.cpEditState.find(s=>s.femaleId === charId);
                currentIndex = Number(st?.femaleImgIndex ?? 0);
            } else {
                // CP男主：cp-img-{gid}-{cid}
                saveKey = `cp-img-${gameId}-${charId}`;
                if(!appData.charImageSelect) appData.charImageSelect = {};
                currentIndex = Number(appData.charImageSelect?.[saveKey] ?? 0);
            }
        }

        // 下标自增/自减
        if (switchBtn.classList.contains("char-switch-next")) {
          currentIndex++;
          if (currentIndex >= allSrc.length) currentIndex = 0;
        } else {
          currentIndex--;
          if (currentIndex < 0) currentIndex = allSrc.length - 1;
        }

        // ========== 分支回写持久化数据 ==========
        if (panelMode === "char") {
            appData.charImageSelect[saveKey] = currentIndex;
        } else if (panelMode === "cp") {
            const cpPanel = charCard.closest(".char-slide-panel-cp");
            const fid = charCard.dataset.fid;
            const targetGameItem = appData.gameList?.find(g=>g.gameId === gameId);

            if (isCpFemaleCard) {
                // CP女主：写入cpEditState.femaleImgIndex，禁止写入charImageSelect
                const st = targetGameItem?.cpEditState.find(s=>s.femaleId === charId);
                if(st) st.femaleImgIndex = currentIndex;
            } else {
                // CP男主：写入全局存储；草稿不再缓存imgIndex，无需同步草稿
                appData.charImageSelect[saveKey] = currentIndex;
            }
        }

        saveData();

        // ========== 替换为带loading切换函数 ==========
        const imgBox = charCard.querySelector(".char-card-img-box");
        if(imgBox){
            // ★★★ 修复：将相对路径转为完整 R2 URL ★★★
            const fullUrl = getWebImageUrl(allSrc[currentIndex]);
            await switchCharImageWithLoading(imgBox, fullUrl);
            // ========== 后备：强制更新图片 src ==========
            const imgDom = imgBox.querySelector("img");
            if (imgDom && imgDom.src !== fullUrl) {
                imgDom.src = fullUrl;
            }
        }
        // =========【新增调试日志】=========
        console.log("mode",panelMode,"charId",charId,"currentIndex",currentIndex,"src",allSrc[currentIndex]);
        return; //处理完图片切换直接return，不再往下执行cp逻辑
      }

      // ========== ✅补丁修改：待选面板 角色名切换按钮（多名字循环） ==========
      const nameSwitchBtn = e.target.closest(".char-name-switch-btn");
      if (nameSwitchBtn) {
        e.stopPropagation();
        const charCard = nameSwitchBtn.closest(".char-item, .cp-female-card-btn, .cp-male-item");
        if (!charCard) return;
        const charId = charCard.dataset.charId;
        const gameId = charCard.dataset.gameId;
        const panelMode = nameSwitchBtn.dataset.panelMode || charCard.dataset.panelMode;
        const isCpFemale = !!nameSwitchBtn.dataset.cpFemale;
        const gameItem = appData.gameList?.find(g => g.gameId === gameId);
        if (!gameItem) return;
        // ✅补丁修改：多名字循环切换
        const nmGameInfo = gameTemplateList.find(g => g.id === gameId);
        const nmChar = nmGameInfo?.charList?.find(c => c.id === charId);
        // ✅补丁修改：隐藏开关或FD开关（角色isFD时）任一开启即显示隐藏名
        const nmShowHide = getCharShowHide(
            nmChar,
            appData.globalHideChar,
            gameItem?.localHideChar ?? false,
            appData.globalFD,
            gameItem?.localFD ?? false
        );
        const nmList = getCharNameList(nmChar, nmShowHide);
        const nmTotal = nmList.length;
        const isPrevBtn = nameSwitchBtn.classList.contains("char-name-switch-prev");
        if (panelMode === "cp" && isCpFemale) {
          // CP女主：循环写入 cpEditState.femaleNameIndex
          const st = gameItem.cpEditState?.find(s => s.femaleId === charId);
          if (st) {
            let cur = Number(st.femaleNameIndex ?? 0);
            if (cur >= nmTotal) cur = 0;
            st.femaleNameIndex = isPrevBtn ? (cur - 1 + nmTotal) % nmTotal : (cur + 1) % nmTotal;
          }
        } else {
          // Character / CP男主：循环写入全局 charNameSelect
          const saveKey = `char-name-${gameId}-${charId}`;
          if (!appData.charNameSelect) appData.charNameSelect = {};
          let curIdx = Number(appData.charNameSelect[saveKey] ?? 0);
          if (curIdx >= nmTotal) curIdx = 0;
          const newIdx = isPrevBtn ? (curIdx - 1 + nmTotal) % nmTotal : (curIdx + 1) % nmTotal;
          appData.charNameSelect[saveKey] = newIdx;
        }
        saveData();
        // 直接更新DOM文字，不整卡重渲染（避免面板状态丢失）
        const nameBox = charCard.querySelector(".char-card-name, .cp-female-name");
        const nameTextEl = nameBox?.querySelector(".char-name-text");
        if (nameTextEl && gameId) {
          const gameInfo = gameTemplateList.find(g => g.id === gameId);
          const char = gameInfo?.charList?.find(c => c.id === charId);
          if (char) {
            const showHide = getCharShowHide(char, appData.globalHideChar, gameItem.localHideChar, appData.globalFD, gameItem.localFD);
            let curIdx;
            if (panelMode === "cp" && isCpFemale) {
              curIdx = Number(gameItem.cpEditState?.find(s => s.femaleId === charId)?.femaleNameIndex ?? 0);
            } else {
              curIdx = Number(appData.charNameSelect[`char-name-${gameId}-${charId}`] ?? 0);
            }
            nameTextEl.textContent = getCharDisplayName(char, curIdx, showHide);
          }
        }
        return;
      }
      // ========== 补丁结束 ==========

      // ============下面全部是原来CP事件逻辑（移到此处）============
      const cpFemaleBtn = e.target.closest(".cp-female-card-btn");
      if(cpFemaleBtn){
          e.stopPropagation();
          const fid = cpFemaleBtn.dataset.fid;
          const card = cpFemaleBtn.closest(".added-game-card");
          const gid = card.dataset.gameid;
          const gameItem = appData.gameList.find(g=>g.gameId === gid);
          if(!gameItem) return;
          const st = gameItem.cpEditState.find(s=>s.femaleId === fid);
          if(st){
              st.openMalePanel = !st.openMalePanel;
          }
          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
          return;
      }

      // ============================================================
      // ★★★ 修改点：cpMaleItem 点击逻辑（对齐Character面板交互） ★★★
      // ============================================================
      const cpMaleItem = e.target.closest(".char-slide-panel-cp .cp-male-item");
      if(cpMaleItem){
          // 交互规则对齐character面板：点击切换按钮 → 仅切换立绘，不选中角色
          const switchBtn = e.target.closest(".char-switch-btn");
          if (switchBtn) {
              return;
          }
          const fid = cpMaleItem.dataset.fid;
          const mid = cpMaleItem.dataset.mid;
          const gameId = cpMaleItem.dataset.gameId;
          const panel = cpMaleItem.closest(".char-slide-panel-cp");
          if(!panel) return;
          const draftMap = panel._tempCpDraftMap;
          if(!draftMap || !draftMap[fid]) return;
          const selectedMidSet = draftMap[fid];
          if(selectedMidSet.has(mid)){
              selectedMidSet.delete(mid);
              cpMaleItem.classList.remove("selected");
          }else{
              // 草稿仅记录选中ID，不再缓存imgIndex；下标确认时实时读取全局
              selectedMidSet.add(mid);
              cpMaleItem.classList.add("selected");
          }
          e.stopPropagation();
          return;
      }

      //【修改点5】确认按钮：写入maleItems，保留maleIds兼容旧存档
      const cpConfirmBtn = e.target.closest(".cp-confirm-btn");
      if(cpConfirmBtn){
          e.stopPropagation();
          const fid = cpConfirmBtn.dataset.fid;
          const gid = cpConfirmBtn.dataset.gid;
          const panel = cpConfirmBtn.closest(".char-slide-panel-cp");
          const draftMap = panel._tempCpDraftMap;
          if(!draftMap || !draftMap[fid]) return;
          const gameItem = appData.gameList.find(g=>g.gameId === gid);
          if(!gameItem) return;

          const st = gameItem.cpEditState.find(s=>s.femaleId === fid);
          if(!st) return;
          const selectedMidSet = draftMap[fid];
          st.maleItems = [];
          // ✅对齐Character逻辑：确认时实时读取全局最新立绘下标
          selectedMidSet.forEach(cid=>{
              const mSaveKey = `cp-img-${gid}-${cid}`;
              const latestImgIndex = Number(appData.charImageSelect?.[mSaveKey] ?? 0);
              // ✅补丁新增：读取男主名字索引
              const mNameKey = `char-name-${gid}-${cid}`;
              const latestNameIndex = Number(appData.charNameSelect?.[mNameKey] ?? 0);
              st.maleItems.push({charId:cid, imgIndex: latestImgIndex, nameIndex: latestNameIndex});
          });
          // 旧字段兼容保留，不再业务读取
          st.maleIds = Array.from(selectedMidSet.keys());

          gameItem.cpEditState.forEach(item=>{
              item.openMalePanel = false;
          });
          gameItem.cpPanelOpen = false;

          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
          return;
      }

      //取消按钮
      const cpCancelBtn = e.target.closest(".cp-cancel-btn");
      if(cpCancelBtn){
          e.stopPropagation();
          const fid = cpCancelBtn.dataset.fid;
          const gid = cpCancelBtn.dataset.gid;
          const gameItem = appData.gameList.find(g=>g.gameId === gid);
          if(!gameItem) return;
          const st = gameItem.cpEditState.find(s=>s.femaleId === fid);
          if(st){
              st.openMalePanel = false;
          }
          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
          return;
      }

      // ==========【修复：btn-character / btn-couple 全局事件委托】==========
      const charBtn = e.target.closest(".btn-character");
      if(charBtn){
        const gid = charBtn.dataset.gid;
        const gameItem = appData.gameList.find(g=>g.gameId === gid);
        if(!gameItem) return;
        gameItem.charPanelOpen = !gameItem.charPanelOpen;
        if(gameItem.charPanelOpen){
          gameItem.cpPanelOpen = false;
        }
        saveData();
        clearPreviewCacheResource(); // 缓存失效
        requestAnimationFrame(()=>{
            window.refreshGameCardUi();
        });
        return;
      }

      const cpBtn = e.target.closest(".btn-couple");
      if(cpBtn){
        const gid = cpBtn.dataset.gid;
        const gameItem = appData.gameList.find(g=>g.gameId === gid);
        if (!gameItem) return;
        gameItem.cpPanelOpen = !gameItem.cpPanelOpen;
        if(gameItem.cpPanelOpen){
          gameItem.charPanelOpen = false;
        }
        saveData();
        clearPreviewCacheResource(); // 缓存失效
        requestAnimationFrame(()=>{
            window.refreshGameCardUi();
        });
        return;
      }

      // ========= char面板确认按钮：把草稿集合同步到真实 selectChars / selectCharItems，关闭面板 =========
      const charConfirmBtn = e.target.closest(".char-panel-confirm-btn");
      if(charConfirmBtn){
          e.stopPropagation();
          const gid = charConfirmBtn.dataset.gid;
          const panelDom = charConfirmBtn.closest(".char-slide-panel-char");
          const draftSet = panelDom._tempCharDraftSet;
          const gameItem = appData.gameList.find(g=>g.gameId === gid);
          if(!gameItem || !draftSet) return;

          // 1.清空旧selectChars、selectCharItems
          gameItem.selectChars = [];
          gameItem.selectCharItems = [];

          // 2.遍历草稿集合写入真实数据
          draftSet.forEach(charId=>{
              gameItem.selectChars.push(charId);
              const imgIndex = Number(appData.charImageSelect[`char-img-${gid}-${charId}`] ?? 0);
              // ✅补丁新增：读取名字索引并写入
              const nameIndex = Number(appData.charNameSelect?.[`char-name-${gid}-${charId}`] ?? 0);
              gameItem.selectCharItems.push({
                  charId: charId,
                  imgIndex: imgIndex,
                  nameIndex: nameIndex
              });
          });

          // 关闭char面板
          gameItem.charPanelOpen = false;
          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>window.refreshGameCardUi());
          return;
      }

      // ========= char面板取消按钮：丢弃草稿，直接关闭面板，不做任何修改 =========
      const charCancelBtn = e.target.closest(".char-panel-cancel-btn");
      if(charCancelBtn){
          e.stopPropagation();
          const gid = charCancelBtn.dataset.gid;
          const gameItem = appData.gameList.find(g=>g.gameId === gid);
          if(!gameItem) return;
          gameItem.charPanelOpen = false;
          saveData();
          clearPreviewCacheResource(); // 缓存失效
          requestAnimationFrame(()=>window.refreshGameCardUi());
          return;
      }

      // ✅ 卡片内滑出面板角色勾选事件委托：仅处理char模式面板角色勾选
      const charItem = e.target.closest(".char-slide-panel-char .char-item");
      if (charItem) {
          const cid = charItem.dataset.cid;
          const gameId = charItem.dataset.gameId;
          const gameItem = appData.gameList?.find(g => g.gameId === gameId);
          if (!gameItem) return;

          const panelChar = charItem.closest(".char-slide-panel-char");
          if (panelChar) {
              // ========= char模式：仅操作本地草稿集合，不写真实数据 =========
              const draftSet = panelChar._tempCharDraftSet;
              if(!draftSet) return;
              if(draftSet.has(cid)){
                  draftSet.delete(cid);
                  charItem.classList.remove("selected");
              }else{
                  draftSet.add(cid);
                  charItem.classList.add("selected");
              }
              // ❗不保存、不关闭面板，等待用户点确认/取消
              return;
          }
          // 【移除旧cp废弃分支，新版cp全部使用cp-maleItem + 确认按钮草稿模式】
          return;
      }

      // ✅面板内部关闭按钮（×）
      const closeBtn = e.target.closest(".panel-close-btn");
      if(closeBtn){
        const panel = closeBtn.closest(".char-slide-panel-char, .char-slide-panel-cp");
        if(!panel) return;

        const card = panel.closest(".added-game-card");
        const gid = card.dataset.gameid;
        const gameItem = appData.gameList.find(g=>g.gameId === gid);
        if(!gameItem) return;

        if(panel.classList.contains("char-slide-panel-char")){
          gameItem.charPanelOpen = false;
        }else{
          gameItem.cpPanelOpen = false;
        }
        saveData();
        clearPreviewCacheResource(); // 缓存失效
        requestAnimationFrame(()=>{
            window.refreshGameCardUi();
        });
        return;
      }
    });

    function refreshHideCharSwitch() {
      if (el.globalHideChar) {
        el.globalHideChar.checked = appData.globalHideChar;
        el.globalHideChar.indeterminate = false;
      }
    }

    function refreshFDSwitch() {
      if (el.globalFD) {
        el.globalFD.checked = appData.globalFD;
        el.globalFD.indeterminate = false;
      }
    }

    // ============修复：加上await================
    await loadData();

    if(Array.isArray(appData.gameList)){
      appData.gameList.forEach(g=>{
        if(typeof g.charPanelOpen !== "boolean") g.charPanelOpen = false;
        if(typeof g.cpPanelOpen !== "boolean") g.cpPanelOpen = false;
        if(typeof g.loveRate !== "number") g.loveRate = 0;
        if(!Array.isArray(g.selectChars)) g.selectChars = [];
        if(!Array.isArray(g.cpSelectIds)) g.cpSelectIds = [];
        if(!Array.isArray(g.cpEditState)) g.cpEditState = [];
      });
    }

    if (el.inputNick) el.inputNick.value = appData.baseInfo?.nick ?? "";
    if (el.inputCount) el.inputCount.value = appData.baseInfo?.count ?? "";
    if (el.inputStory) el.inputStory.value = appData.baseInfo?.story ?? "";
    if (el.inputFirstgame) el.inputFirstgame.value = appData.baseInfo?.firstgame ?? "";

    // ========= 扩展颜色绑定：7项（增加CSS变量支持） =========
    const colorBindList = [
      {dom: el.colorBg, dataKey: "bg", cssVar: "--export-bg", default:"#fff7f9"},
      {dom: el.colorTitle, dataKey: "title", cssVar: "--export-title", default:"#b33a3a"},
      {dom: el.colorSubtitle, dataKey: "subTitle", cssVar: "--export-subtitle", default:"#b85878"},
      {dom: el.colorBaseInfoText, dataKey: "baseInfoText", cssVar: "--export-baseinfotext", default:"#c98fac"},
      {dom: el.colorGamename, dataKey: "gameName", cssVar: "--export-gamename", default:"#000000"},
      {dom: el.colorCustomText, dataKey: "customText", cssVar: "--export-customtext", default:"#c98fac"},
      {dom: el.colorBorder, dataKey: "border", cssVar: "--export-border", default:"#f6a5b8"}
    ];

    colorBindList.forEach(item => {
      if (!item.dom) return;
      const initColor = appData.exportColor?.[item.dataKey] ?? item.default;
      item.dom.value = initColor;
      // 页面初始化时设置CSS变量
      document.body.style.setProperty(item.cssVar, initColor);

      item.dom.oninput = () => {
        if(!appData.exportColor) appData.exportColor = {};
        appData.exportColor[item.dataKey] = item.dom.value;
        // 实时更新CSS变量，页面立刻生效
        document.body.style.setProperty(item.cssVar, item.dom.value);
        saveData();
        clearPreviewCacheResource();
      }
    });

    // =========【新增：恢复默认配色按钮事件】==========
    if(el.resetColorBtn){
      el.resetColorBtn.addEventListener("click", ()=>{
        colorBindList.forEach(item=>{
          item.dom.value = item.default;
          if(!appData.exportColor) appData.exportColor = {};
          appData.exportColor[item.dataKey] = item.default;
          // 同步更新CSS变量
          document.body.style.setProperty(item.cssVar, item.default);
        });
        // =========【新增：重置自定义文本字体大小回到16px】==========
        if(el.sliderCustomTextFont && el.customTextFontValueDisplay){
            const defaultFs = 16;
            appData.exportCustomTextFontSize = defaultFs;
            el.sliderCustomTextFont.value = defaultFs;
            el.customTextFontValueDisplay.textContent = `${defaultFs}px`;
            // ✅必须调用，刷新 --slider-progress CSS变量，修复轨道颜色残留粉色
            updateSliderProgress(el.sliderCustomTextFont);
        }
        saveData();
        clearPreviewCacheResource();
      })
    }

    // =========【新增：自定义导出文本字号滑块初始化】==========
    // ✅提升到bootstrap函数顶层，全局可访问，不再嵌套在if判断内部
    function updateSliderProgress(sliderEl) {
        const min = Number(sliderEl.min);
        const max = Number(sliderEl.max);
        const val = Number(sliderEl.value);
        const percent = ((val - min) / (max - min)) * 100;
        // 重点：向父容器 .font‑size‑set‑row 设置变量，不要设置给input本身
        const rowWrap = sliderEl.closest('.font-size-set-row');
        if(rowWrap){
            rowWrap.style.setProperty('--slider-progress', `${percent}%`);
        }
    }

    if(el.sliderCustomTextFont && el.customTextFontValueDisplay){
        // 初始化，默认16，范围14‑42
        const initFontSize = Number(appData.exportCustomTextFontSize ?? 16);
        const safeInit = Math.max(14, Math.min(42, initFontSize));
        appData.exportCustomTextFontSize = safeInit;
        el.sliderCustomTextFont.value = safeInit;
        el.customTextFontValueDisplay.textContent = `${safeInit}px`;

        // 初始化设置进度
        updateSliderProgress(el.sliderCustomTextFont);
        el.sliderCustomTextFont.oninput = () => {
            const val = Number(el.sliderCustomTextFont.value);
            appData.exportCustomTextFontSize = val;
            el.customTextFontValueDisplay.textContent = `${val}px`;
            updateSliderProgress(el.sliderCustomTextFont); // ✅实时更新进度渐变
            saveData();
            clearPreviewCacheResource();
        };
    }

    // 注意：不再单独设置 body.style.background，由CSS变量统一控制

    // =========【新增】渲染【导出折叠内容】开关初始状态 =========
    if (el.exportFoldContentSwitch) {
        el.exportFoldContentSwitch.checked = !!appData.exportFoldContent;
    }
    // =========【新增】渲染【显示隐藏/续作/FD角色名】开关初始状态（默认关闭） =========
    if (el.exportShowHiddenFDNameSwitch) {
        el.exportShowHiddenFDNameSwitch.checked = !!appData.exportShowHiddenFDName;
    }

    refreshHideCharSwitch();
    refreshFDSwitch();
    fillFilterOptions(gameTemplateList);

    const baseInputMap = [
      {dom: el.inputNick, key: "nick"},
      {dom: el.inputCount, key: "count"},
      {dom: el.inputStory, key: "story"},
      {dom: el.inputFirstgame, key: "firstgame"}
    ];
    baseInputMap.forEach(item => {
      if (!item.dom) return;
      item.dom.oninput = function () {
        if(!appData.baseInfo) appData.baseInfo = {};
        appData.baseInfo[item.key] = this.value;
        saveData();
        clearPreviewCacheResource(); // 基础信息变更，缓存失效
      }
    });

    // =========【新增】导出折叠内容开关事件 =========
    if (el.exportFoldContentSwitch) {
        el.exportFoldContentSwitch.addEventListener("change", function() {
            appData.exportFoldContent = this.checked;
            saveData();
            clearPreviewCacheResource(); // 开关变更，预览缓存失效
        });
    }
    // =========【新增】显示隐藏/续作FD角色名开关事件 =========
    if (el.exportShowHiddenFDNameSwitch) {
        el.exportShowHiddenFDNameSwitch.addEventListener("change", function() {
            appData.exportShowHiddenFDName = this.checked;
            saveData();
            clearPreviewCacheResource();
        });
    }

    // ============【已修改：添加游戏按钮，支持再次点击关闭搜索面板】============
    if (el.addGameBtn) {
      el.addGameBtn.onclick = function () {
        renderGameSelectList();
        if (el.searchPanel) {
          if (el.searchPanel.classList.contains("active")) {
            el.searchPanel.classList.remove("active");
          } else {
            el.searchPanel.classList.add("active");
          }
        }
      }
    }

    if (el.gameSearchInput) {
      el.gameSearchInput.addEventListener("input", renderGameSelectList);
    }

    const filterSelectIds = ["filter-year", "filter-publisher", "filter-cn", "filter-writer", "filter-art"];
    filterSelectIds.forEach(selId => {
      const sel = document.getElementById(selId);
      if (sel) sel.addEventListener("change", renderGameSelectList);
    });

    // 导出尺寸单选 change 事件缓存失效
    document.querySelectorAll('input[name="export-size"]').forEach(radio => {
        radio.addEventListener("change", () => {
            clearPreviewCacheResource();
        });
    });

    function renderGameSelectList() {
      if (!el.gameSearchInput || !el.gameSelectList || !Array.isArray(gameTemplateList)) return;

      const keyword = el.gameSearchInput.value.toLowerCase();
      const filterYear = document.getElementById("filter-year")?.value || "";
      const filterPub = document.getElementById("filter-publisher")?.value || "";
      const filterCn = document.getElementById("filter-cn")?.value || "";
      const filterWriter = document.getElementById("filter-writer")?.value || "";
      const filterArt = document.getElementById("filter-art")?.value || "";

      // 修复：把zh-CN（软连字符）改为标准 zh-CN
      const sortedGames = [...gameTemplateList].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      let html = "";

      sortedGames.forEach((game, index) => {   // 增加 index
        if (!game) return;
        let match = true;

        // =========【新增：渲染副本+按lang规则排序writer/art】=========
        const gameCopy = {...game};
        function sortStaffByLang(list) {
            if (!Array.isArray(list)) return [];
            const langOrder = { zh:0, ja:1, en:2 };
            return [...list].sort((a,b)=>{
                const oA = langOrder[a.lang] ?? 99;
                const oB = langOrder[b.lang] ?? 99;
                if(oA !== oB) return oA - oB;

                const nameA = a.name;
                const nameB = b.name;
                if(a.lang === "zh"){
                    return nameA.localeCompare(nameB,"zh-CN");
                }else if(a.lang === "ja"){
                    return nameA.localeCompare(nameB,"ja-JP");
                }else if(a.lang === "en"){
                    const lowerA = nameA.toLowerCase();
                    const lowerB = nameB.toLowerCase();
                    if(lowerA !== lowerB){
                        return lowerA.localeCompare(lowerB,"en");
                    }else{
                        return nameA.localeCompare(nameB,"en");
                    }
                }
                return nameA.localeCompare(nameB);
            });
        }
        gameCopy.writer = sortStaffByLang(game.writer);
        gameCopy.art = sortStaffByLang(game.art);
        // =========【新增代码结束】=========

        if (keyword && !game.name?.toLowerCase().includes(keyword)) match = false;
        if (filterYear && game.year != filterYear) match = false;
        // 发行厂商筛选：数组包含匹配，对齐编剧、画师筛选逻辑
        if (filterPub && (!Array.isArray(game.publisher) || !game.publisher.includes(filterPub))) match = false;
        if (filterCn && game.cnStudio != filterCn) match = false;

        // ========== writer / art 对象数组匹配逻辑，读取原始game，保持不变 ==========
        if (filterWriter) {
          let writerNameList = [];
          if (Array.isArray(game.writer)) {
            writerNameList = game.writer.map(o=>o.name);
          }
          if (!writerNameList.includes(filterWriter)) match = false;
        }

        if(filterArt){
          let artNameList = [];
          if(Array.isArray(game.art)){
            artNameList = game.art.map(o=>o.name);
          }
          if(!artNameList.includes(filterArt)) match = false;
        }

        if (!match) return;
        //传入排序副本 gameCopy 和 index
        html += `<div class="game-option-item" data-game-id="${game.id}">` + renderGameSelectItem(gameCopy, index) + `</div>`;
      })

      el.gameSelectList.innerHTML = html;
      document.querySelectorAll(".game-option-item").forEach(item => {
        item.onclick = () => {
          const gid = item.dataset.gameId;
          const targetGame = gameTemplateList.find(g => g.id === gid);
          if (!targetGame) return alert("游戏数据加载异常");

          const exist = appData.gameList?.find(g => g.gameId === gid);
          if (exist) return alert("该游戏已添加！");

          const newGameData = {
            gameId: gid,
            fold: false,
            expand: false,
            charPanelOpen: false,
            cpPanelOpen: false,
            localHideChar: false,
            localFD: false,
            localSubChar: false, // ✅新增，新建游戏默认关闭次要角色开关
            localFdSubChar: false, // ✅补丁新增，新建游戏默认关闭续作/FD次要角色开关
            loveRate: 0,
            selectChars: [],
            cpSelectIds: [],
            cpList: [],
            cpEditState: [],
            // =========新增自定义文本字段==========
            gameHeadText: "",
            charSectionText: "",
            cpSectionText: ""
          };
          if(!appData.gameList) appData.gameList = [];
          appData.gameList.push(newGameData);
          saveData();
          clearPreviewCacheResource(); // 游戏列表变更，缓存失效

          //【修复】关闭搜索面板，使用.active
          if (el.searchPanel) el.searchPanel.classList.remove("active");
          window.refreshGameCardUi();
        }
      })
    }

    function bindGameCardEvent() {
      document.querySelectorAll(".fold-game").forEach(btn => {
        btn.onclick = () => {
          const gid = btn.dataset.gid;
          const gameItem = appData.gameList?.find(g => g.gameId === gid);
          if (!gameItem) return;
          gameItem.fold = !gameItem.fold;
          saveData();
          clearPreviewCacheResource(); // 折叠状态变更，缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
        }
      })

      document.querySelectorAll(".del-game").forEach(btn => {
        btn.onclick = () => {
          const gid = btn.dataset.gid;
          appData.gameList = appData.gameList.filter(g => g.gameId !== gid);
          saveData();
          clearPreviewCacheResource(); // 删除游戏，缓存失效
          requestAnimationFrame(()=>{
              window.refreshGameCardUi();
          });
        }
      })

      document.querySelectorAll(".heart-rate").forEach(box => {
        const gid = box.dataset.gid;
        const gameItem = appData.gameList?.find(g => g.gameId === gid);
        if (!gameItem) return;

        box.querySelectorAll(".heart").forEach(h => {
          h.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            gameItem.loveRate = Number(h.dataset.val);
            saveData();
            clearPreviewCacheResource(); // 评分变更，缓存失效

            const allHearts = box.querySelectorAll(".heart");
            allHearts.forEach(ht => {
              const val = Number(ht.dataset.val);
              if(val <= gameItem.loveRate){
                ht.classList.add("active");
              }else{
                ht.classList.remove("active");
              }
            });
          }
        })
      })
    }

    // ========== 导出按钮：先弹窗后渲染（原生Canvas绘制，无DOM捕获，支持分页） ==========
    if (el.exportBtn) {
        el.exportBtn.addEventListener('click', async () => {
            let unlockTimer = null;
            if (isRendering) {
                alert("正在渲染中，请稍候！");
                return;
            }
            clearPreviewCacheResource();
            isRendering = true;

            // 超时兜底：15秒强制解锁
            unlockTimer = setTimeout(() => {
                isRendering = false;
                console.warn("渲染超时，强制解除渲染锁");
            }, 15000);

            const previewModal = document.getElementById("export-preview-modal");
            const previewScrollWrap = previewModal?.querySelector(".preview-scroll-wrap");
            const downloadBtn = document.getElementById("preview-download-btn");

            try {
                // 打开预览弹窗并显示loading
                previewModal.classList.add("active");

                // ==========【新增：渲染耗时预估计算】==========
                // 1. 判断是否IOS WebKit（与export‑canvas‑render.js保持完全一致检测逻辑）
                const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                const isAndroid = /Android/.test(navigator.userAgent);

                // 2. 统计参与导出的有效游戏卡片数量（对齐renderExportCanvas过滤逻辑）
                let validGameCount = 0;
                let totalImageCount = 0;
                appData.gameList.forEach(gameItem => {
                    // 和renderExportCanvas保持一样过滤：不导出折叠卡片
                    if (!appData.exportFoldContent && gameItem.fold === true) {
                        return;
                    }
                    validGameCount += 1;

                    // 统计本游戏图片数量 char + cp
                    let imgCnt = 0;
                    // char角色图片
                    if(Array.isArray(gameItem.selectChars)) imgCnt += gameItem.selectChars.length;
                    // cp：女主 + 每个男主
                    if(Array.isArray(gameItem.cpList)){
                        gameItem.cpList.forEach(cp=>{
                            imgCnt += 1; //女主
                            if(Array.isArray(cp.maleItems)) imgCnt += cp.maleItems.length;
                        })
                    }
                    totalImageCount += imgCnt;
                });

                // ==========【修改后：预估计算纳入图源降级、重试、圆角画布串行开销】==========
                // 3. 分平台设置耗时系数，纳入：jsdelivr超时降级COS、单图最多2次重试、圆角画布串行延时、IOS离屏画布sleep开销
                let gameCardCost, imgCost, networkBufferSec, roundCanvasOverheadSec;
                if(IS_IOS_WEBKIT){
                    gameCardCost = 1.10;
                    imgCost = 0.85;
                    // IOS：jsdelivr超时(600ms) + 重试2次 + COS降级请求 + 圆角画布每一张30ms串行sleep
                    networkBufferSec = 4.8;
                    roundCanvasOverheadSec = Math.min(8, totalImageCount * 0.030);
                }else if(isAndroid){
                    gameCardCost = 0.55;
                    imgCost = 0.40;
                    // Android：重试+降级，圆角画布12ms间隔
                    networkBufferSec = 2.6;
                    roundCanvasOverheadSec = Math.min(4, totalImageCount * 0.012);
                }else{
                    // PC：网络重试降级，圆角画布小延时
                    gameCardCost = 0.35;
                    imgCost = 0.25;
                    networkBufferSec = 1.8;
                    roundCanvasOverheadSec = Math.min(2.5, totalImageCount * 0.012);
                }

                // 基础渲染耗时
                let baseEstimate = validGameCount * gameCardCost + totalImageCount * imgCost;

                // 【重点】叠加图片重试降级开销：每张图片理论最大会经历 jsdelivr超时(600ms) + COS请求
                // 不按全部图片都降级来算，取30%图片触发降级作为现实网络场景的经验值
                const fallbackProbability = 0.30;
                const fallbackPerImageSec = 0.6;
                let fallbackEstimate = totalImageCount * fallbackProbability * fallbackPerImageSec;

                // 总预估
                let estimateSec = Math.ceil(baseEstimate + networkBufferSec + roundCanvasOverheadSec + fallbackEstimate);

                // 上下限保护，调大IOS上限，PC保持原有上限
                if(IS_IOS_WEBKIT){
                    estimateSec = Math.max(2, Math.min(45, estimateSec));
                }else{
                    estimateSec = Math.max(1, Math.min(35, estimateSec));
                }
                // ==========【修改结束】==========

                // =====================【补丁新增：渲染进度UI补丁 开始】 =====================
                // 渲染进度监听，只在本次渲染生命周期有效，渲染结束移除监听
                let progressHandler;
                progressHandler = function(e) {
                  const p = e.detail.percent.toFixed(0);
                  const progressDom = previewScrollWrap.querySelector('.render-progress-text');
                  if(progressDom){
                    progressDom.textContent = `进度：${p}%`;
                  }
                };
                window.addEventListener('canvas-render-progress', progressHandler);

                previewScrollWrap.innerHTML = `
                    <div class="preview-inner-loading">
                        <div class="loading-spinner"></div>
                        <p>正在生成预览，请稍候…<br>预计耗时：${estimateSec}s</p>
                        <p class="render-progress-text" style="margin-top:8px;font-size:14px;">进度：0%</p>
                    </div>
                `;
                if (downloadBtn) downloadBtn.disabled = true;
                // =====================【补丁新增：渲染进度UI补丁 结束】 =====================

                // 获取导出尺寸配置
                const sizeRadio = document.querySelector('input[name="export-size"]:checked');
                if (!sizeRadio) throw new Error("未选中导出尺寸");
                const sizeVal = sizeRadio.value;

                let targetWidth = 0;
                let maxPageHeight = 0;
                let isLongMode = false;

                if (sizeVal === "long-640") {
                    targetWidth = 640;
                    isLongMode = true;
                } else if (sizeVal === "long-810") {
                    targetWidth = 810;
                    isLongMode = true;
                } else if (sizeVal === "long-1080") {
                    targetWidth = 1080;
                    isLongMode = true;
                } else {
                    // 固定尺寸，开启分页
                    const [w, h] = sizeVal.split(',').map(Number);
                    targetWidth = w;
                    maxPageHeight = h;
                }

                // 【核心】调用原生Canvas绘制模块，返回 Blob 数组
                const blobList = await renderExportCanvas(targetWidth, isLongMode, maxPageHeight, appData, gameTemplateList);
                if (!Array.isArray(blobList) || blobList.length === 0) throw new Error("Canvas绘制失败，未能生成图片");

                // 多页预览状态
                let currentPreviewPage = 0;
                // 预生成所有页面 objectUrl，统一保存到全局数组
                const pageObjectUrlList = blobList.map(blob => URL.createObjectURL(blob));
                // 保存到全局用于资源释放
                previewPageUrlList = pageObjectUrlList;

                // 渲染预览区域：图片 + 分页控件
                function renderPreviewPage(pageIndex) {
                    currentPreviewPage = pageIndex;
                    const totalPage = blobList.length;
                    const currentUrl = pageObjectUrlList[currentPreviewPage];

                    let paginationHtml = "";
                    if(totalPage > 1) {
                        paginationHtml = `
                        <div class="preview-pagination-bar" style="margin-top:12px;display:flex;gap:12px;align-items:center;justify-content:center;">
                            <button class="preview-prev-page" ${currentPreviewPage <= 0 ? 'disabled' : ''}>上一页</button>
                            <span>第 ${currentPreviewPage+1} / ${totalPage} 页</span>
                            <button class="preview-next-page" ${currentPreviewPage >= totalPage-1 ? 'disabled' : ''}>下一页</button>
                        </div>
                        `;
                    }

                    previewScrollWrap.innerHTML = `
                        <img class="preview-img-item" src="${currentUrl}" alt="导出预览">
                        ${paginationHtml}
                    `;

                    // 绑定分页切换事件
                    const prevBtn = previewScrollWrap.querySelector(".preview-prev-page");
                    const nextBtn = previewScrollWrap.querySelector(".preview-next-page");
                    if(prevBtn) {
                        prevBtn.onclick = () => {
                            if(currentPreviewPage > 0) renderPreviewPage(currentPreviewPage - 1);
                        }
                    }
                    if(nextBtn) {
                        nextBtn.onclick = () => {
                            if(currentPreviewPage < totalPage - 1) renderPreviewPage(currentPreviewPage + 1);
                        }
                    }
                }

                // 初始渲染第1页
                renderPreviewPage(0);

                if (downloadBtn) downloadBtn.disabled = false;

                // === 重新绑定下载按钮，支持多页批量下载 ===
                previewDownloadBtn.onclick = () => {
                    if (!blobList || blobList.length === 0) return;
                    const baseTime = new Date().getTime();
                    blobList.forEach((blob, pageIdx) => {
                        const link = document.createElement('a');
                        const pageSuffix = blobList.length > 1 ? `_page${pageIdx+1}` : "";
                        link.download = `Otome_FavList_${baseTime}${pageSuffix}.png`;
                        link.href = URL.createObjectURL(blob);
                        link.click();
                    });
                    previewModal.classList.remove("active");
                    clearPreviewCacheResource();
                    // 额外释放所有分页url资源（clear中已做）
                };

            } catch (err) {
                console.error("导出图片失败：", err);
                previewScrollWrap.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#c0392b;">
                        <p>图片渲染失败</p>
                        <p style="font-size:14px;margin-top:8px;">${err.message || '请检查控制台错误信息'}</p>
                    </div>
                `;
                alert("导出失败，请查看控制台错误。");
            } finally {
                // =====================【补丁新增：清理进度事件监听】 =====================
                if(typeof progressHandler !== 'undefined'){
                    window.removeEventListener('canvas-render-progress', progressHandler);
                }
                // ===================== 补丁结束 =====================
                if (unlockTimer) clearTimeout(unlockTimer);
                isRendering = false;
            }
        });
    }

    // ✅仅启动时执行一次事件委托绑定，卡片渲染完成后
    if (typeof bindDynamicGameCardSwitchEvents === "function") {
      bindDynamicGameCardSwitchEvents();
    }

    // ==========【新增：自定义文本输入实时保存】==========
    document.addEventListener("input", function(e) {
        const target = e.target;
        const gid = target.dataset.gid;
        if(!gid) return;
        const gameItem = appData.gameList.find(g=>g.gameId === gid);
        if(!gameItem) return;

        if(target.classList.contains("game-head-text-input")){
            gameItem.gameHeadText = target.value;
        }else if(target.classList.contains("game-char-text-input")){
            gameItem.charSectionText = target.value;
        }else if(target.classList.contains("game-cp-text-input")){
            gameItem.cpSectionText = target.value;
        } else {
            return;
        }
        saveData();
        clearPreviewCacheResource(); // 文字变更，导出缓存失效
    });

    // ========== 右下角悬浮按钮 - 滚动到【添加游戏按钮】&滚动到最后游戏卡片 ==========
    const backToAddBtn = document.getElementById('back-to-add-btn');
    const scrollToLastGameBtn = document.getElementById('scroll-to-last-game-btn');
    const targetAddBtn = document.getElementById('btn-add-game');
    const addedGameContainer = document.getElementById('added-game-container');

    if (backToAddBtn && targetAddBtn) {
        backToAddBtn.addEventListener('click', function() {
            targetAddBtn.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    }

    if (scrollToLastGameBtn) {
        // ▼按钮点击：滚动到最后一张游戏卡片
        scrollToLastGameBtn.addEventListener('click', function () {
            const lastGameCard = document.querySelector('.added-game-card:last-of-type');
            if(lastGameCard){
                lastGameCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    }

    /* 【补丁修改】移除滚动控制按钮显隐逻辑，两个按钮永久可见；保留原有点击逻辑不变 */
    // 按钮点击逻辑完全保留不变，只删除显示隐藏相关代码

    // ==========【新增】自制textarea垂直拖拽逻辑（PC+移动端touch兼容） ==========
    function bindTextareaResizeHandler() {
        document.querySelectorAll('.game-custom-text-wrap .resize-handle').forEach(handle => {
            // 防止重复绑定
            if(handle.dataset.resizeBinded === "1") return;
            handle.dataset.resizeBinded = "1";

            const wrap = handle.closest('.game-custom-text-wrap');
            const textarea = wrap.querySelector('textarea');
            let startY = 0;
            let startHeight = 0;
            let isDragging = false;

            // 统一开始拖拽
            function dragStart(y) {
                isDragging = true;
                startY = y;
                startHeight = textarea.clientHeight;
                document.body.style.cursor = "ns-resize";
                // 禁止页面滚动干扰拖拽
                document.body.style.touchAction = "none";
            }
            // 拖拽进行
            function dragMove(y) {
                if (!isDragging) return;
                const deltaY = y - startY;
                const newHeight = Math.max(44, startHeight + deltaY);
                textarea.style.height = newHeight + "px";
            }
            // 拖拽结束
            function dragEnd() {
                if (!isDragging) return;
                isDragging = false;
                document.body.style.cursor = "";
                document.body.style.touchAction = "";
            }

            // 鼠标事件
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragStart(e.clientY);
            });
            // 触摸事件（移动端核心）
            handle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                dragStart(e.touches[0].clientY);
            });

            // 全局移动/结束监听
            document.addEventListener('mousemove', (e) => dragMove(e.clientY));
            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                dragMove(e.touches[0].clientY);
            });
            document.addEventListener('touchend', dragEnd);
        });
    }
    // 每次刷新卡片UI后重新绑定拖拽控件
    const originRefresh = window.refreshGameCardUi;
    window.refreshGameCardUi = function() {
        originRefresh();
        requestAnimationFrame(()=>{
            bindTextareaResizeHandler();
        });
    }

    // 初始执行一次刷新渲染
    window.refreshGameCardUi();
  }

  function openCharSelectModal(){}
  function renderCharSelectList(){}
  window.openCharSelectModal = openCharSelectModal;
  window.renderCharSelectList = renderCharSelectList;

  // 不再此处直接调用bootstrap，交给index.html时序控制
  window.uiBootstrap = bootstrap;
}
