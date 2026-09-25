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

// --- 数组形状的 rect：[x, y, w, h] ---
//
// 不是「顺手兼容」，是模型真的这么写（2026-09-25 实测 6 次里 1 次）。
// 丢掉它的表现是「整张图 0 条标注」，看起来像「模型没看出问题」——
// 是最难查的那类错，所以必须有断言守住。

suite.eq('4 个数字的数组按 [x,y,w,h] 接受', ann.normalizeRect([0.1, 0.2, 0.5, 0.15]), { x: 0.1, y: 0.2, w: 0.5, h: 0.15 });
suite.eq('数组与同义对象结果相同（语义确实一致）',
  ann.normalizeRect([0.12, 0.563, 0.318, 0.037]),
  ann.normalizeRect({ x: 0.12, y: 0.563, w: 0.318, h: 0.037 }));
suite.eq('数组里的数字字符串也接受', ann.normalizeRect(['0.1', '0.2', '0.5', '0.2']), { x: 0.1, y: 0.2, w: 0.5, h: 0.2 });
suite.eq('数组越界也要裁', ann.normalizeRect([0.8, 0.1, 0.5, 0.2]), { x: 0.8, y: 0.1, w: 0.2, h: 0.2 });
suite.eq('数组长度不足返回 null', ann.normalizeRect([0.1, 0.2, 0.5]), null);
suite.eq('空数组返回 null', ann.normalizeRect([]), null);
suite.eq('数组里有非数字返回 null', ann.normalizeRect([0.1, 'abc', 0.5, 0.2]), null);
suite.eq('数组里高度过小返回 null', ann.normalizeRect([0.1, 0.1, 0.2, 0.005]), null);

// --- 模型偶尔直接给像素值（264 / 789 这种）---
// 夹到 0–1 之后宽高必然被压成 0，于是判为非法、不画框。
// 这是对的：按像素当比例画出来的框会盖满整屏，比不画糟得多。

suite.eq('像素值但没给图幅 → 判非法，不画错位框', ann.normalizeRect({ x: 264, y: 789, w: 130, h: 25 }), null);

// --- 像素坐标换算（给了图幅才敢换）---
//
// 模型经常直接给像素：实测同一批图，一次给 `{"x":0,"y":0.528,"w":1,"h":0.06}`，
// 一次给 `[36,557,283,60]`。判据是「四个数里有一个 > 1」——比例值按定义不可能超过 1。
// 不换的后果：36 被夹成 1、283 被夹成 1，宽高压成 0 → 整条判非法 → 整屏 0 标注，
// 界面说「有几处它不太确定，先不标了」。看起来像模型没把握，其实是我们自己扔的。

const SIZE = { w: 600, h: 900 };

suite.eq('像素坐标按图幅换算成比例',
  ann.normalizeRect({ x: 54, y: 450, w: 540, h: 90 }, SIZE), { x: 0.09, y: 0.5, w: 0.9, h: 0.1 });
suite.eq('像素数组也换算',
  ann.normalizeRect([36, 225, 300, 45], SIZE), { x: 0.06, y: 0.25, w: 0.5, h: 0.05 });
suite.eq('图幅写成 {width,height} 也认',
  ann.normalizeRect({ x: 54, y: 450, w: 540, h: 90 }, { width: 600, height: 900 }),
  { x: 0.09, y: 0.5, w: 0.9, h: 0.1 });
suite.eq('本来就是比例的，给了图幅也不动（不能被误当像素）',
  ann.normalizeRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.15 }, SIZE), { x: 0.1, y: 0.2, w: 0.5, h: 0.15 });
suite.eq('像素值越界也要裁',
  ann.normalizeRect({ x: 540, y: 810, w: 300, h: 180 }, SIZE), { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
suite.eq('图幅非法（没有 / 0 / 负数）时不换算',
  [ann.normalizeRect({ x: 54, y: 450, w: 540, h: 90 }),
   ann.normalizeRect({ x: 54, y: 450, w: 540, h: 90 }, { w: 0, h: 900 }),
   ann.normalizeRect({ x: 54, y: 450, w: 540, h: 90 }, { w: -600, h: 900 })],
  [null, null, null]);
suite.eq('换算后太小的框照样判非法', ann.normalizeRect({ x: 0, y: 0, w: 300, h: 9 }, SIZE), null);
suite.eq('imageSize 认两种写法', [ann.imageSize({ w: 6, h: 9 }), ann.imageSize({ width: 6, height: 9 })],
  [{ w: 6, h: 9 }, { w: 6, h: 9 }]);
suite.ok('imageSize 拒绝非法输入',
  ann.imageSize(null) === null && ann.imageSize({ w: 0, h: 1 }) === null && ann.imageSize('6x9') === null);

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
