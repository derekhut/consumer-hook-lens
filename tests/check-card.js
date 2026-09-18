/**
 * 卡片排版的检查。
 *
 * 这一层能测，是因为排版被切成了纯逻辑（`utils/card.js` 只产出绘制计划，
 * 不碰 canvas）。真机上要看的只剩下「字有没有画歪」。
 */

const { createSuite } = require('./harness');
const card = require('../utils/card');
const hooks = require('../utils/hooks');
const { SHOTS } = require('../data/shots');

const suite = createSuite('check-card.js');

const W = card.DESIGN_WIDTH;
const PAD = card.PAD;

// --- 字符宽度估算 ---

suite.eq('空串宽度是 0', card.measure('', 30), 0);
suite.eq('汉字按一个字宽算', card.measure('看', 30), 30);
suite.eq('全角冒号也是宽字符', card.isWideChar('：'), true);
suite.eq('「」是宽字符', card.isWideChar('「') && card.isWideChar('」'), true);
suite.eq('拉丁字母是窄字符', card.isWideChar('a'), false);
suite.eq('句点是窄字符', card.isWideChar('.'), false);
suite.ok('窄字符一定比宽字符窄', card.charWidth('a', 30) < card.charWidth('看', 30));
suite.ok('估算宁可偏宽', card.charWidth('a', 30) >= 30 * 0.5);

// --- 折行 ---

suite.eq('空文本不产生行', card.wrapText('', 30, 300), []);

const ONE_LINE = '这是一句短的';
suite.eq('放得下就一行', card.wrapText(ONE_LINE, 30, 400), [ONE_LINE]);

// 这是词典里最长的一句机制
const LONG = hooks.getHookPattern('B1').note;
suite.ok('长句会被折成多行', card.wrapText(LONG, 27, 400).length > 1);

// 行尾可能为「拉回上一行的标点」宽出不到一个字，这是中文排版的常规做法
const OVER = '。，、；：！？）」』】》…·%';

function checkWrapping(label, text, size, maxWidth) {
  const lines = card.wrapText(text, size, maxWidth);
  const problems = [];

  lines.forEach(function (ln) {
    const w = card.measure(ln, size);
    if (w > maxWidth) {
      const last = ln.charAt(ln.length - 1);
      if (OVER.indexOf(last) === -1) problems.push('超宽但结尾不是标点：' + ln);
      else if (w > maxWidth + size) problems.push('超宽超过一个字：' + ln);
    }
    if (ln.length > 1 && OVER.indexOf(ln.charAt(0)) !== -1) problems.push('行首是收尾标点：' + ln);
    if ('（「『【《'.indexOf(ln.charAt(ln.length - 1)) !== -1) problems.push('行尾是开引号：' + ln);
  });

  if (lines.join('') !== text) problems.push('拼不回原文（有字丢了）：' + lines.join('|'));

  suite.eq(label + '（' + lines.length + ' 行）', problems, []);
}

checkWrapping('长机制句折行后不越界、不丢字', LONG, 27, 400);
checkWrapping('窄容器里也不越界', hooks.MULTI_DIMENSION_CLOSING, 29, 300);
checkWrapping('英文和数字混排也不越界', 'iPhone 15 Pro 立减 800 元，限时 24 小时', 27, 260);
checkWrapping('带「」的句子不在引号处断错', '这几处都在做同一件事：缩短你从「看到」到「决定」的时间。', 29, 420);
checkWrapping('一个很窄的容器（每行只能放两个字）', LONG, 27, 54);

// 词典里每一句都过一遍，不只是手头这几句
let bad = [];
hooks.HOOK_PATTERNS.forEach(function (p) {
  [30, 0.5].forEach(function (maxW) {
    if (maxW === 0.5) return;
    const lines = card.wrapText(p.note, 27, maxW);
    if (lines.join('') !== p.note) bad.push(p.id);
  });
});
suite.eq('13 条机制句逐条折行都不丢字', bad, []);

// --- 图在卡片里占多大 ---

const box15 = card.imageBox(1.5);
suite.eq('常见竖屏截图铺满内容宽', box15.w, card.CONTENT_W);
suite.eq('高度按比例算出来', box15.h, Math.round(card.CONTENT_W * 1.5));
suite.eq('铺满时居中不偏移', box15.x, PAD);

const boxTall = card.imageBox(4);
suite.eq('特别长的截图按最高值回缩', boxTall.h, card.MAX_IMAGE_H);
suite.ok('回缩后变窄并居中', boxTall.w < card.CONTENT_W && boxTall.x > PAD);
suite.eq('回缩后仍然居中', boxTall.x * 2 + boxTall.w, W);

const boxWide = card.imageBox(0.5);
suite.eq('横图也铺满内容宽', boxWide.w, card.CONTENT_W);
suite.ok('横图更矮', boxWide.h < box15.h);

const boxBad = card.imageBox('不是数字');
suite.eq('比例不合法时退回默认值，不至于不出卡片', boxBad.w, card.CONTENT_W);
suite.eq('负数比例也退回默认值', card.imageBox(-2).w, card.CONTENT_W);
suite.eq('0 也退回默认值', card.imageBox(0).w, card.CONTENT_W);

// --- 结论跟着维度走 ---

const A1 = hooks.getHookPattern('A1');
const B1 = hooks.getHookPattern('B1');
const C3 = hooks.getHookPattern('C3');

suite.eq('一处时用它那个维度的收尾话', card.conclusionFor([A1]), hooks.getHookDimension('A').closing);
suite.eq('两处同维度时还是那个维度的收尾话', card.conclusionFor([A1, hooks.getHookPattern('A2')]), hooks.getHookDimension('A').closing);
suite.eq('两处不同维度时用那句总的', card.conclusionFor([A1, B1]), hooks.MULTI_DIMENSION_CLOSING);
suite.eq('三处跨三维度也用那句总的', card.conclusionFor([A1, B1, C3]), hooks.MULTI_DIMENSION_CLOSING);
suite.eq('没有输入时不出结论', card.conclusionFor([]), '');
suite.eq('脏输入不出结论', card.conclusionFor([null, undefined]), '');
suite.ok('结论不会为空串混进卡片', card.conclusionFor([A1]).length > 0);

// --- 只展示已经标出来的那几处 ---

const SHOT1 = SHOTS[0];
suite.eq('一处都没标出就什么都不展示', card.pickHooks(SHOT1, []).length, 0);
suite.eq('标出一处就展示一处', card.pickHooks(SHOT1, ['A1']).map(function (h) { return h.id; }), ['A1']);
suite.eq('顺序跟着示例走，不跟着点选顺序走', card.pickHooks(SHOT1, ['B1', 'A1']).map(function (h) { return h.id; }), ['A1', 'B1']);
suite.eq('没标出的那处不会混进去', card.pickHooks(SHOT1, ['A1']).map(function (h) { return h.id; }), ['A1']);
suite.eq('词典里没有的 id 被跳过', card.pickHooks(SHOT1, ['A1', 'ZZ']).length, 1);
suite.eq('脏数据不崩', card.pickHooks(null, null).length, 0);

// --- 绘制计划 ---

suite.eq('没有示例时不出卡片', card.buildCard(null), null);
suite.eq('没有已标出的处时不出卡片', card.buildCard({ shot: SHOT1, revealed: [] }), null);
suite.eq('只有不认识的 id 时不出卡片', card.buildCard({ shot: SHOT1, revealed: ['ZZ'] }), null);
suite.eq('示例没有图时不出卡片', card.buildCard({ shot: { hooks: SHOT1.hooks }, revealed: ['A1'] }), null);

const plan = card.buildCard({ shot: SHOT1, revealed: ['A1', 'B1'] });

suite.ok('正常输入能出卡片', !!plan);
suite.eq('画布宽度是设计稿宽度', plan.width, W);
suite.eq('数出来是两处', plan.count, 2);
suite.eq('第一件是整张卡片的白底', plan.items[0].type, 'rect');
suite.eq('白底铺满整张卡片', [plan.items[0].x, plan.items[0].y, plan.items[0].w, plan.items[0].h], [0, 0, W, plan.height]);
suite.ok('画布高度是正的', plan.height > 0);

// 每一种图元都得是计划里认得的类型，页面才画得出来
const TYPES = ['rect', 'text', 'image', 'line', 'circle'];
const unknown = plan.items.filter(function (it) { return TYPES.indexOf(it.type) === -1; });
suite.eq('没有页面不认识的图元类型', unknown.map(function (it) { return it.type; }), []);

// --- 所有图元都必须在画布内 ---

function boundsOf(it) {
  if (it.type === 'rect') return { x: it.x, y: it.y, w: it.w, h: it.h };
  if (it.type === 'circle') return { x: it.cx - it.r, y: it.cy - it.r, w: it.r * 2, h: it.r * 2 };
  if (it.type === 'line') {
    return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: 0, h: 0 };
  }
  if (it.type === 'image') return { x: it.x, y: it.y, w: it.w, h: it.h };
  return { x: it.x, y: it.y, w: 0, h: 0 };
}

function outOfBounds(plan) {
  return plan.items.filter(function (it) {
    const b = boundsOf(it);
    return b.x < -0.5 || b.y < -0.5 || b.x + b.w > plan.width + 0.5 || b.y + b.h > plan.height + 0.5;
  });
}

suite.eq('没有图元跑到画布外面', outOfBounds(plan).length, 0);

// 极端的图比例也不许把东西挤出画布
[[0.4, '横图'], [1.5, '竖图'], [5, '长图']].forEach(function (pair) {
  const p = card.buildCard({ shot: SHOT1, revealed: ['A1', 'B1'], imageRatio: pair[0] });
  suite.eq(pair[1] + '进去也不出界（画布高 ' + p.height + '）', outOfBounds(p).length, 0);
});

// --- 文字不许出界、不许互相压住 ---

function textBox(it) {
  const w = card.measure(it.text, it.size);
  let x = it.x;
  if (it.align === 'center') x = it.x - w / 2;
  if (it.align === 'right') x = it.x - w;
  return { x: x, y: it.y - Math.round(it.size * 0.85), w: w, h: card.lineHeight(it.size), text: it.text };
}

function textProblems(plan) {
  const texts = plan.items.filter(function (it) { return it.type === 'text'; });
  const problems = [];

  texts.forEach(function (it) {
    const b = textBox(it);
    if (b.x < PAD - 0.5) problems.push('左边出界：' + it.text);
    if (b.x + b.w > W - PAD + PAD * 0.5) problems.push('右边出界：' + it.text);
    if (b.y < -0.5 || b.y + b.h > plan.height + 0.5) problems.push('上下出界：' + it.text);
    if (!it.color) problems.push('没给颜色：' + it.text);
    if (it.size < 11) problems.push('字太小：' + it.text);
  });

  // 两两比一遍，看有没有哪两段字压在一起（相邻行的框是相切的，不算压住）
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = textBox(texts[i]);
      const b = textBox(texts[j]);
      const hit = a.x + a.w > b.x + 0.5 && b.x + b.w > a.x + 0.5 &&
                  a.y + a.h > b.y + 0.5 && b.y + b.h > a.y + 0.5;
      if (hit) problems.push('两段字压住了：「' + a.text + '」和「' + b.text + '」');
    }
  }

  return problems;
}

suite.eq('两处的卡片：文字不出界、不互相压住', textProblems(plan), []);

// 词典里每一处陷阱单独成卡，都不许压
let badRows = [];
hooks.HOOK_PATTERNS.forEach(function (p) {
  const shot = { image: '/assets/samples/01.jpg', appName: '测试页', hooks: [{ id: p.id, rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.1 } }] };
  const one = card.buildCard({ shot: shot, revealed: [p.id] });
  const probs = textProblems(one);
  if (probs.length) badRows.push(p.id + '：' + probs[0]);
});
suite.eq('13 处陷阱逐个做成卡片，文字都不打架', badRows, []);

// --- 编号和列表要对得上 ---

const badgeTexts = plan.items.filter(function (it) {
  return it.type === 'text' && it.align === 'center' && /^[0-9]+$/.test(it.text);
});
suite.eq('编号的数量是「框上 2 个 + 列表里 2 个」', badgeTexts.length, 4);
suite.eq('框上的编号是 1、2', badgeTexts.slice(0, 2).map(function (it) { return it.text; }), ['1', '2']);
suite.eq('列表里的编号也是 1、2', badgeTexts.slice(2).map(function (it) { return it.text; }), ['1', '2']);

const names = plan.items.filter(function (it) {
  return it.type === 'text' && hooks.HOOK_PATTERNS.some(function (p) { return p.name === it.text; });
});
suite.eq('两个陷阱名都印在卡片上', names.map(function (it) { return it.text; }), ['限时倒计时', '划线价锚定']);

const dims = plan.items.filter(function (it) {
  return it.type === 'text' && hooks.HOOK_DIMENSIONS.some(function (d) { return d.name === it.text; });
});
suite.eq('两个维度名都印在卡片上', dims.length, 2);

const notes = plan.items.filter(function (it) {
  return it.type === 'text' && hooks.HOOK_PATTERNS.some(function (p) { return p.note.indexOf(it.text) === 0; });
});
suite.eq('两句机制都印在卡片上', notes.length, 2);

suite.eq('结论跟着维度走，两处不同维度用那句总的', plan.conclusion, hooks.MULTI_DIMENSION_CLOSING);

// 结论会被折行，所以「印上去了」要按行核对 —— 不能拿整句话去找某个图元，
// 那样永远找不到（除非它正好只占一行）。
const conclLines = card.wrapText(plan.conclusion, card.SIZE.body + 2, card.CONTENT_W);
const conclPrinted = conclLines.filter(function (ln) {
  return plan.items.some(function (it) { return it.type === 'text' && it.text === ln; });
});
suite.eq('结论的每一行都印在卡片上（共 ' + conclLines.length + ' 行）', conclPrinted.length, conclLines.length);

// --- 图的标注框要对得上坐标 ---

const image = plan.items.filter(function (it) { return it.type === 'image'; });
suite.eq('卡片里有一张图', image.length, 1);
suite.eq('图的路径就是示例的路径', image[0].src, SHOT1.image);

const boxes = plan.items.filter(function (it) { return it.type === 'rect' && it.stroke; });
suite.eq('两处陷阱画了两个框', boxes.length, 2);

// 第一个框：A1 的归一化坐标换算到图上必须落在同一个相对位置
const a1 = SHOT1.hooks[0].rect;
const expectX = Math.round(image[0].x + a1.x * image[0].w);
const expectY = Math.round(image[0].y + a1.y * image[0].h);
suite.eq('框的位置按归一化坐标换算对了', [boxes[0].x, boxes[0].y], [expectX, expectY]);
suite.ok('框的宽度也跟着图缩放', boxes[0].w === Math.round(a1.w * image[0].w));

// 坐标非法的陷阱不该画出框，但也不该让整张卡片不出来
const brokenShot = {
  image: '/assets/samples/01.jpg',
  appName: '测试页',
  hooks: [{ id: 'A1', rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.1 } }, { id: 'B1', rect: { x: 'bad', y: 0.1, w: 0.1, h: 0.1 } }]
};
const brokenPlan = card.buildCard({ shot: brokenShot, revealed: ['A1', 'B1'] });
suite.ok('有坐标坏掉时卡片还是要出得来', !!brokenPlan);
suite.eq('坐标坏掉的那个不画框', brokenPlan.items.filter(function (it) { return it.type === 'rect' && it.stroke; }).length, 1);

// --- 内容多了卡片要跟着变高 ---

const onePlan = card.buildCard({ shot: SHOT1, revealed: ['A1'] });
suite.ok('只标一处时卡片更矮', onePlan.height < plan.height);
suite.eq('只标一处时编号只有 2 个', onePlan.items.filter(function (it) {
  return it.type === 'text' && it.align === 'center' && /^[0-9]+$/.test(it.text);
}).length, 2);
suite.eq('只标一处时结论换成那个维度的收尾话',
  onePlan.conclusion, hooks.getHookDimension('A').closing);

// --- 三段示例都能出卡片 ---

let failed = [];
SHOTS.forEach(function (shot) {
  const ids = shot.hooks.map(function (h) { return h.id; });
  const p = card.buildCard({ shot: shot, revealed: ids });
  if (!p) { failed.push(shot.id + ' 出不了卡片'); return; }
  const oob = outOfBounds(p);
  if (oob.length) failed.push(shot.id + ' 有图元出界');
  const tp = textProblems(p);
  if (tp.length) failed.push(shot.id + '：' + tp[0]);
  if (!p.conclusion) failed.push(shot.id + ' 没有结论');
});
suite.eq('三段示例全标出来都能出卡片，且都不出界不压字', failed, []);

// --- 别把排版搞崩 ---

suite.noThrow('脏数据不崩', function () {
  card.buildCard({});
  card.buildCard({ shot: SHOT1, revealed: 'not-an-array', imageRatio: null });
  card.wrapText(null, 27, 400);
  card.wrapText('看', 0, 10);
  card.measure(null, 30);
  card.imageBox(undefined);
  card.conclusionFor('not-an-array');
  card.pickHooks(undefined, undefined);
});

suite.done();
