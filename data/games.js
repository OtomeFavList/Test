// data/games.js
// 聚合games/下所有独立游戏数据，自动合并全局数组
// 新增游戏只新建games/gameXXX.js，仅需要在下方数组追加文件名，本文件其余代码永久不用修改
const allGameFileNames = [
    "game001.js", "game002.js", "game003.js", "game004.js", "game005.js",
    "game006.js", "game007.js", "game008.js", "game009.js", "game010.js",
    "game011.js", "game012.js", "game013.js", "game014.js", "game015.js",
    "game016.js", "game017.js", "game018.js", "game019.js", "game020.js",
    "game021.js", "game022.js", "game023.js", "game024.js", "game025.js",
    "game026.js", "game027.js", "game028.js", "game029.js", "game030.js",
    "game031.js", "game032.js", "game033.js", "game034.js", "game035.js",
    "game036.js", "game037.js", "game038.js", "game039.js", "game040.js",
    "game041.js", "game042.js", "game043.js", "game044.js", "game045.js",
    "game046.js", "game047.js", "game048.js", "game049.js", "game050.js",
    "game051.js", "game052.js", "game053.js", "game054.js", "game055.js",
    "game056.js", "game057.js", "game058.js", "game059.js", "game060.js",
    "game061.js", "game062.js", "game063.js", "game064.js", "game065.js",
    "game066.js", "game067.js", "game068.js", "game069.js", "game070.js",
    "game071.js", "game072.js", "game073.js", "game074.js", "game075.js",
    "game076.js", "game077.js", "game078.js", "game079.js", "game080.js",
    "game081.js", "game082.js", "game083.js", "game084.js", "game085.js",
    "game086.js", "game087.js", "game088.js", "game089.js", "game090.js",
    "game091.js", "game092.js", "game093.js", "game094.js", "game095.js",
    "game096.js", "game097.js", "game098.js", "game099.js", "game100.js",
    "game101.js", "game102.js", "game103.js", "game104.js", "game105.js",
    "game106.js", "game107.js", "game108.js", "game109.js", "game110.js",
    "game111.js", "game112.js", "game113.js", "game114.js", "game115.js",
    "game116.js", "game117.js", "game118.js", "game119.js", "game120.js",
    "game121.js", "game122.js", "game123.js", "game124.js", "game125.js",
    "game126.js", "game127.js", "game128.js", "game129.js", "game130.js",
    "game131.js", "game132.js", "game133.js", "game134.js", "game135.js",
    "game136.js", "game137.js", "game138.js", "game139.js", "game140.js",
];

// 全局游戏数据存储容器
window.gameDataList = [];

// 使用网站根绝对路径，彻底消除模块相对路径错乱
async function loadAllGames() {
    const baseUrl = "./games/";
    const total = allGameFileNames.length;
    let loadedCount = 0;
    // 注意：window.gameDataList 已在外部初始化，不重复重置保留原有兼容性

    // 构建全部导入Promise数组，实现并发批量加载
    const importPromises = allGameFileNames.map(async (fname) => {
        const src = baseUrl + fname;
        try {
            const mod = await import(src);
            if (mod.gameData) {
                window.gameDataList.push(mod.gameData);
            }
            console.log("✅已加载：", src);
        } catch (err) {
            console.warn("⚠️该游戏文件加载跳过：", src, err);
        } finally {
            loadedCount++;
            // 调用全局进度回调更新弹窗文字
            if (typeof window.onGameLoadProgress === "function") {
                window.onGameLoadProgress(loadedCount, total);
            }
        }
    });

    // 等待所有并发导入完成
    await Promise.all(importPromises);

    console.log("✅游戏加载流程执行完毕，总数量：", window.gameDataList.length);
    if (typeof window.renderGameSelectList === "function") {
        window.renderGameSelectList();
    }
}
window.loadAllGames = loadAllGames;
