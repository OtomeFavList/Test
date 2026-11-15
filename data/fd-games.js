// data/fd-games.js
// 续作/FD专用游戏文件清单，仅年度报告模块加载；FavList 模式不读取
const fdGameFileNames = [
    "fd001.js", "fd002.js", "fd003.js", "fd004.js", "fd005.js",
    "fd006.js", "fd007.js", "fd008.js", "fd009.js", "fd010.js",
    "fd011.js", "fd012.js", "fd013.js", "fd014.js", "fd015.js",
    "fd016.js", "fd017.js", "fd018.js", "fd019.js", "fd020.js",
    "fd021.js", "fd022.js", "fd023.js", "fd024.js", "fd025.js",
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
