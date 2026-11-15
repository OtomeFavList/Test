// data/fd-games.js
// 续作/FD专用游戏文件清单，仅年度报告模块加载；FavList 模式不读取
const fdGameFileNames = [
    "game001.js", "game002.js", "game003.js", "game004.js", "game005.js",
    "game006.js", "game007.js", "game008.js", "game009.js", "game010.js",
    "game011.js", "game012.js", "game013.js", "game014.js", "game015.js",
    "game016.js", "game017.js", "game018.js", "game019.js", "game020.js",
    "game021.js", "game022.js", "game023.js", "game024.js", "game025.js",
];
window.fdGameList = [];

async function loadAllFDGames() {
    const baseUrl = "./games/";
    const total = fdGameFileNames.length;
    let loadedCount = 0;
    const importPromises = fdGameFileNames.map(async (fname) => {
        const src = baseUrl + fname;
        try {
            const mod = await import(src);
            if (mod.gameData) {
                window.fdGameList.push(mod.gameData);
            }
            console.log("✅已加载FD游戏：", src);
        } catch (err) {
            console.warn("⚠️FD游戏文件加载跳过：", src, err);
        } finally {
            loadedCount++;
            if (typeof window.onFDGameLoadProgress === "function") {
                window.onFDGameLoadProgress(loadedCount, total);
            }
        }
    });
    await Promise.all(importPromises);
    console.log("✅FD游戏加载完毕，数量：", window.fdGameList.length);
}
window.loadAllFDGames = loadAllFDGames;
export { loadAllFDGames };
