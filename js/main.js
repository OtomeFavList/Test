// ===================== main.js 【数据层、公共工具函数】 =====================
// 🚨【新增游戏请在此数组添加编号！】请勿改动其他位置
const gameIdList = [
    "001", "002", "003", "004", "005", "006", "007", "008", "009", "010",
    "011", "012", "013", "014", "015", "016", "017", "018", "019", "020",
    "021", "022", "023", "024", "025", "026", "027", "028", "029", "030",
    "031", "032", "033", "034", "035", "036", "037", "038", "039", "040",
    "041", "042", "043", "044", "045", "046", "047", "048", "049", "050",
    "051", "052", "053", "054", "055", "056", "057", "058", "059", "060",
    "061", "062", "063", "064", "065", "066", "067", "068", "069", "070",
    "071", "072", "073", "074", "075", "076", "077", "078", "079", "080",
    "081", "082", "083", "084", "085", "086", "087", "088", "089", "090",
    "091", "092", "093", "094", "095", "096", "097", "098", "099", "100",
    "101", "102", "103", "104", "105", "106", "107", "108", "109", "110",
    "111", "112", "113", "114", "115", "116", "117", "118", "119", "120",
    "121", "122", "123", "124", "125", "126", "127", "128", "129", "130",
    "131", "132", "133", "134", "135", "136", "137", "138", "139", "140",
    //新增游戏在这里追加
];

// ===================== 全局存储key【不再随意修改！】 =====================
export const STORE_KEY = "otome-favlist-data";               // 主存储键，永不改变
export const DATA_VERSION = 3;                              // 数据版本号，用于迁移（2→3：新增globalSubChar / localSubChar字段）
export const OLD_STORE_KEYS = [                               // 历史遗留 key，用于自动迁移
    "otome-favlist-data-v1",
    "otome-favlist-data-v1.1"
];
export const SPOILER_DATE_KEY = "spoiler-confirm-date";       // 全局剧透确认日期
export const SPOILER_LOCAL_SWITCH_KEY = "local-switch-spoiler-date"; // 局部开关确认日期

// ===================== 图片URL域名配置 =====================
export const R2_BASE_URL = "https://pub-7fe3cf5d6e78426b988975ff957a6ee9.r2.dev";
// 【修复】移除 @main，避免 301 重定向
export const JSD_BASE_URL = "https://cdn.jsdelivr.net/gh/OtomeFavList/OtomeFavList.github.io/img";

// 腾讯云COS备用源，仅jsd超时/请求失败才使用
export const TENCENT_COS_BASE_URL = "https://otome-images-1471675741.cos.ap-guangzhou.myqcloud.com";
// jsd请求超时阈值(毫秒)，超时触发COS降级，4500ms兼顾跨境网络与用户体验
export const JSD_FALLBACK_TIMEOUT = 4500;

// ===================== 路径标准化工具（根治 URL 二次拼接） =====================
/**
 * 清洗旧版带 @main 的 jsDelivr 地址（向后兼容）
 * 优化：使用更通用的正则，兼容URL中间出现@main
 */
export function cleanOldJsdUrl(url) {
    if (!url || typeof url !== "string") return url;
    return url.replace(/(OtomeFavList\/OtomeFavList.github.io)@main/g, "$1");
}

/**
 * 路径标准化：统一输出相对路径
 * 支持：
 * 1. 相对路径 char/xxx.jpg → 直接返回
 * 2. R2完整URL → 提取相对路径
 * 3. jsDelivr完整URL → 提取相对路径
 * @param {string} src
 * @returns {string|null} 清洗后的相对路径
 */
export function normalizeImageRelPath(src) {
    if (!src || typeof src !== "string") return null;
    const s = src.trim();
    // 直接拦截 raw 地址（排查异常数据源）
    if (s.includes("raw.githubusercontent.com")) {
        console.error("❌ normalizeImageRelPath 检测到 raw.githubusercontent.com 地址，已丢弃", src, new Error().stack);
        return null;
    }
    // 已经是相对路径，不含http
    if (!s.startsWith("http")) {
        return s;
    }
    // R2链接提取路径
    if (s.startsWith(R2_BASE_URL + "/")) {
        return s.slice(R2_BASE_URL.length + 1);
    }
    // jsDelivr链接提取路径（兼容旧版带@main的地址）
    const cleaned = cleanOldJsdUrl(s);
    if (cleaned.startsWith(JSD_BASE_URL + "/")) {
        return cleaned.slice(JSD_BASE_URL.length + 1);
    }
    // 无法识别的外部链接直接丢弃，禁止非法地址向下流转
    console.error("❌ normalizeImageRelPath 无法识别的外部图片链接，已丢弃", s);
    return null;
}

/**
 * 安全生成页面展示R2地址（自动兼容旧数据完整URL）
 * @param {string} relPath 相对路径或完整URL
 * @returns {string} 可用的图片URL
 */
export function getWebImageUrl(relPath) {
    // 清洗可能的旧地址
    const cleaned = cleanOldJsdUrl(relPath);
    const cleanPath = normalizeImageRelPath(cleaned);
    if (!cleanPath) return "";
    // 如果清洗后仍然是完整http链接，直接返回（外部图兜底）
    if (cleanPath.startsWith("http")) return cleanPath;
    return `${R2_BASE_URL}/${cleanPath}`;
}

/**
 * 安全生成Canvas jsDelivr地址（自动兼容旧数据完整URL）
 * 统一使用jsDelivr，禁止Canvas直接读取GitHub Pages源文件
 * @param {string} relPath 相对路径或完整URL
 * @returns {string} 可用的图片URL
 */
export function getCanvasImageUrl(relPath) {
    // 清洗可能的旧地址
    const cleaned = cleanOldJsdUrl(relPath);
    const cleanPath = normalizeImageRelPath(cleaned);
    if (!cleanPath) return "";
    if (cleanPath.startsWith("http")) return cleanPath;
    // 统一使用jsDelivr，规避跨域
    return `${JSD_BASE_URL}/${cleanPath}`;
}

/**
 * R2完整链接 → jsDelivr链接（专供Canvas导出模块转换）
 * 增强版：增加强校验，彻底杜绝R2地址泄漏
 * @param {string} path 相对路径或完整URL
 * @returns {string}
 */
export function convertR2ToJsDelivr(path) {
    if (!path) return "";
    // 拦截raw地址流入转换函数，便于定位异常数据源
    if (path.includes("raw.githubusercontent.com")) {
        console.error("❌ convertR2ToJsDelivr 检测到raw地址流入！", path);
        return "";
    }
    // 标准化提取相对路径
    const rel = normalizeImageRelPath(path);
    // 标准化后如果依然是http链接，代表无法识别，非法链接，告警
    if (rel && rel.startsWith("http")) {
        console.error("❌ convertR2ToJsDelivr 无法转换的外部图片地址:", path);
        return "";
    }
    const jsdUrl = getCanvasImageUrl(rel);
    // 二次防御：确保输出绝对不能是R2域名
    if (jsdUrl.startsWith(R2_BASE_URL)) {
        console.error("❌ 转换函数异常，输出R2地址！原始path:", path);
        return "";
    }
    return jsdUrl;
}

// ===================== 全局应用数据对象 =====================
export let appData = {
    globalHideChar: false,
    globalFD: false,
    globalSubChar: false, // ✅新增：全局次要角色开关，默认关闭
    // ==========新增==========
    exportFoldContent: true,
    gameSpoilerRecord: {},
    baseInfo: { nick: "", count: "", story: "", firstgame: "" },
    gameList: [],
    // ========= 修改：新增 subTitle、gameName，设置默认值 =========
    exportColor: {
        bg: "#fff7f9",
        title: "#b33a3a",
        subTitle: "#b85878",
        baseInfoText: "#c98fac",
        customText: "#c98fac",
        gameName: "#000000",   // ✅ 修改为黑色，用户仍可自定义
        border: "#f6a5b8"
    },
    charImageSelect: {} // 持久存储角色选中立绘索引 key:"char-img-gameId-charId"
};

// ===================== 导出画布 全局间距常量【严格匹配结构图px规范】 =====================
export const LAYOUT_SPACE = {
  BODY_PADDING: 20,
  WRAP_GAP: 30,
  SITE_TITLE_MT: 30,
  SITE_TITLE_MB: 10,

  BIG_CARD_PADDING: 24,
  BIG_CARD_H2_MB: 20,

  SWITCH_ROW_MARGIN: 14,
  SWITCH_ROW_GAP: 12,

  FORM_ROW_MARGIN: 16,
  FORM_DOUBLE_GAP: 32,

  CENTER_BTN_MARGIN: 16,
  CENTER_BTN_GAP: 12,

  GAME_SEARCH_PADDING: 16,
  GAME_SEARCH_GAP: 10,
  FILTER_GROUP_GAP: 8,

  GAME_LIST_MARGIN: 12,
  GAME_GRID_GAP: 14,

  ADDED_GAME_CARD_PADDING: 16,
  ADDED_GAME_CARD_MB: 14,

  GAME_CARD_HEAD_MB: 12,
  GAME_HEAD_INNER_GAP: 10,
  HEART_GAP: 6,

  GAME_CARD_BLOCK_MB: 24,
  CHAR_ROW_GAP: 14,

  CP_COLUMN_GAP: 16,
  CP_MALE_GAP: 12,

  CARD_BOTTOM_BTN_MT: 14,
  CARD_BOTTOM_BTN_GAP: 10,

  ABOUT_MT: 50,
  ABOUT_PADDING: 20,
  ABOUT_P_MARGIN: 8,

  // 角色卡片固定尺寸（规范固定）
  CHAR_CARD_W: 120,
  CHAR_CARD_MIN_H: 168,
  CHAR_IMG_BOX_RATIO: 1,
  CHAR_IMG_BOX_MB: 8,
  CHAR_CARD_INNER_PADDING: 8
};

// 样式常量（导出配色、圆角、边框宽度，同步appData.exportColor）
export const LAYOUT_STYLE = {
  BIG_CARD_BORDER_WIDTH: 2,
  CARD_BORDER_WIDTH: 1,
  BIG_CARD_RADIUS: 16,
  GAME_CARD_RADIUS: 12,
  CHAR_CARD_RADIUS: 10,
  CHAR_IMG_RADIUS: 8
};

// ===================== 游戏模板数据兜底变量 =====================
// 兜底：游戏数据模块加载失败时赋值空数组，彻底解决undefined报错
export let gameTemplateList = [];
// 【新增】游戏模板加载就绪标记
export let gameTemplateReady = false;

// ===================== 角色编辑弹窗全局状态变量 =====================
export let currentEditGameId = null;
export let charPoolMode = "char"; // char = 单选角色, cp = CP搭配

// ===================== 剧透弹窗临时待处理标记 =====================
// 可选值：hideChar / fdGame / localHide / localFD
window.pendingGlobalSwitch = null;

// 动态游戏卡片待操作标记
window.pendingGameOp = null;

// ===================== 本地存储读写工具函数 =====================
/**
 * 将appData完整保存到localStorage
 */
export function saveData() {
    localStorage.setItem(STORE_KEY, JSON.stringify(appData));
}

// ============================================================
// 【重构】loadData：隔离旧数据、独立迁移区块、深度合并、自动清理缓存
// ============================================================
export function loadData() {
    try {
        let raw = localStorage.getItem(STORE_KEY);
        let migrateFromOldKey = false;
        // 主key无数据，尝试迁移所有旧版本key
        if (!raw) {
            for (const oldKey of OLD_STORE_KEYS) {
                const oldRaw = localStorage.getItem(oldKey);
                if (oldRaw) {
                    raw = oldRaw;
                    migrateFromOldKey = true;
                    console.log(`✅发现旧存档 ${oldKey}，执行迁移到主键 ${STORE_KEY}`);
                    localStorage.setItem(STORE_KEY, raw);
                    break;
                }
            }
        }

        // 临时对象隔离原始存储数据，不直接污染全局appData
        let loadedRaw = null;
        if (raw) loadedRaw = JSON.parse(raw);

        // 【1】基础合并：先复制默认模板，再融合用户数据（规避顶层浅覆盖嵌套对象）
        const tempData = structuredClone(appData);
        if (loadedRaw && typeof loadedRaw === "object") {
            // 顶层键覆盖，嵌套对象后续单独兼容补齐
            Object.assign(tempData, loadedRaw);
        }

        // ========== 【独立版本迁移区块】未来所有版本升级逻辑写在这里 ==========
        let needSaveAfterMigrate = false;
        if (tempData._version === undefined || tempData._version < DATA_VERSION) {
            console.log("📌执行数据结构升级迁移", tempData._version ?? "无版本号", "→", DATA_VERSION);
            // ===== 增量版本迁移分支，按版本从小到大依次编写 =====
            // 1.1 → 2 迁移：charImageSelect key改名 gameId-charId → char-img-gameId-charId
            if (tempData._version < 2) {
                console.log("🔧执行 1.1 → 2 迁移：转换charImageSelect存储键名");
                if (tempData.charImageSelect) {
                    const newCharImgSelect = {};
                    Object.entries(tempData.charImageSelect).forEach(([key, val]) => {
                        if (!key.startsWith("char-img-")) {
                            const newKey = `char-img-${key}`;
                            newCharImgSelect[newKey] = val;
                        } else {
                            newCharImgSelect[key] = val;
                        }
                    });
                    tempData.charImageSelect = newCharImgSelect;
                }
                needSaveAfterMigrate = true;
            }
            // ===== 2 → 3 迁移：新增 globalSubChar / localSubChar 字段 =====
            if (tempData._version < 3) {
                console.log("🔧执行 2 → 3 迁移：新增次要角色开关字段");
                // 标记：从旧版本升级到ver3，下一次模板就绪后强制完整清洗图片脏链接
                tempData._triggerImageCleanOnce = true;
                needSaveAfterMigrate = true;
            }
            // 全部迁移完成后，更新为最新版本号
            tempData._version = DATA_VERSION;
        }

        // ===================== 【新增：存量脏图片链接一次性清洗迁移逻辑】 =====================
        if (Array.isArray(tempData.gameList)) {
            // 防护兜底：如果游戏模板还未就绪，直接跳过清洗，避免脏链接残留
            if (!gameTemplateReady || !Array.isArray(gameTemplateList) || gameTemplateList.length === 0) {
                console.warn("⚠️ loadData：游戏模板未就绪，跳过存量图片链接清洗，将在下一次页面加载执行");
            } else {
                let hasDirtyUrl = false;
                // 遍历每条游戏记录
                tempData.gameList.forEach(gameItem => {
                    if (!Array.isArray(gameItem.selectCharItems)) return;
                    // 遍历选中角色条目，只处理图片相关索引，不改动charId等业务数据
                    gameItem.selectCharItems.forEach(charItem => {
                        const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
                        if (!gameInfo?.charList || !charItem?.charId) return;
                        const targetChar = gameInfo.charList.find(c => c.id === charItem.charId);
                        if (!targetChar?.images || !Array.isArray(targetChar.images)) return;

                        // 获取该角色全部可用图片src列表
                        let allSrcList = [];
                        targetChar.images.forEach(imgUnit => {
                            if (Array.isArray(imgUnit.srcList)) {
                                allSrcList.push(...imgUnit.srcList);
                            }
                        });

                        // 校验当前存储索引是否越界，同时清洗源数据里残留脏链接（持久层清理）
                        const cleanSrcList = allSrcList
                            .map(src => normalizeImageRelPath(src))
                            .filter(Boolean); // normalize返回null代表非法链接，直接剔除

                        if (cleanSrcList.length === 0) {
                            return;
                        }
                        // 索引超出范围则重置为0
                        if (typeof charItem.imgIndex !== "number" || charItem.imgIndex >= cleanSrcList.length) {
                            charItem.imgIndex = 0;
                            hasDirtyUrl = true;
                        }
                    });
                });

                // 额外兜底：遍历cp内女主、男主立绘索引（CP模块同样清理脏路径风险）
                tempData.gameList.forEach(gameItem => {
                    if (!Array.isArray(gameItem.cpList)) return;
                    gameItem.cpList.forEach(cp => {
                        if (!cp.femaleId) return;
                        const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
                        if (!gameInfo?.charList) return;
                        const fChar = gameInfo.charList.find(c => c.id === cp.femaleId);
                        if (fChar?.images) {
                            let fSrcList = [];
                            fChar.images.forEach(u => Array.isArray(u.srcList) && fSrcList.push(...u.srcList));
                            const cleanFList = fSrcList.map(normalizeImageRelPath).filter(Boolean);
                            if (cleanFList.length > 0 && cp.femaleImgIndex >= cleanFList.length) {
                                cp.femaleImgIndex = 0;
                                hasDirtyUrl = true;
                            }
                        }

                        if (!Array.isArray(cp.maleItems)) return;
                        cp.maleItems.forEach(mi => {
                            if (!mi.charId) return;
                            const mChar = gameInfo.charList.find(c => c.id === mi.charId);
                            if (mChar?.images) {
                                let mSrcList = [];
                                mChar.images.forEach(u => Array.isArray(u.srcList) && mSrcList.push(...u.srcList));
                                const cleanMList = mSrcList.map(normalizeImageRelPath).filter(Boolean);
                                if (cleanMList.length > 0 && mi.imgIndex >= cleanMList.length) {
                                    mi.imgIndex = 0;
                                    hasDirtyUrl = true;
                                }
                            }
                        });
                    });
                });

                // 关键：检测到脏数据，标记需要持久化保存清洗后数据
                if (hasDirtyUrl) {
                    console.log("🧹存量脏图片链接/越界索引已清理，将永久写入清洗后数据");
                    needSaveAfterMigrate = true;
                }
            }
        }
        // ===================== 【清洗迁移逻辑结束】 =====================

        // ==========【补丁1：浅层内存拦截，模板未就绪也阻断raw地址，防止直接渲染raw请求】==========
        if(Array.isArray(tempData.gameList)){
            tempData.gameList.forEach(gameItem=>{
                // selectCharItems
                if(Array.isArray(gameItem.selectCharItems)){
                    gameItem.selectCharItems.forEach(s=>{
                        // 这里只拦截url字符串出现在对象字段；本项目imgIndex是数字，这里仅防御扩展
                        for(const key in s){
                            const val = s[key];
                            if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                console.error("🛡️ loadData浅层拦截丢弃raw地址 selectCharItems",val);
                                s[key] = null;
                            }
                        }
                    })
                }
                // cpList
                if(Array.isArray(gameItem.cpList)){
                    gameItem.cpList.forEach(cp=>{
                        for(const key in cp){
                            const val = cp[key];
                            if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                console.error("🛡️ loadData浅层拦截丢弃raw地址 cp字段",val);
                                cp[key]=null;
                            }
                        }
                        if(Array.isArray(cp.maleItems)){
                            cp.maleItems.forEach(mi=>{
                                for(const key in mi){
                                    const val = mi[key];
                                    if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                        console.error("🛡️ loadData浅层拦截丢弃raw地址 maleItems",val);
                                        mi[key]=null;
                                    }
                                }
                            })
                        }
                    })
                }
            })
        }
        // ==========【补丁1结束】==========

        // ========== 全局字段兜底（统一放在迁移完成后） ==========
        if (typeof tempData.exportFoldContent !== "boolean") {
            tempData.exportFoldContent = true;
        }
        if (!tempData.exportColor) tempData.exportColor = {};
        tempData.exportColor.bg = tempData.exportColor.bg ?? "#fff7f9";
        tempData.exportColor.title = tempData.exportColor.title ?? "#b33a3a";
        tempData.exportColor.subTitle = tempData.exportColor.subTitle ?? "#b85878";
        if (tempData.exportColor.text !== undefined && tempData.exportColor.baseInfoText === undefined) {
            tempData.exportColor.baseInfoText = tempData.exportColor.text;
        }
        tempData.exportColor.baseInfoText = tempData.exportColor.baseInfoText ?? "#c98fac";
        tempData.exportColor.customText = tempData.exportColor.customText ?? tempData.exportColor.baseInfoText;
        tempData.exportColor.gameName = tempData.exportColor.gameName ?? "#000000";
        tempData.exportColor.border = tempData.exportColor.border ?? "#f6a5b8";

        // gameList成员兜底
        if (Array.isArray(tempData.gameList)) {
            tempData.gameList.forEach(g => {
                if (typeof g.localHideChar !== "boolean") g.localHideChar = false;
                if (typeof g.localFD !== "boolean") g.localFD = false;
                if (typeof g.localSubChar !== "boolean") g.localSubChar = false; // ✅新增兜底，旧存档自动补false
                if (typeof g.charPanelOpen !== "boolean") g.charPanelOpen = false;
                if (typeof g.cpPanelOpen !== "boolean") g.cpPanelOpen = false;
                if (typeof g.isFav !== "boolean") g.isFav = false;
                if (typeof g.loveRate !== "number") g.loveRate = 0;
                if (!Array.isArray(g.selectChars)) g.selectChars = [];
                if (!Array.isArray(g.cpSelectIds)) g.cpSelectIds = [];
                if (!Array.isArray(g.selectCharItems)) g.selectCharItems = [];
                if (!Array.isArray(g.cpEditState)) g.cpEditState = null;
                if (!Array.isArray(g.cpList)) g.cpList = [];
                if (!Array.isArray(g.maleItems)) g.maleItems = [];
                if (typeof g.gameHeadText !== "string") g.gameHeadText = "";
                if (typeof g.charSectionText !== "string") g.charSectionText = "";
                if (typeof g.cpSectionText !== "string") g.cpSectionText = "";
            });
        }

        // 迁移完成，写入全局appData
        appData = tempData;

        // 迁移产生变更才持久化
        if (needSaveAfterMigrate) {
            saveData();
        }

        // ✅ 数据重载时清空图片缓存，防止旧URL缓存阻塞Canvas渲染
        imgCacheMap.clear();

    } catch (e) {
        console.error("读取本地存储失败：", e);
    }
}

/**
 * 获取今日日期字符串 YYYY-MM-DD 用于跨零点判断
 * @returns {string} 日期字符串
 */
export function getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * 判断今天是否已经确认过【全局】剧透
 * @returns {boolean}
 */
export function isTodayConfirmed() {
    const savedDate = localStorage.getItem(SPOILER_DATE_KEY);
    return savedDate === getTodayDateStr();
}

/**
 * 保存今日【全局】确认标记到本地存储
 */
export function saveConfirmDate() {
    localStorage.setItem(SPOILER_DATE_KEY, getTodayDateStr());
}

/**
 * 局部开关单日确认标记（兼容旧script.js解构）
 */
export function localSwitchIsConfirmedToday() {
    const saved = localStorage.getItem(SPOILER_LOCAL_SWITCH_KEY);
    return saved === getTodayDateStr();
}
export function saveLocalSwitchConfirmDate() {
    localStorage.setItem(SPOILER_LOCAL_SWITCH_KEY, getTodayDateStr());
}

// ===================== 角色图片过滤工具函数 =====================
/**
 * 获取角色可用图片组（适配你项目 srcList 格式）
 * @param {Object} char 角色对象
 * @param {boolean} globalHideSwitch 全局隐藏角色开关
 * @param {boolean} globalFDSwitch 全局FD开关
 * @param {boolean} localHideSwitch 当前游戏隐藏角色开关
 * @param {boolean} localFDSwitch 当前游戏FD开关
 * @returns Array 过滤后可用图片单元，每个单元包含 srcList + type
 */
export function getAvailableCharImages(char, globalHideSwitch, globalFDSwitch, localHideSwitch, localFDSwitch) {
    if (!char) return [];
    if (!char.images || !Array.isArray(char.images)) return [];

    const enableHidden = globalHideSwitch || localHideSwitch;
    const enableFD = globalFDSwitch || localFDSwitch;

    return char.images.filter(imgUnit => {
        if (!imgUnit || !Array.isArray(imgUnit.srcList)) return false;
        switch (imgUnit.type) {
            case "base":
                return true;
            case "hidden":
                return enableHidden;
            case "fd":
                return enableFD;
            default:
                return false;
        }
    });
}

/**
 * 全局图片缓存Map：key=图片url，value=Promise<HTMLImageElement>
 * 避免同一个url重复创建Image对象、重复请求
 */
export const imgCacheMap = new Map();

// ============================================================
// ① preloadAndDecodeImage 修改后（带腾讯云COS降级）
// ============================================================
export function preloadAndDecodeImage(src) {
    if (!src) {
        return Promise.resolve(null);
    }
    if (imgCacheMap.has(src)) {
        return imgCacheMap.get(src);
    }

    // 提取相对路径，用于构造腾讯云COS降级地址
    const relPath = normalizeImageRelPath(src);
    const cosFallbackUrl = relPath ? `${TENCENT_COS_BASE_URL}/${relPath}` : null;

    const p = new Promise((resolve, reject) => {
        let tempImg = new Image();
        let timeoutTimer = null;
        let isFallbackTriggered = false;

        const cleanTimer = () => {
            if(timeoutTimer){
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
        };

        // 主源加载成功
        tempImg.crossOrigin = "anonymous";
        tempImg.decoding = "async";
        tempImg.onload = () => {
            cleanTimer();
            resolve(tempImg);
        };

        // 主源失败：onerror 或者超时都会走到降级
        const triggerFallback = (reason) => {
            if(isFallbackTriggered) return;
            isFallbackTriggered = true;
            cleanTimer();
            console.warn(`[图片主源jsDelivr失败，触发腾讯云COS降级] src:${src} reason:${reason}`);

            // 销毁旧图片对象，终止原有网络请求
            tempImg.onload = null;
            tempImg.onerror = null;
            tempImg.src = "";

            if(!cosFallbackUrl){
                imgCacheMap.delete(src);
                reject(new Error(`Image main source failed, no fallback available: ${src}`));
                return;
            }

            // 发起腾讯云COS备用源请求
            const cosImg = new Image();
            cosImg.crossOrigin = "anonymous";
            cosImg.decoding = "async";
            cosImg.onload = () => {
                resolve(cosImg);
            };
            cosImg.onerror = () => {
                imgCacheMap.delete(src);
                console.error(`[图片主源+备用COS全部加载失败]`, src, cosFallbackUrl);
                reject(new Error(`Image main & fallback failed: ${src}`));
            };
            cosImg.src = cosFallbackUrl;
        };

        tempImg.onerror = () => {
            triggerFallback("onerror");
        };

        // 设置jsd超时计时器
        timeoutTimer = setTimeout(()=>{
            triggerFallback("timeout");
        }, JSD_FALLBACK_TIMEOUT);

        tempImg.src = src;
    });

    imgCacheMap.set(src, p);
    return p;
}

// ============================================================
// 新增 preloadImageBitmap（专供Canvas导出使用，启用高质量缩放 + 降级兜底）
// ============================================================
/**
 * 预加载图片并生成高质量 createImageBitmap（专供Canvas导出使用）
 * 解决Chrome PNG缩小插值模糊问题，启用 resizeQuality:"high"
 * 增加降级兜底，当createImageBitmap失败时返回原始HTMLImageElement
 * @param {string} src 图片地址
 * @returns {Promise<ImageBitmap|HTMLImageElement|null>}
 */
export function preloadImageBitmap(src) {
    if (!src) {
        return Promise.resolve(null);
    }

    // 复用上层图片缓存，避免重复网络请求
    if (imgCacheMap.has(src)) {
        return imgCacheMap.get(src).then(async (img) => {
            if (!img) return null;
            try {
                return await createImageBitmap(img, {
                    resizeQuality: "high"
                });
            } catch (e) {
                console.warn(`createImageBitmap 降级: ${src}`, e);
                try {
                    return await createImageBitmap(img);
                } catch {
                    // iOS Safari终极兜底：返回原始Image，不再强制bitmap
                    return img;
                }
            }
        });
    }

    // 先使用原有加载逻辑缓存图片
    return preloadAndDecodeImage(src).then(async (img) => {
        if (!img) return null;
        try {
            return await createImageBitmap(img, {
                resizeQuality: "high"
            });
        } catch (e) {
            console.warn(`createImageBitmap resizeQuality降级: ${src}`, e);
            try {
                return await createImageBitmap(img);
            } catch {
                return img;
            }
        }
    });
}

// ============================================================
// ② preloadImagesInIdle 修改后
// ============================================================
export function preloadImagesInIdle(list, batchSize = 2) {
    if (!Array.isArray(list) || !list.length) return;

    const unique = [...new Set(list)].filter(Boolean);

    let index = 0;

    const run = async (deadline) => {
        while (index < unique.length) {
            // 浏览器已经没有空闲时间了
            if (
                deadline &&
                typeof deadline.timeRemaining === "function" &&
                deadline.timeRemaining() < 8
            ) {
                requestIdleCallback(run, { timeout: 1000 });
                return;
            }

            const batch = unique.slice(index, index + batchSize);
            index += batch.length;

            await Promise.allSettled(
                batch.map(src => preloadAndDecodeImage(src))
            );
        }
    };

    if ("requestIdleCallback" in window) {
        requestIdleCallback(
            run,
            { timeout: 1000 }
        );
    } else {
        setTimeout(() => run(), 300);
    }
}

/**
 * 安全切换角色立绘：后台预解码完成再更新DOM
 * @param {HTMLImageElement} domImg 页面真实img DOM
 * @param {string} nextSrc 新图片地址
 */
export async function switchCharImage(domImg, nextSrc) {
    try {
        await preloadAndDecodeImage(nextSrc);
        domImg.src = nextSrc;
    } catch (err) {
        console.error("图片切换失败", err);
        // 降级：直接赋值src保证可用性
        domImg.src = nextSrc;
    }
}

// ============================================================
// ③ switchCharImageWithLoading 修改后
// ============================================================
export async function switchCharImageWithLoading(wrap, nextSrc) {
    if (!wrap || !nextSrc) {
        return;
    }

    // 防止连续快速点击
    if (wrap.dataset.isImgLoading === "1") {
        return;
    }

    wrap.dataset.isImgLoading = "1";

    const loaderEl =
        document.createElement("div");

    loaderEl.className =
        "img-loader-spinner";

    wrap.appendChild(loaderEl);

    function clearLoading() {
        wrap.dataset.isImgLoading = "";

        const el =
            wrap.querySelector(
                ".img-loader-spinner"
            );

        if (el) {
            el.remove();
        }
    }

    try {
        // 使用统一图片缓存
        await preloadAndDecodeImage(nextSrc);

        const realImg =
            wrap.querySelector("img");

        if (realImg) {
            realImg.src = nextSrc;
            // 防止浏览器再次进行不必要的解码等待
            realImg.decoding = "async";
        }

    } catch (error) {
        console.warn(
            "图片加载失败:",
            nextSrc,
            error
        );

        const realImg =
            wrap.querySelector("img");
        // 即使 decode 失败，也允许浏览器直接显示
        if (realImg) {
            realImg.src = nextSrc;
        }

    } finally {
        clearLoading();
    }
}

// ============================================================
// ④ 新增 preloadAdjacentImages（保留供按需调用）
// ============================================================
export function preloadAdjacentImages(srcList, index) {
    if (
        !Array.isArray(srcList) ||
        srcList.length <= 1
    ) {
        return;
    }

    const targets = [];

    // 前一张
    const prevIndex =
        (index - 1 + srcList.length) %
        srcList.length;

    // 后一张
    const nextIndex =
        (index + 1) %
        srcList.length;

    targets.push(srcList[prevIndex]);
    targets.push(srcList[nextIndex]);

    preloadImagesInIdle(
        targets,
        1
    );
}

// ===================== 游戏模板加载模块（不再import游戏，读取全局已加载数据） =====================
export async function loadAllGameTemplates() {
    // 等待全局window.gameDataList就绪（data/games.js已经完成全部import）
    if (!Array.isArray(window.gameDataList)) {
        gameTemplateList = [];
        gameTemplateReady = false;
        console.warn("window.gameDataList不存在，游戏模板为空");
        // 同步到window兜底变量
        window.__gameTemplateList = gameTemplateList;
        window.__gameTemplateReady = gameTemplateReady;
        return;
    }
    // 直接赋值，不再重复导入游戏脚本
    gameTemplateList = [...window.gameDataList];
    gameTemplateReady = true;
    console.log("✅main.js读取全局游戏模板，数量：", gameTemplateList.length);
    // =========【新增】同步更新window的兜底变量，给annual.js使用 =========
    window.__gameTemplateList = gameTemplateList;
    window.__gameTemplateReady = gameTemplateReady;
}

/**
 * 同步游戏内全局开关状态【⚠️禁止调用！需求变更：全局与局部开关互相独立】
 * @param {string} type 开关类型 hideChar / fd
 * @param {boolean} status 开关布尔状态
 */
export function syncSingleGameSwitch(type, status) {
    // 保留导出防止import报错，业务逻辑不再执行
    console.warn("syncSingleGameSwitch 已废弃，请勿调用");
    return;
}

/**
 * 筛选下拉排序：中文拼音A-Z → 英文A-Z(忽略大小写) → 日文五十音(平假名优先，片假名转平假名)
 * @param {string[]} arr 原始字符串数组
 * @returns {string[]} 排好序的数组
 */
export function sortFilterOptionList(arr) {
    const gojyuon = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';

    function getLangType(str) {
        const s = String(str ?? "");
        // 优先检测平假名/片假名 → 日文
        if (/[\u3040-\u30ff]/.test(s)) return 'ja';
        // 其次检测汉字 → 中文
        if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
        // 最后检测英文字母（含全角） → 英文
        if (/[a-zA-Z\uFF21-\uFF3A\uFF41-\uFF5A]/.test(s)) return 'en';
        return 'other';
    }

    // 按类型分组
    const groups = { zh: [], en: [], ja: [], other: [] };
    for (const item of arr) {
        const type = getLangType(item);
        groups[type].push(item);
    }

    // 各组内部排序
    const sortZh = (a, b) => a.localeCompare(b, 'zh-CN');
    const sortEn = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
    const sortJa = (a, b) => {
        function toHiragana(s) {
            return s.replace(/[\u30a1-\u30fa]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
        }
        const ah = toHiragana(a)[0] || '';
        const bh = toHiragana(b)[0] || '';
        const ia = gojyuon.indexOf(ah);
        const ib = gojyuon.indexOf(bh);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    };

    groups.zh.sort(sortZh);
    groups.en.sort(sortEn);
    groups.ja.sort(sortJa);
    groups.other.sort();

    // 按顺序合并：zh → en → ja → other
    return [...groups.zh, ...groups.en, ...groups.ja, ...groups.other];
}

/**
 * staff人员对象数组排序：lang zh>ja>en；同lang内部localeCompare
 * en规则：首字母相同时小写排在大写前面
 * @param {Array<{name:string,lang:string}>} list
 * @returns {Array<{name:string,lang:string}>}
 */
export function sortStaffByLang(list) {
    if (!Array.isArray(list)) return [];
    const langOrder = { zh: 0, ja: 1, en: 2 };
    return [...list].sort((a, b) => {
        const oA = langOrder[a.lang] ?? 99;
        const oB = langOrder[b.lang] ?? 99;
        //第一层 lang优先级 zh-ja-en
        if (oA !== oB) return oA - oB;

        const nameA = a.name;
        const nameB = b.name;
        if (a.lang === "zh") {
            return nameA.localeCompare(nameB, "zh-CN");
        } else if (a.lang === "ja") {
            return nameA.localeCompare(nameB, "ja-JP");
        } else if (a.lang === "en") {
            // en：首字母相同，小写排在大写前面
            const lowerA = nameA.toLowerCase();
            const lowerB = nameB.toLowerCase();
            if (lowerA !== lowerB) {
                return lowerA.localeCompare(lowerB, "en");
            } else {
                //小写charCode更小，a在A前面
                return nameA.localeCompare(nameB, "en");
            }
        }
        return nameA.localeCompare(nameB);
    });
}

// ===================== 筛选下拉菜单填充函数 =====================
/**
 * 【修复】筛选下拉填充：保留HTML原生顶部placeholder option，只追加数据选项，不再覆盖HTML提示文字
 * 排序规则：中文A-Z →英文A-Z →日文五十音；发售年份数字降序
 * @param {Array} gameList 游戏模板数组
 */
export function fillFilterOptions(gameList) {
    if (!Array.isArray(gameList) || gameList.length === 0) return;

    const yearSet = new Set(),
        pubSet = new Set(),
        cnSet = new Set();
    let writerObjList = [];
    let artObjList = [];

    gameList.forEach(g => {
        if (!g) return;
        yearSet.add(g.year);

        if (Array.isArray(g.publisher)) {
            g.publisher.forEach(name => name && pubSet.add(name));
        }
        cnSet.add(g.cnStudio);

        if (Array.isArray(g.writer)) {
            g.writer.forEach(obj => {
                if (obj?.name) writerObjList.push({ name: obj.name, lang: obj.lang });
            });
        }

        if (Array.isArray(g.art)) {
            g.art.forEach(obj => {
                if (obj?.name) artObjList.push({ name: obj.name, lang: obj.lang });
            });
        }
    });

    // =========新增：人员对象数组按name去重，消除下拉重复项=========
    function uniqueStaffByName(list) {
        const seen = new Set();
        return list.filter(item => {
            if (!item?.name) return false;
            if (seen.has(item.name)) return false;
            seen.add(item.name);
            return true;
        });
    }

    // 对象数组先去重，再按lang规则排序，再提取name字符串
    const writerSortedObjs = sortStaffByLang(uniqueStaffByName(writerObjList));
    const artSortedObjs = sortStaffByLang(uniqueStaffByName(artObjList));
    const writerSorted = writerSortedObjs.map(o => o.name);
    const artSorted = artSortedObjs.map(o => o.name);

    const pubSorted = sortFilterOptionList([...pubSet]);
    const cnSorted = sortFilterOptionList([...cnSet]);
    // 发售年份：数字升序，旧年份在上
    const yearSorted = [...yearSet].sort((a, b) => Number(a) - Number(b));

    const fillSelect = (id, dataArr) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const firstOpt = sel.querySelector('option');
        sel.innerHTML = '';
        if (firstOpt) sel.appendChild(firstOpt);
        dataArr.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            sel.appendChild(opt);
        });
    };

    fillSelect("filter-writer", writerSorted);
    fillSelect("filter-art", artSorted);
    fillSelect("filter-year", yearSorted);
    fillSelect("filter-publisher", pubSorted);
    fillSelect("filter-cn", cnSorted);
}

// ===================== HTML模板渲染函数 =====================
/**
 * 渲染游戏选择列表卡片模板
 * 【修复】硬编码输出顺序，不再依赖对象key顺序：编剧→画师→发售年份→发行厂商→汉化厂商
 * 布局：左侧封面，右侧竖排信息，移除名称旁发售年份
 * @param {Object} game 游戏模板对象
 * @param {number} index 在列表中的索引（用于控制loading策略）
 * @returns {string} html字符串
 */
// ============================================================
// ⑤ renderGameSelectItem 修改后（增加index参数，前6张eager）
// ============================================================
export function renderGameSelectItem(game, index) {
    if (!game) return "";

    // 编剧：对象数组副本排序拼接
    let writerText = "无";
    if (Array.isArray(game.writer) && game.writer.length > 0) {
        const sortedWriterObjs = sortStaffByLang(game.writer);
        const writerNameArr = sortedWriterObjs.map(item => item.name);
        writerText = writerNameArr.join("、");
    }

    // 画师：对象数组副本排序拼接
    let artText = "无";
    if (Array.isArray(game.art) && game.art.length > 0) {
        const sortedArtObjs = sortStaffByLang(game.art);
        const artNameArr = sortedArtObjs.map(item => item.name);
        artText = sortedArtObjs.map(item => item.name).join("、");
    }

    // 开发厂商：数组拼接
    let pubText = "无";
    if (Array.isArray(game.publisher) && game.publisher.length > 0) {
        pubText = game.publisher.join("、");
    }

    // 【硬编码固定输出顺序，不受对象属性顺序干扰】
    const lines = [];
    lines.push(`编剧：${writerText}`);
    lines.push(`画师：${artText}`);
    lines.push(`发售年份：${game.year || "无"}`);
    lines.push(`开发厂商：${pubText}`);
    lines.push(`汉化厂商：${game.cnStudio || "无"}`);

    let infoHtml = "";
    for (const t of lines) {
        infoHtml += `<div>${t}</div>`;
    }

    // 前6张 eager，其余 lazy
    const loadingMode = (index < 6) ? "eager" : "lazy";

    return `
        <img src="${getWebImageUrl(game.cover || '')}" alt="${game.name || ''}" loading="${loadingMode}" decoding="async">
        <div>
            <div class="game-option-name">${game.name || ""}</div>
            ${infoHtml}
        </div>
    `;
}

// ============================================================
// ⑥ renderSelectedChar 修改后（移除 preloadAdjacentImages 调用，img loading 改为 eager）
// ============================================================
export function renderSelectedChar(gameItem, gameInfo, isSnapshot = false) {
    if (!gameInfo?.charList || !gameItem) return `<div class="empty-hint">暂未添加角色</div>`;

    let html = "";
    const globalHide = appData.globalHideChar;
    const globalFD = appData.globalFD;
    const localHide = gameItem.localHideChar;
    const localFD = gameItem.localFD;

    if (!Array.isArray(gameItem.selectChars)) gameItem.selectChars = [];
    if (!Array.isArray(gameItem.selectCharItems)) gameItem.selectCharItems = [];

    gameItem.selectChars?.forEach(cid => {
        const char = gameInfo.charList?.find(c => c.id === cid);
        if (!char) return;

        const availableImgUnits = getAvailableCharImages(char, globalHide, globalFD, localHide, localFD);
        if (availableImgUnits.length === 0) return;

        let allSrc = [];
        availableImgUnits.forEach(u => allSrc.push(...u.srcList));
        if (allSrc.length === 0) return;

        // 从持久化 selectCharItems 读取imgIndex
        const storedItem = gameItem.selectCharItems.find(s => s.charId === cid);
        let imgIndex = Number(storedItem?.imgIndex ?? 0);
        if (imgIndex >= allSrc.length) imgIndex = 0;
        const targetSrc = allSrc[imgIndex];

        // 已移除 preloadAdjacentImages 调用，避免渲染时预加载大量图片

        html += `
            <div class="char-card-item selected" data-char-id="${char.id}" data-game-id="${gameInfo.id}" data-total-img="${allSrc.length}">
                <div class="char-card-img-box ${allSrc.length > 1 ? 'char-has-multi-img' : ''}">
                    <img src="${getWebImageUrl(targetSrc)}" alt="${char.name || ''}" loading="eager" decoding="async">
                </div>
                <div class="char-card-name">${char.name || ""}</div>
            </div>
        `;
    });

    return html || `<div class="empty-hint">暂未添加角色</div>`;
}

// ============================================================
// ⑦ renderCP 修改后（img loading 改为 eager）
// ============================================================
export function renderCP(gameItem, gameInfo, isSnapshot = false) {
    if (!gameInfo?.charList || !gameItem) return `<div class="empty-hint">暂未添加角色</div>`;

    let html = "";
    const globalHide = appData.globalHideChar;
    const globalFD = appData.globalFD;
    const localHide = gameItem.localHideChar;
    const localFD = gameItem.localFD;

    if (!Array.isArray(gameItem.cpList)) gameItem.cpList = [];

    gameItem.cpList?.forEach(cp => {
        if (!cp) return;

        const fChar = gameInfo.charList?.find(c => c.id === cp.femaleId);
        if (!fChar) return;

        const fAvailUnits = getAvailableCharImages(fChar, globalHide, globalFD, localHide, localFD);
        let fAllSrc = [];
        fAvailUnits.forEach(u => fAllSrc.push(...u.srcList));
        if (fAllSrc.length === 0) return;

        // ✅修复：从cp自身存储取女主imgIndex
        let fIndex = Number(cp.femaleImgIndex ?? 0);
        if (fIndex >= fAllSrc.length) fIndex = 0;
        const fTargetSrc = fAllSrc[fIndex];

        let maleHtml = "";
        if (!Array.isArray(cp.maleItems)) cp.maleItems = [];
        cp.maleItems?.forEach(mi => {
            const mChar = gameInfo.charList?.find(c => c.id === mi.charId);
            if (!mChar) return;

            const mAvailUnits = getAvailableCharImages(mChar, globalHide, globalFD, localHide, localFD);
            let mAllSrc = [];
            mAvailUnits.forEach(u => mAllSrc.push(...u.srcList));
            if (mAllSrc.length === 0) return;

            let mIndex = Number(mi.imgIndex ?? 0);
            if (mIndex >= mAllSrc.length) mIndex = 0;
            const mTargetSrc = mAllSrc[mIndex];

            maleHtml += `
                <div class="cp-selected-card-item" data-char-id="${mChar.id}" data-game-id="${gameInfo.id}" data-total-img="${mAllSrc.length}">
                    <div class="char-card-img-box ${mAllSrc.length > 1 ? 'char-has-multi-img' : ''}">
                        <img src="${getWebImageUrl(mTargetSrc)}" alt="${mChar.name || ''}" loading="eager" decoding="async">
                    </div>
                    <div class="char-card-name">${mChar.name || ""}</div>
                </div>
            `;
        });

        html += `
            <div class="cp-layout-row">
                <div class="heroine-column">
                    <div class="cp-selected-card-item" data-char-id="${fChar.id}" data-game-id="${gameInfo.id}" data-total-img="${fAllSrc.length}">
                        <div class="char-card-img-box ${fAllSrc.length > 1 ? 'char-has-multi-img' : ''}">
                            <img src="${getWebImageUrl(fTargetSrc)}" alt="${fChar.name || ''}" loading="eager" decoding="async">
                        </div>
                        <div class="char-card-name">${fChar.name || ""}</div>
                    </div>
                </div>
                <div class="hero-list-column">
                    <div class="char-card-wrapper">
                        ${maleHtml || "<span>未选择男主</span>"}
                    </div>
                </div>
            </div>
        `;
    });

    return html || `<div class="empty-hint">暂未添加角色</div>`;
}

/**
 * 过滤角色规则：全局开关 || 单游戏开关，任一开启即可展示
 * @param {Object} gameInfo 游戏模板对象
 * @returns {Array} 过滤完成角色数组，女主在前，男主在后
 */
export function getAllGameChar(gameInfo) {
    if (!gameInfo) return [];
    let chars = [...(gameInfo?.charList || [])];
    const gameItem = appData.gameList.find(g => g?.gameId === gameInfo.id);
    const showHide = appData.globalHideChar || gameItem?.localHideChar;
    const showFD = appData.globalFD || gameItem?.localFD;
    const showSub = appData.globalSubChar || (gameItem?.localSubChar ?? false);

    chars = chars.filter(c => {
        if (!c) return false;
        const isSub = c.isSub ?? false;
        const isHidden = !!c.isHidden;
        const isFD = !!c.isFD;

        // ========== 【新增业务：Sub角色复合属性强制全部开关开启】 ==========
        if (isSub) {
            // sub角色同时有隐藏+FD：sub、隐藏、FD三个开关全部打开才显示
            if (isHidden && isFD) {
                return showSub && showHide && showFD;
            }
            // sub角色仅隐藏属性：sub开关 + 隐藏开关同时打开
            if (isHidden && !isFD) {
                return showSub && showHide;
            }
            // sub角色仅FD属性：sub开关 + FD开关同时打开
            if (!isHidden && isFD) {
                return showSub && showFD;
            }
            // 普通sub角色，无隐藏、无FD：只要sub开关开启即可
            return showSub;
        }

        // ====== 非Sub角色，原有逻辑完全保留，不做任何改动 =====
        if (!isHidden && !isFD) return true;
        if (isHidden && !isFD) {
            return showHide;
        }
        if (!isHidden && isFD) {
            return showFD;
        }
        if (isHidden && isFD) {
            return showHide || showFD;
        }
        return true;
    });

    const female = chars.filter(c => c.gender === "female").sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const male = chars.filter(c => c.gender === "male").sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return [...female, ...male];
}

// ===================== 角色/CP待选勾选切换工具【新增】 =====================
/**
 * 单人Character面板勾选切换 → 操作 gameItem.selectChars
 * @param {Object} gameItem appData.gameList内的游戏条目
 * @param {string} charId 角色id
 * @param {string} gameId 当前游戏ID（用于正确读取立绘索引）
 */
export function toggleCharItemSelect(gameItem, charId, gameId) {
    if (!Array.isArray(gameItem.selectChars)) gameItem.selectChars = [];
    if (!Array.isArray(gameItem.selectCharItems)) gameItem.selectCharItems = [];

    const idx = gameItem.selectChars.indexOf(charId);
    if (idx >= 0) {
        // 取消勾选：同时删除两套数组对应项
        gameItem.selectChars.splice(idx, 1);
        const itemIdx = gameItem.selectCharItems.findIndex(s => s.charId === charId);
        if (itemIdx >= 0) gameItem.selectCharItems.splice(itemIdx, 1);
    } else {
        // 勾选：使用传入的 gameId 构造存储键，统一带 char-img- 前缀
        const saveKey = `char-img-${gameId}-${charId}`;
        const currentImgIndex = Number(appData.charImageSelect[saveKey] ?? 0);
        gameItem.selectChars.push(charId);
        gameItem.selectCharItems.push({
            charId: charId,
            imgIndex: currentImgIndex
        });
    }
    saveData();
}

/**
 * CP Couple面板待选勾选切换 → 独立操作 gameItem.cpSelectIds
 * @param {Object} gameItem appData.gameList内的游戏条目
 * @param {string} charId 角色id
 */
export function toggleCpItemSelect(gameItem, charId) {
    if (!Array.isArray(gameItem.cpSelectIds)) gameItem.cpSelectIds = [];
    const idx = gameItem.cpSelectIds.indexOf(charId);
    if (idx >= 0) {
        gameItem.cpSelectIds.splice(idx, 1);
    } else {
        gameItem.cpSelectIds.push(charId);
    }
    saveData();
}

// ===================== 页面启动入口模块 =====================
// 【新增：给annual.js时序兜底，挂载原始游戏模板状态到window】
window.__gameTemplateList = gameTemplateList;
window.__gameTemplateReady = gameTemplateReady;

/**
 * 组装Core上下文对象，统一供给UI层script.js
 * @returns {Object} Core对象，所有核心方法对外暴露
 */
function buildCoreContext() {
    const Core = {
        appData,
        gameTemplateList,
        gameTemplateReady, // 新增就绪标记
        currentEditGameId,
        charPoolMode,
        loadAllGameTemplates,
        loadData,
        saveData,
        syncSingleGameSwitch,
        fillFilterOptions,
        sortFilterOptionList,
        sortStaffByLang,
        renderSelectedChar,
        renderCP,
        getAllGameChar,
        getAvailableCharImages,
        preloadAndDecodeImage,
        preloadImageBitmap,
        preloadImagesInIdle,
        switchCharImage,
        switchCharImageWithLoading,
        preloadAdjacentImages,
        isTodayConfirmed,
        saveConfirmDate,
        localSwitchIsConfirmedToday,
        saveLocalSwitchConfirmDate,
        renderGameSelectItem,
        bindDynamicGameCardSwitchEvents,
        toggleCharItemSelect,
        toggleCpItemSelect
    };
    return Core;
}

/**
 * 【渲染全局开关复选框状态】
 * 根据appData数据，更新页面上两个全局滑块勾选状态
 */
function renderGlobalSwitchDom() {
    const hideCharInput = document.getElementById("global-hide-char");
    const fdInput = document.getElementById("global-fd-game");
    const subCharInput = document.getElementById("global-sub-char"); // ✅新增
    // 加固：严格读取appData，不读取DOM旧状态
    if (hideCharInput) hideCharInput.checked = !!appData.globalHideChar;
    if (fdInput) fdInput.checked = !!appData.globalFD;
    if (subCharInput) subCharInput.checked = !!appData.globalSubChar; // ✅新增
}

// 模块顶层事件处理函数，解决removeEventListener无效
function wrapClickHandler(e) {
    const spoilerModal = document.getElementById("spoiler-modal");
    if (!spoilerModal) return;

    // -------- 游戏局部开关处理 --------
    const targetInput = e.target.closest(".game-hide-char,.game-fd-switch,.game-sub-switch,.modal-local-hide-char,.modal-local-fd");
    if (targetInput) {
        // ✅新增：局部次要角色开关，无剧透弹窗，直接切换
        if (targetInput.classList.contains("game-sub-switch")) {
            e.preventDefault();
            const idx = Number(targetInput.dataset.gameidx);
            const gameItem = appData.gameList[idx];
            if (!gameItem) return;
            gameItem.localSubChar = !gameItem.localSubChar;
            saveData();
            if (window.refreshGameCardUi) window.refreshGameCardUi();
            return;
        }

        // ✅修复：只要命中局部开关，直接阻止浏览器原生checkbox切换，全部JS接管
        e.preventDefault();

        let idx;
        let gameItem;
        if (targetInput.classList.contains("modal-local-hide-char") || targetInput.classList.contains("modal-local-fd")) {
            gameItem = appData.gameList.find(g => g.gameId === currentEditGameId);
            if (!gameItem) return;
            idx = appData.gameList.findIndex(g => g.gameId === currentEditGameId);
        } else {
            idx = Number(targetInput.dataset.gameidx);
            gameItem = appData.gameList[idx];
            if (!gameItem) return;
        }

        // 读取真实数据状态，不要读取DOM的checked（委托click下DOM状态是旧的）
        let isOpened;
        if (targetInput.classList.contains("game-hide-char") || targetInput.classList.contains("modal-local-hide-char")) {
            isOpened = !!gameItem.localHideChar;
        } else {
            isOpened = !!gameItem.localFD;
        }

        // 已经开启：用户要关闭，直接生效，不弹窗
        if (isOpened) {
            if (targetInput.classList.contains("game-hide-char") || targetInput.classList.contains("modal-local-hide-char")) {
                gameItem.localHideChar = false;
            } else {
                gameItem.localFD = false;
            }
            saveData();
            if (window.refreshGameCardUi) window.refreshGameCardUi();
            return;
        }

        // 用户想要打开局部开关，直接弹出剧透弹窗
        if (targetInput.classList.contains("game-hide-char") || targetInput.classList.contains("modal-local-hide-char")) {
            window.pendingGameOp = { type: "hideChar", idx };
        } else {
            window.pendingGameOp = { type: "fd", idx };
        }
        spoilerModal.classList.add("active");
        return;
    }

    // -------- 角色图片切换按钮处理 --------
    const switchBtn = e.target.closest(".char-switch-prev,.char-switch-next");
    if (switchBtn) {
        const cardEl = switchBtn.closest(".char-card-item");
        if (!cardEl) return;
        const gameId = cardEl.dataset.gameId;
        const charId = cardEl.dataset.charId;
        const totalImg = Number(cardEl.dataset.totalImg) || 1;
        // ★★★ 修改点：统一使用 char-img- 前缀 ★★★
        const saveKey = `char-img-${gameId}-${charId}`;
        let currentIdx = Number(appData.charImageSelect[saveKey] ?? 0);

        if (switchBtn.classList.contains("char-switch-prev")) {
            currentIdx = currentIdx - 1;
            if (currentIdx < 0) currentIdx = totalImg - 1;
        } else {
            currentIdx = currentIdx + 1;
            if (currentIdx >= totalImg) currentIdx = 0;
        }
        appData.charImageSelect[saveKey] = currentIdx;
        saveData();
        // 通知script.js重新渲染游戏卡片
        if (window.refreshGameCardUi) window.refreshGameCardUi();
        return;
    }

    // 点击遮罩空白关闭弹窗
    if (e.target === spoilerModal) {
        spoilerModal.classList.remove("active");
        window.pendingGlobalSwitch = null;
        window.pendingGameOp = null;
    }
}

/**
 * 事件委托：处理动态渲染游戏卡片内部开关 + 角色图片切换按钮
 * 改为click委托，不再监听change；导出，由script.js渲染完列表后调用
 */
export function bindDynamicGameCardSwitchEvents() {
    const wrap = document.querySelector(".wrap");
    const spoilerModal = document.getElementById("spoiler-modal");
    if (!wrap || !spoilerModal) {
        console.warn("bindDynamicGameCardSwitchEvents：wrap或modal不存在，跳过绑定");
        return;
    }
    // 移除旧监听，防止重复绑定
    wrap.removeEventListener("click", wrapClickHandler);
    wrap.addEventListener("click", wrapClickHandler);
}

/**
 * 【绑定全局开关 click事件 + 剧透弹窗逻辑】
 * 改用label click，阻止默认，不再使用change，规避label包裹checkbox时序bug
 * 1.想要打开：阻止原生勾选，弹出弹窗；确认后才改为true
 * 2.想要关闭：直接修改数据，保存，更新UI，不弹窗
 * 恢复取消按钮完整逻辑
 */
function bindGlobalSwitchSpoilerEvents() {
    const hideCharInput = document.getElementById("global-hide-char");
    const fdInput = document.getElementById("global-fd-game");
    const subCharInput = document.getElementById("global-sub-char"); // ✅新增
    const spoilerModal = document.getElementById("spoiler-modal");
    const spoilerConfirmBtn = document.getElementById("spoiler-confirm");
    const spoilerCancelBtn = document.getElementById("spoiler-cancel");

    if (!hideCharInput || !fdInput || !spoilerModal || !spoilerConfirmBtn || !spoilerCancelBtn) {
        console.warn("bindGlobalSwitchSpoilerEvents：部分DOM缺失，全局开关弹窗未挂载");
        return;
    }
    // 获取包裹input的label元素
    const labelHideChar = hideCharInput.closest("label.switch");
    const labelFD = fdInput.closest("label.switch");
    const labelSubChar = subCharInput.closest("label.switch");

    // --------全局隐藏角色开关 使用label click，阻止默认行为--------
    labelHideChar.addEventListener("click", function (e) {
        e.preventDefault(); // 禁止浏览器原生切换checkbox！全部交给JS控制
        // 当前实际状态
        const currentVal = appData.globalHideChar;
        if (currentVal === true) {
            // 用户要关闭
            appData.globalHideChar = false;
            saveData();
            renderGlobalSwitchDom();
            if (window.refreshGameCardUi) window.refreshGameCardUi();
            return;
        }
        // 用户想要打开：不修改勾选，弹出弹窗
        window.pendingGlobalSwitch = "hideChar";
        spoilerModal.classList.add("active");
    });

    // --------全局FD开关--------
    labelFD.addEventListener("click", function (e) {
        e.preventDefault();
        const currentVal = appData.globalFD;
        if (currentVal === true) {
            // 用户要关闭
            appData.globalFD = false;
            saveData();
            renderGlobalSwitchDom();
            if (window.refreshGameCardUi) window.refreshGameCardUi();
            return;
        }
        window.pendingGlobalSwitch = "fdGame";
        spoilerModal.classList.add("active");
    });

    // --------全局次要角色开关（无剧透弹窗，直接切换）--------
    labelSubChar.addEventListener("click", function (e) {
        e.preventDefault();
        // 直接取反，不弹剧透弹窗
        appData.globalSubChar = !appData.globalSubChar;
        saveData();
        renderGlobalSwitchDom();
        if (window.refreshGameCardUi) window.refreshGameCardUi();
    });

    // 弹窗确认【扩展：同时处理全局 / 动态卡片局部】
    spoilerConfirmBtn.onclick = null;
    spoilerConfirmBtn.addEventListener("click", function () {
        // 优先处理动态游戏卡片操作（含弹窗内modal-local-*开关）
        if (window.pendingGameOp) {
            const op = window.pendingGameOp;
            const g = appData.gameList[op.idx];
            if (g) {
                if (op.type === "hideChar") g.localHideChar = true;
                if (op.type === "fd") g.localFD = true;
            }
            window.pendingGameOp = null;
            saveData();
            spoilerModal.classList.remove("active");
            window.pendingGlobalSwitch = null;
            if (window.refreshGameCardUi) window.refreshGameCardUi();
            return;
        }

        if (!window.pendingGlobalSwitch) {
            spoilerModal.classList.remove("active");
            window.pendingGlobalSwitch = null;
            window.pendingGameOp = null;
            return;
        }

        if (window.pendingGlobalSwitch === "hideChar") {
            appData.globalHideChar = true;
            saveData();
            renderGlobalSwitchDom();
        } else if (window.pendingGlobalSwitch === "fdGame") {
            appData.globalFD = true;
            saveData();
            renderGlobalSwitchDom();
        }
        spoilerModal.classList.remove("active");
        window.pendingGlobalSwitch = null;
        window.pendingGameOp = null;
        if (window.refreshGameCardUi) {
            window.refreshGameCardUi();
        }
    });

    // 弹窗取消：关闭弹窗，清空全部待处理标记，**不修改任何开关状态**
    spoilerCancelBtn.onclick = null;
    spoilerCancelBtn.addEventListener("click", function () {
        spoilerModal.classList.remove("active");
        window.pendingGlobalSwitch = null;
        window.pendingGameOp = null;
    });
}

/**
 * 对外暴露启动入口，供index.html调用
 */
export async function bootstrapCore() {
    // 【修复时序BUG】先加载游戏模板，再执行loadData，保证loadData内部脏url清洗可以拿到gameTemplateList
    await loadAllGameTemplates();
    // 1.读取本地存储数据 + 执行存量脏图片链接清洗迁移
    loadData();

    // ==========【补丁2】模板加载完成后，二次补执行脏数据清洗，解决第一次loadData时模板未就绪跳过清洗的时序竞争 ==========
    if(gameTemplateReady && Array.isArray(gameTemplateList) && gameTemplateList.length>0){
        console.log("🔧 二次补跑存量图片脏链接清洗");
        let hasDirtyUrl = false;
        // ver3升级一次性强制清洗标记
        const forceCleanAll = !!appData._triggerImageCleanOnce;

        if(Array.isArray(appData.gameList)){
            appData.gameList.forEach(gameItem => {
                // ==========新增：清理对象内raw字符串（永久清除localStorage脏数据）==========
                if(Array.isArray(gameItem.selectCharItems)){
                    gameItem.selectCharItems.forEach(s=>{
                        for(const key in s){
                            const val = s[key];
                            if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                console.error("🧹二次补跑清除raw字符串 selectCharItems", val);
                                s[key] = null;
                                hasDirtyUrl = true;
                            }
                        }
                    })
                }
                if(Array.isArray(gameItem.cpList)){
                    gameItem.cpList.forEach(cp=>{
                        for(const key in cp){
                            const val = cp[key];
                            if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                console.error("🧹二次补跑清除raw字符串 cp字段", val);
                                cp[key]=null;
                                hasDirtyUrl = true;
                            }
                        }
                        if(Array.isArray(cp.maleItems)){
                            cp.maleItems.forEach(mi=>{
                                for(const key in mi){
                                    const val = mi[key];
                                    if(typeof val === "string" && val.includes("raw.githubusercontent.com")){
                                        console.error("🧹二次补跑清除raw字符串 maleItems", val);
                                        mi[key]=null;
                                        hasDirtyUrl = true;
                                    }
                                }
                            })
                        }
                    })
                }
                // ==========以上新增raw字符串清理，下面原有索引校验逻辑完全保留==========
                if (!Array.isArray(gameItem.selectCharItems)) return;
                const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
                if (!gameInfo?.charList || !gameItem?.charId) return;
                gameItem.selectCharItems.forEach(charItem => {
                    const targetChar = gameInfo.charList.find(c => c.id === charItem.charId);
                    if (!targetChar?.images || !Array.isArray(targetChar.images)) return;
                    let allSrcList = [];
                    targetChar.images.forEach(imgUnit => {
                        if (Array.isArray(imgUnit.srcList)) {
                            allSrcList.push(...imgUnit.srcList);
                        }
                    });
                    const cleanSrcList = allSrcList
                        .map(src => normalizeImageRelPath(src))
                        .filter(Boolean);
                    if (cleanSrcList.length === 0) return;
                    if (typeof charItem.imgIndex !== "number" || charItem.imgIndex >= cleanSrcList.length) {
                        charItem.imgIndex = 0;
                        hasDirtyUrl = true;
                    }
                });
                // cp女主男主索引校验
                if(Array.isArray(gameItem.cpList)){
                    gameItem.cpList.forEach(cp=>{
                        const gameInfo = gameTemplateList.find(g => g.id === gameItem.gameId);
                        if(!gameInfo?.charList) return;
                        const fChar = gameInfo.charList.find(c=>c.id === cp.femaleId);
                        if(fChar?.images){
                            let fSrcList=[];
                            fChar.images.forEach(u=>Array.isArray(u.srcList)&&fSrcList.push(...u.srcList));
                            const cleanFList = fSrcList.map(normalizeImageRelPath).filter(Boolean);
                            if(cleanFList.length>0 && cp.femaleImgIndex >= cleanFList.length){
                                cp.femaleImgIndex = 0;
                                hasDirtyUrl=true;
                            }
                        }
                        if(Array.isArray(cp.maleItems)){
                            cp.maleItems.forEach(mi=>{
                                const mChar = gameInfo.charList.find(c=>c.id===mi.charId);
                                if(mChar?.images){
                                    let mSrcList=[];
                                    mChar.images.forEach(u=>Array.isArray(u.srcList)&&mSrcList.push(...u.srcList));
                                    const cleanMList = mSrcList.map(normalizeImageRelPath).filter(Boolean);
                                    if(cleanMList.length>0 && mi.imgIndex >= cleanMList.length){
                                        mi.imgIndex = 0;
                                        hasDirtyUrl=true;
                                    }
                                }
                            })
                        }
                    })
                }
            })
        }

        // ver3升级标记消费，只执行一次
        if(forceCleanAll){
            console.log("🔧 ver3版本升级，执行一次性全量图片脏数据清洗");
            appData._triggerImageCleanOnce = false;
            hasDirtyUrl = true;
        }

        if(hasDirtyUrl){
            console.log("🧹二次补跑：检测到脏索引/脏链接，保存清洗后appData");
            saveData();
            imgCacheMap.clear();
        }
    }
    // ==========【补丁2结束】==========

    // 2.组装核心上下文对象，传给UI层script.js
    const Core = buildCoreContext();
    // 3.动态导入，消除顶层import循环依赖
    const { initPage } = await import("./script.js");
    initPage(Core);
    // 4.渲染全局开关初始勾选状态
    renderGlobalSwitchDom();
    // 5.绑定全局开关+剧透弹窗事件（确认+取消双按钮）
    bindGlobalSwitchSpoilerEvents();
    // ⚠️移除bindDynamicGameCardSwitchEvents()调用，放到script.js渲染完列表后执行
}
