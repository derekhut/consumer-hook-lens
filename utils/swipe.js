/**
 * 左右滑动手势的判别 —— 纯函数，不碰界面，所以能直接被脚本测到。
 *
 * 吃触摸起点和终点，吐方向：'left'（向左滑 → 下一张）/ 'right'（向右滑 → 上一张）/
 * ''（不算滑动）。页面拿到方向后才调翻页，这里不关心第几张。
 *
 * 两道门槛，缺一不可：
 *   1. 横向位移必须超过阈值 —— 点一下、抖一下都不算滑；
 *   2. 横向位移必须大于纵向 —— 斜着划、页面上下滚动时不算，免得和滚动打架。
 */

const SWIPE_THRESHOLD = 60;

function swipeDirection(start, end, threshold) {
  const t = typeof threshold === 'number' ? threshold : SWIPE_THRESHOLD;
  if (!start || !end) return '';
  if (typeof start.x !== 'number' || typeof start.y !== 'number') return '';
  if (typeof end.x !== 'number' || typeof end.y !== 'number') return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // NaN 会把所有比较都算成 false，一路漏到方向判断 —— 必须先挡住
  if (isNaN(dx) || isNaN(dy)) return '';
  if (Math.abs(dx) <= t) return '';
  if (Math.abs(dx) <= Math.abs(dy)) return '';
  return dx < 0 ? 'left' : 'right';
}

module.exports = {
  SWIPE_THRESHOLD: SWIPE_THRESHOLD,
  swipeDirection: swipeDirection
};
