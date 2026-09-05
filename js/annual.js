# 三、annual.js 应该添加的代码（按优先级）

## 🔴 高优先级1：textarea 拖拽手柄功能缺失

**问题**：annual.css 中 `.annual-custom-text-wrap .resize-handle` 有完整样式（右下角三角+ns-resize光标），但 annual.js 中**没有任何拖拽事件绑定**。感想框的拖拽手柄是纯装饰，拖不动。

**添加位置**：在 `bindAnnualExportPanel` 函数之后新增 `bindAnnualTextareaResize()` 函数，并在 `realInitAnnualModule` 中调用。

**新增代码**：

```
/**
 * ✅新增：年度报告感想框垂直拖拽（PC鼠标+移动端touch兼容）
 * 对齐 script.js bindTextareaResizeHandler 逻辑
 */
function bindAnnualTextareaResize() {
    document.querySelectorAll('.annual-custom-text-wrap .resize-handle').forEach(handle => {
        if (handle.dataset.resizeBinded === "1") return;
        handle.dataset.resizeBinded = "1";
        const wrap = handle.closest('.annual-custom-text-wrap');
        const textarea = wrap.querySelector('textarea');
        if (!textarea) return;
        let startY = 0, startHeight = 0, isDragging = false;
        function dragStart(y) {
            isDragging = true;
            startY = y;
            startHeight = textarea.clientHeight;
            document.body.style.cursor = "ns-resize";
            document.body.style.touchAction = "none";
        }
        function dragMove(y) {
            if (!isDragging) return;
            const newHeight = Math.max(60, startHeight + (y - startY));
            textarea.style.height = newHeight + "px";
        }
        function dragEnd() {
            if (!isDragging) return;
            isDragging = false;
            document.body.style.cursor = "";
            document.body.style.touchAction = "";
        }
        handle.addEventListener('mousedown', (e) => { e.preventDefault(); dragStart(e.clientY); });
        handle.addEventListener('touchstart', (e) => { e.preventDefault(); dragStart(e.touches[0].clientY); }, {passive:false});
        document.addEventListener('mousemove', (e) => dragMove(e.clientY));
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', (e) => { if(isDragging) dragMove(e.touches[0].clientY); }, {passive:true});
        document.addEventListener('touchend', dragEnd);
    });
}
```

在 `realInitAnnualModule` 中，`bindAnnualExportPanel()` 之后添加：

```
    bindAnnualTextareaResize();  // ✅感想框拖拽手柄
```

同时，由于动态追加条目（appendNewGameTopDom等）会创建新的textarea，需要在每次重建DOM后重新绑定。在 `rebuildGameTopDomAll`、`rebuildCharTopDomAll`、`rebuildCpTopDomAll` 末尾各加一行 `requestAnimationFrame(() => bindAnnualTextareaResize());`，或者更简单——在 `bindTop3Items`/`bindCharTop3Items`/`bindCpTop3Items` 末尾统一调用。

---

## 🔴 高优先级2：渲染锁 + 超时兜底

**问题**：用户快速双击"导出图片"按钮时，`disabled` 状态可能因异步时序来不及生效，导致重复渲染。script.js 有 `isRendering` 锁 + 15秒超时强制解锁。

**添加位置**：annual.js 顶部全局变量区 + `bindAnnualExportPanel` 的导出按钮 handler 内。

**修改前（全局变量区，`let btnAnnualExport;` 附近）**：

```
let btnAnnualExport;
```

**修改后**：

```
let btnAnnualExport;
let _annualIsRendering = false;  // ✅新增：导出渲染锁，防止重复点击
```

**修改前（导出按钮 handler 开头）**：

```
    btnExportImage._handler = async () => {
        if (btnExportImage.disabled) return;
        const originalText = btnExportImage.textContent;
```

**修改后**：

```
    btnExportImage._handler = async () => {
        if (btnExportImage.disabled || _annualIsRendering) return;  // ✅渲染锁
        let unlockTimer = null;
        _annualIsRendering = true;
        unlockTimer = setTimeout(() => {  // ✅15秒超时强制解锁
            _annualIsRendering = false;
            console.warn("[annual]渲染超时，强制解除渲染锁");
        }, 15000);
        const originalText = btnExportImage.textContent;
```

**修改前（finally块）**：

```
        } finally {
            if (typeof progressHandler !== 'undefined') {
                window.removeEventListener('annual-canvas-progress', progressHandler);
            }
            btnExportImage.disabled = false;
            btnExportImage.textContent = originalText;
        }
```

**修改后**：

```
        } finally {
            if (typeof progressHandler !== 'undefined') {
                window.removeEventListener('annual-canvas-progress', progressHandler);
            }
            if (unlockTimer) clearTimeout(unlockTimer);  // ✅清理超时计时器
            _annualIsRendering = false;  // ✅释放渲染锁
            btnExportImage.disabled = false;
            btnExportImage.textContent = originalText;
        }
```

`bindAnnualPreviewButtons` 中"重新生成"按钮同理，也应加锁判断。

---

## 🟡 中优先级3：导出预计耗时精细化

**问题**：`calcAnnualEstimateSec` 计算过于简单，没有纳入图片降级（jsdelivr→COS）、重试2次（每次600ms）、圆角画布串行延时等开销，IOS上实际耗时经常超过预估。

**添加位置**：`calcAnnualEstimateSec` 函数整体重写。

**修改前**：

```
function calcAnnualEstimateSec() {
    const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    let moduleCount = 0, imgCount = 0;
    // ...统计逻辑...
    let moduleCost, imgCost, bufferSec;
    if (IS_IOS_WEBKIT) {
        moduleCost = 0.9; imgCost = 0.55; bufferSec = 3.5;
    } else if (isAndroid) {
        moduleCost = 0.45; imgCost = 0.28; bufferSec = 2.0;
    } else {
        moduleCost = 0.3; imgCost = 0.18; bufferSec = 1.3;
    }
    let sec = Math.ceil(moduleCount * moduleCost + imgCount * imgCost + bufferSec);
    sec = Math.max(1, Math.min(30, sec));
    return sec;
}
```

**修改后**：

```
function calcAnnualEstimateSec() {
    const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    let moduleCount = 0, imgCount = 0;
    // ...统计逻辑不变...
    // ✅对齐script.js：纳入降级概率+重试开销+圆角画布串行延时
    let moduleCost, imgCost, networkBufferSec, roundCanvasOverheadSec;
    if (IS_IOS_WEBKIT) {
        moduleCost = 1.10; imgCost = 0.85;
        networkBufferSec = 4.8;
        roundCanvasOverheadSec = Math.min(8, imgCount * 0.030);
    } else if (isAndroid) {
        moduleCost = 0.55; imgCost = 0.40;
        networkBufferSec = 2.6;
        roundCanvasOverheadSec = Math.min(4, imgCount * 0.012);
    } else {
        moduleCost = 0.35; imgCost = 0.25;
        networkBufferSec = 1.8;
        roundCanvasOverheadSec = Math.min(2.5, imgCount * 0.012);
    }
    const baseEstimate = moduleCount * moduleCost + imgCount * imgCost;
    const fallbackProbability = 0.30;  // 30%图片触发jsdelivr超时降级
    const fallbackPerImageSec = 0.6;   // 每次降级600ms
    const fallbackEstimate = imgCount * fallbackProbability * fallbackPerImageSec;
    let sec = Math.ceil(baseEstimate + networkBufferSec + roundCanvasOverheadSec + fallbackEstimate);
    sec = IS_IOS_WEBKIT ? Math.max(2, Math.min(45, sec)) : Math.max(1, Math.min(35, sec));
    return sec;
}
```

---

## 🟡 中优先级4：弹窗立绘切换 loading 过渡

**问题**：annual弹窗中立绘切换直接 `imgEl.src = newUrl`，大图切换时会有瞬间空白闪烁。script.js 用 `switchCharImageWithLoading` 做过渡。

**添加位置**：annual.js 顶部 import 区 + 所有立绘切换处。

**修改前（import）**：

```
import { renderGameSelectItem, getWebImageUrl, getAvailableCharImages, getCharDisplayName, getCharNameList, getCharShowHide } from '/js/main.js';
```

**修改后**：

```
import { renderGameSelectItem, getWebImageUrl, getAvailableCharImages, getCharDisplayName, getCharNameList, getCharShowHide, switchCharImageWithLoading } from '/js/main.js';
```

然后将所有 `imgEl.src = getWebImageUrl(allSrc[idx] || "")` 替换为：

```
const imgBox = imgEl.closest('.char-card-img-box');
if (imgBox) {
    await switchCharImageWithLoading(imgBox, getWebImageUrl(allSrc[idx] || ""));
}
```

注意：这需要将切换按钮的事件回调改为 `async`。涉及位置：renderCharModalGameList搜索结果、renderCharModalCharList角色列表、renderCpModalFemaleList女主+男主，共约8处。

---

严格按照这次给的内容对这次给的annual.js进行修改。要确保、保证，一定严格、完整地按照内容一一修改，不进行任何私自的改动，不删减、增添、合并或拆分任何无关代码，要原样保留其他代码！不进行对修改方案进行任何思考和质疑，不擅自改动修改方案和内容！修改后输出完整代码：
