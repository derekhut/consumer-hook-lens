/**
 * 把绘制计划画到一块 canvas 上。
 *
 * **单独抽成一个文件，是为了让「小程序页面」和「离线预览工具」用同一份渲染代码。**
 * 如果预览工具自己再实现一遍，那它验的就不是真机上的那份代码 —— 预览看着好、
 * 真机画歪，是最坏的情况。
 *
 * 不认识 canvas 是小程序的还是浏览器的：两边都是 `getContext('2d')`，
 * 用到的 API 也是共通的（fillText / drawImage / arc / arcTo / scale）。
 */

/**
 * 照着计划画。
 * 这里只认五种图元，出现别的就报出来 —— 默默跳过等于卡片缺一块还没人知道。
 * 返回真实画出来的张数，方便调用方核对（测试靠它断言"计划有几种就画了几种"）。
 */
function drawPlan(ctx, plan, img, onError) {
  let painted = 0;

  plan.items.forEach(function (it) {
    if (it.type === 'text') {
      ctx.font = (it.weight || '400') + ' ' + it.size + 'px "PingFang SC", sans-serif';
      ctx.fillStyle = it.color;
      ctx.textAlign = it.align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.text, it.x, it.y);
      painted += 1;
      return;
    }

    if (it.type === 'image') {
      ctx.drawImage(img, it.x, it.y, it.w, it.h);
      painted += 1;
      return;
    }

    if (it.type === 'rect') {
      roundRectPath(ctx, it.x, it.y, it.w, it.h, it.radius || 0);
      if (it.fill) {
        ctx.fillStyle = it.fill;
        ctx.fill();
      }
      if (it.stroke) {
        ctx.strokeStyle = it.stroke;
        ctx.lineWidth = it.lineWidth || 1;
        ctx.stroke();
      }
      painted += 1;
      return;
    }

    if (it.type === 'circle') {
      ctx.beginPath();
      ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
      ctx.fillStyle = it.fill;
      ctx.fill();
      painted += 1;
      return;
    }

    if (it.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      ctx.strokeStyle = it.color;
      ctx.lineWidth = it.lineWidth || 1;
      ctx.stroke();
      painted += 1;
      return;
    }

    // 不认识的图元要说出来
    if (onError) onError('不认识的图元类型：' + it.type);
  });

  return painted;
}

/** 圆角矩形路径。老基础库没有 roundRect，自己走一遍 */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (rr <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

module.exports = {
  drawPlan: drawPlan,
  roundRectPath: roundRectPath
};
