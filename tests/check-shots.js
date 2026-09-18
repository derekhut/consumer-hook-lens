const { createSuite } = require('./harness');
const fs = require('fs');
const path = require('path');

const { SHOTS } = require('../data/shots');
const hooks = require('../utils/hooks');
const { normalizeRect } = require('../utils/annotations');

const suite = createSuite('check-shots.js');
const ROOT = path.join(__dirname, '..');

// --- 整体 ---

suite.eq('示例数量是 3', SHOTS.length, 3);

const ids = SHOTS.map(function (s) { return s.id; });
suite.ok('示例 id 不重复', new Set(ids).size === ids.length);

// --- 每张图都要能被真正加载出来 ---

SHOTS.forEach(function (shot) {
  suite.ok(
    shot.id + ' 的图片文件真实存在（' + shot.image + '）',
    fs.existsSync(path.join(ROOT, shot.image))
  );
  suite.ok(shot.id + ' 有 appName', !!shot.appName && shot.appName.length > 0);
  suite.ok(shot.id + ' 至少有一处陷阱', Array.isArray(shot.hooks) && shot.hooks.length > 0);
});

// --- 每处陷阱的 id 必须在词典里（否则卡片上会是一片空白）---

const unknown = [];
SHOTS.forEach(function (shot) {
  shot.hooks.forEach(function (h) {
    if (!hooks.getHookPattern(h.id)) unknown.push(shot.id + ':' + h.id);
  });
});
suite.eq('所有陷阱 id 都能在词典里找到', unknown, []);

// --- 同一张图里不能重复标同一个 id ---

const dup = [];
SHOTS.forEach(function (shot) {
  const list = shot.hooks.map(function (h) { return h.id; });
  if (new Set(list).size !== list.length) dup.push(shot.id);
});
suite.eq('同一张图里没有重复的陷阱 id', dup, []);

// --- 坐标必须合法：越界、太小、非数字都会被 normalizeRect 挡下来 ---

const badRect = [];
SHOTS.forEach(function (shot) {
  shot.hooks.forEach(function (h) {
    if (!normalizeRect(h.rect)) badRect.push(shot.id + ':' + h.id);
  });
});
suite.eq('所有坐标都是合法的归一化矩形', badRect, []);

// --- 框不能大到失去意义 ---
// 注意：宽度占满是对的（倒计时条、凑单条本来就是全宽横幅），
// 所以这里按面积判断：单个框超过半个图幅，就不是"框住一个元素"了。

const tooBig = [];
SHOTS.forEach(function (shot) {
  shot.hooks.forEach(function (h) {
    const r = normalizeRect(h.rect);
    if (r && r.w * r.h > 0.5) tooBig.push(shot.id + ':' + h.id);
  });
});
suite.eq('没有大到失去意义的框（单个框不超过半个图幅）', tooBig, []);

// --- 三段角色必须按「教 → 练 → 放手」排，这是演示脚本的骨架 ---

suite.eq(
  '三段角色依次是 reveal / find-one / find-all',
  SHOTS.map(function (s) { return s.mode; }),
  ['reveal', 'find-one', 'find-all']
);

const badMode = SHOTS.filter(function (s) {
  return ['reveal', 'find-one', 'find-all'].indexOf(s.mode) === -1;
});
suite.eq('没有来历不明的模式', badMode.map(function (s) { return s.id; }), []);

// --- 「还有一处」要成立，找的图里至少得有两处 ---

const tooFew = SHOTS.filter(function (s) {
  return s.mode !== 'reveal' && s.hooks.length < 2;
});
suite.eq('找的图里至少有两处（否则「还有一处」无从谈起）', tooFew.map(function (s) { return s.id; }), []);

// --- 找的模式靠透明热区接点击，热区重叠就会出现「点中了却不是它」---

function overlap(a, b) {
  const ra = normalizeRect(a);
  const rb = normalizeRect(b);
  if (!ra || !rb) return false;
  const w = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
  const h = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
  return w > 0 && h > 0;
}

const overlapped = [];
SHOTS.forEach(function (shot) {
  if (shot.mode === 'reveal') return;
  for (let i = 0; i < shot.hooks.length; i++) {
    for (let j = i + 1; j < shot.hooks.length; j++) {
      if (overlap(shot.hooks[i].rect, shot.hooks[j].rect)) {
        overlapped.push(shot.id + ':' + shot.hooks[i].id + '+' + shot.hooks[j].id);
      }
    }
  }
});
suite.eq('找的模式下热区互不重叠', overlapped, []);

// --- 三段示例合起来覆盖的维度数：演示时那句"任何 App 都能这样读"要有依据 ---

const dims = new Set();
SHOTS.forEach(function (shot) {
  shot.hooks.forEach(function (h) {
    const p = hooks.getHookPattern(h.id);
    if (p) dims.add(p.dimensionId);
  });
});
suite.ok('三段示例覆盖了至少 3 个一级维度（实际 ' + dims.size + ' 个）', dims.size >= 3);

suite.done();
