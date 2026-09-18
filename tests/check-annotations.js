const { createSuite } = require('./harness');
const ann = require('../utils/annotations');
const { SHOTS } = require('../data/shots');

const suite = createSuite('check-annotations.js');

// --- 正常矩形 ---

suite.eq('合法矩形原样通过', ann.normalizeRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.15 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.15 });
suite.eq('贴着右下角仍然合法', ann.normalizeRect({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }), { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });

// --- 越界裁剪：框绝不能跑到图片外面 ---

suite.eq('右边界超出就裁宽度', ann.normalizeRect({ x: 0.8, y: 0.1, w: 0.5, h: 0.2 }), { x: 0.8, y: 0.1, w: 0.2, h: 0.2 });
suite.eq('下边界超出就裁高度', ann.normalizeRect({ x: 0.1, y: 0.7, w: 0.2, h: 0.6 }), { x: 0.1, y: 0.7, w: 0.2, h: 0.3 });

// --- 非法输入一律返回 null，不要悄悄变成 0 ---

suite.eq('缺字段返回 null', ann.normalizeRect({ x: 0.1, y: 0.2 }), null);
suite.eq('非数字字符串返回 null', ann.normalizeRect({ x: 'abc', y: 0.2, w: 0.5, h: 0.2 }), null);
suite.eq('数字字符串会被接受（模型返回 JSON 时经常这么写）', ann.normalizeRect({ x: '0.1', y: '0.2', w: '0.5', h: '0.2' }), { x: 0.1, y: 0.2, w: 0.5, h: 0.2 });
suite.eq('NaN 返回 null', ann.normalizeRect({ x: NaN, y: 0.2, w: 0.5, h: 0.2 }), null);
suite.eq('Infinity 返回 null', ann.normalizeRect({ x: 0, y: 0, w: Infinity, h: 0.2 }), null);
suite.eq('null 返回 null', ann.normalizeRect(null), null);
suite.eq('undefined 返回 null', ann.normalizeRect(undefined), null);
suite.eq('字符串返回 null', ann.normalizeRect('0.1,0.2'), null);
suite.eq('负数坐标被夹到 0 后仍然合法', ann.normalizeRect({ x: -0.3, y: -0.1, w: 0.5, h: 0.3 }), { x: 0, y: 0, w: 0.5, h: 0.3 });

// --- 太小的框没有意义，宁可不出这个框 ---

suite.eq('宽度过小返回 null', ann.normalizeRect({ x: 0.1, y: 0.1, w: 0.01, h: 0.2 }), null);
suite.eq('高度过小返回 null', ann.normalizeRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.005 }), null);
suite.eq('零面积返回 null', ann.normalizeRect({ x: 0.1, y: 0.1, w: 0, h: 0 }), null);
suite.eq('刚好到最小边长是合法的', ann.normalizeRect({ x: 0.5, y: 0.5, w: ann.MIN_SIZE, h: ann.MIN_SIZE }), { x: 0.5, y: 0.5, w: 0.02, h: 0.02 });

// --- 百分比样式 ---

suite.eq('转成百分比四舍五入到两位小数', ann.rectToStyle({ x: 0.1234, y: 0.5, w: 0.25, h: 0.0625 }), {
  left: '12.34%',
  top: '50%',
  width: '25%',
  height: '6.25%'
});
suite.eq('非法矩形不产生样式（界面就不渲染这个框）', ann.rectToStyle({ x: 0.1, y: 0.1 }), null);
suite.eq('clamp01 夹住两头', [ann.clamp01(-1), ann.clamp01(0.5), ann.clamp01(2)], [0, 0.5, 1]);

// --- 写进内联样式的百分比必须是干净的字符串 ---
// 教训：0.544 乘 100 会算出 54.400000000000006，于是样式里出现
// `top:54.400000000000006%`。浮点噪声不影响渲染，但会让人以为坐标算错了。

const CLEAN = /^\d+(\.\d{1,2})?%$/;

suite.eq('0.544 转出来是 54.4% 而不是 54.400000000000006%', ann.rectToStyle({ x: 0, y: 0.544, w: 1, h: 0.1 }).top, '54.4%');
suite.eq('0.078 转出来是 7.8% 而不是 7.800000000000001%', ann.rectToStyle({ x: 0, y: 0.1, w: 1, h: 0.078 }).height, '7.8%');
suite.eq('0.97 转出来是 97%', ann.rectToStyle({ x: 0.015, y: 0.1, w: 0.97, h: 0.1 }).width, '97%');

// 三个示例里每一个坐标都得是干净的 —— 任何一个漏网都是界面上的可疑数字
let dirty = [];
SHOTS.forEach(function (shot) {
  shot.hooks.forEach(function (h) {
    const s = ann.rectToStyle(h.rect);
    if (!s) return;
    ['left', 'top', 'width', 'height'].forEach(function (k) {
      if (!CLEAN.test(s[k])) dirty.push(shot.id + '/' + h.id + ' ' + k + '=' + s[k]);
    });
  });
});
suite.ok('三段示例产出的百分比全部干净' + (dirty.length ? '（脏值：' + dirty.join('、') + '）' : ''), dirty.length === 0);

// 边界扫一遍，避免只修好了手头这几个数
let ugly = [];
for (let i = 0; i <= 1000; i++) {
  const v = i / 1000;
  const s = ann.rectToStyle({ x: 0, y: 0, w: 1, h: Math.max(v, 0.02) });
  if (s && !CLEAN.test(s.height)) ugly.push(v + ' -> ' + s.height);
}
suite.ok('0 到 1 逐千分位扫一遍，没有出现浮点噪声' + (ugly.length ? '（例如 ' + ugly[0] + '）' : ''), ugly.length === 0);

suite.done();
