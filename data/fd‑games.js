// data/fd‑games.js
// FD/续作专用游戏文件清单，仅annual年度报告模块加载；FavList主模式不会读取这里
const fdGameFileNames = [
    // 示例："fd001.js","fd002.js",…… 后续新增FD文件只往这里追加文件名
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
