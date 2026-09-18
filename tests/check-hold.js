const { createSuite } = require('./harness');
const hold = require('../utils/hold');

const suite = createSuite('check-hold.js');

const HOOKS = [
  { id: 'A1', rect: { x: 0, y: 0.5, w: 1, h: 0.08 } },
  { id: 'B1', rect: { x: 0.24, y: 0.75, w: 0.1, h: 0.03 } }
];

// --- 一处都没标出来时，按住没意义 ---

suite.eq('什么都没标出来，按不动', hold.canHold([]), false);
suite.eq('标出一处就按得动', hold.canHold(['A1']), true);
suite.eq('脏数据当作按不动', hold.canHold(null), false);

// --- 只盖已经标出来的那些 ---

suite.eq('只盖标出来的那一处', hold.coveredIds(HOOKS, ['A1']), ['A1']);
suite.eq('标出两处就盖两处', hold.coveredIds(HOOKS, ['A1', 'B1']), ['A1', 'B1']);
suite.eq('没标出来的一处不会被盖（盖了就是剧透答案）', hold.coveredIds(HOOKS, ['B1']), ['B1']);
suite.eq('空集合什么都不盖', hold.coveredIds(HOOKS, []), []);
suite.eq('跟着示例顺序，不跟着已标出的顺序', hold.coveredIds(HOOKS, ['B1', 'A1']), ['A1', 'B1']);

// --- 那句点破差异的话 ---

suite.eq('标出一处时点名', hold.holdCaption(HOOKS, ['A1']), '刚才先跳出来的是「限时倒计时」');
suite.eq('标出两处时用「和」连接', hold.holdCaption(HOOKS, ['A1', 'B1']), '刚才先跳出来的是「限时倒计时」和「划线价锚定」');
suite.eq('没标出时不出这句话', hold.holdCaption(HOOKS, []), '');

const THREE = [
  { id: 'A1' },
  { id: 'B1' },
  { id: 'C3' }
];
suite.eq('三处时用顿号加「和」', hold.holdCaption(THREE, ['A1', 'B1', 'C3']), '刚才先跳出来的是「限时倒计时」、「划线价锚定」和「凑单加购推荐」');

suite.eq('词典里没有的 id 会被跳过，不会出现空引号', hold.holdCaption([{ id: 'ZZ' }], ['ZZ']), '');

// --- 这句话必须短到能放进图里的一条横幅 ---

suite.ok(
  '两处的点破文案不超过 40 字（实际 ' + hold.holdCaption(HOOKS, ['A1', 'B1']).length + ' 字）',
  hold.holdCaption(HOOKS, ['A1', 'B1']).length <= 40
);

// --- 按钮文案 ---

suite.eq('没按住时是「按住，只看商品」', hold.holdLabel(false), '按住，只看商品');
suite.eq('按住时变成「松开，恢复」', hold.holdLabel(true), '松开，恢复');

// --- 两个说话的地方：按钮下面那行小字、图上那条横幅 ---
// 小字负责邀请动作，横幅负责点破差异。两条通道不能互相串。

const CAPTION = hold.holdCaption(HOOKS, ['A1', 'B1']);

suite.eq('一处都没标出时，小字说的是「先标出一处」', hold.holdHintText(false, false), hold.HOLD_LOCKED_TEXT);
suite.eq('标出了没按住时，小字在邀请动作', hold.holdHintText(true, false), hold.HOLD_IDLE_TEXT);
suite.eq('按住时小字让位给横幅', hold.holdHintText(true, true), '');

suite.eq('不按住时横幅不出现', hold.holdBannerText(true, false, CAPTION), '');
suite.eq('一处都没标出时横幅也不出现', hold.holdBannerText(false, false, CAPTION), '');
suite.eq('按住时横幅才是那句点破差异的话', hold.holdBannerText(true, true, CAPTION), CAPTION);
suite.eq('按住但点破为空（词典里没这个 id）时兜底', hold.holdBannerText(true, true, ''), hold.HOLD_FALLBACK_TEXT);

suite.ok(
  '邀请动作的小字和点破差异的横幅不是同一句（混了就等于没点破）',
  hold.HOLD_IDLE_TEXT !== CAPTION && hold.HOLD_LOCKED_TEXT !== CAPTION
);
suite.ok(
  '横幅里一定带着陷阱名（实际「' + CAPTION + '」）',
  CAPTION.indexOf(hold.holdCaption(HOOKS, ['A1'])) !== -1
);

// --- 别把界面搞崩 ---

suite.noThrow('脏数据不崩', function () {
  hold.coveredIds(null, null);
  hold.holdCaption(null, 'not-an-array');
  hold.coveredIds(HOOKS, 'not-an-array');
  hold.holdHintText(undefined, undefined);
  hold.holdBannerText(undefined, undefined, undefined);
});

suite.done();
