/**
 * 标注矩形 —— 纯逻辑。
 *
 * 坐标一律是相对整张图的 0–1 归一化比例（左上原点）。
 * 这是跨屏幕尺寸不错位的唯一办法：换机型、换缩放，框都还在同一个元素上。
 */

const MIN_SIZE = 0.02;

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** 保留 4 位小数。不这么做，0.8 + 0.2 会算出 0.19999999999999996 这种值 */
function round(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * 校验并修正一个矩形。
 * 非法（缺字段、非数字、太小）返回 null —— 让调用方自己去处理，不要悄悄当成 0。
 * 数字字符串（'0.1'）是接受并转换的：模型返回 JSON 时经常这么写。
 *
 * 两种形状都收：对象 {x,y,w,h}，或 **4 个数字的数组 [x,y,w,h]**。
 *
 * 数组这条不是「顺手兼容各种写法」，是 2026-09-25 实测出来的：
 * 同一张图、同一个模型、同一个倒计时条，一次给
 *   {"x":0.12,"y":0.563,"w":0.318,"h":0.037}
 * 一次给
 *   [0.1,0.562,0.38,0.037]
 * y 与 h 逐个对得上 —— 所以数组的语义**就是** [x,y,w,h]，和对象一致，
 * 不是两角坐标 [x1,y1,x2,y2]（按两角读，这几个数会出现 y2 < y1 的负高度）。
 * 6 次里出现 1 次。丢掉它，等于把一次可用结果说成「这张图没看出问题」。
 */
function normalizeRect(rect) {
  if (!rect || typeof rect !== 'object') return null;

  if (Array.isArray(rect)) {
    if (rect.length < 4) return null;
    return normalizeRect({ x: rect[0], y: rect[1], w: rect[2], h: rect[3] });
  }

  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
    return null;
  }

  const nx = clamp01(x);
  const ny = clamp01(y);
  let nw = clamp01(w);
  let nh = clamp01(h);

  // 越界就裁掉，不要让框跑到图片外面
  if (nx + nw > 1) nw = 1 - nx;
  if (ny + nh > 1) nh = 1 - ny;

  const rx = round(nx);
  const ry = round(ny);
  const rw = round(nw);
  const rh = round(nh);

  if (rw < MIN_SIZE || rh < MIN_SIZE) return null;

  return { x: rx, y: ry, w: rw, h: rh };
}

/**
 * 转成百分比字符串。
 *
 * 注意是先取整再乘 100，还是先乘 100 再取整 —— 0.544 取到 4 位小数还是 0.544，
 * 乘 100 却会变成 54.400000000000006，写进内联样式里就是 `top:54.400000000000006%`。
 * 所以必须**先乘再取整到两位**。
 */
function percent(n) {
  return Math.round(n * 100 * 100) / 100 + '%';
}

/**
 * 转成 WXML 内联样式要用的百分比。
 * 非法矩形返回 null，界面据此不渲染这个框（而不是渲染出一个错位的空框）。
 */
function rectToStyle(rect) {
  const r = normalizeRect(rect);
  if (!r) return null;
  return {
    left: percent(r.x),
    top: percent(r.y),
    width: percent(r.w),
    height: percent(r.h)
  };
}

module.exports = {
  MIN_SIZE: MIN_SIZE,
  clamp01: clamp01,
  normalizeRect: normalizeRect,
  rectToStyle: rectToStyle
};
