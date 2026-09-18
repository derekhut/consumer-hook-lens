const { createSuite } = require('./harness');
const hooks = require('../utils/hooks');

const suite = createSuite('check-hooks.js');
const D = hooks.HOOK_DIMENSIONS;
const P = hooks.HOOK_PATTERNS;

const MAX_NAME = 10;
const MAX_NOTE = 30;
const MAX_BLURB = 12;
const MAX_CLOSING = 20;

// --- 结构 ---

suite.eq('维度数量是 5', D.length, 5);
suite.eq('模式数量是 13', P.length, 13);

const dimIds = D.map(function (d) { return d.id; });
const patternIds = P.map(function (p) { return p.id; });

suite.ok('维度 id 不重复', new Set(dimIds).size === dimIds.length);
suite.ok('模式 id 不重复', new Set(patternIds).size === patternIds.length);

// --- 每个模式都必须挂在存在的维度上 ---

const orphan = P.filter(function (p) { return dimIds.indexOf(p.dimensionId) === -1; });
suite.eq('没有挂不上维度的模式', orphan.map(function (p) { return p.id; }), []);

const emptyDim = D.filter(function (d) { return hooks.patternsByDimension(d.id).length === 0; });
suite.eq('没有空维度', emptyDim.map(function (d) { return d.id; }), []);

// --- 命名规矩：卡片标题和一句话机制的长度 ---

const tooLongName = P.filter(function (p) { return !p.name || p.name.length > MAX_NAME; });
suite.eq('每个陷阱名都不为空且不超过 ' + MAX_NAME + ' 字', tooLongName.map(function (p) { return p.id; }), []);

const tooLongNote = P.filter(function (p) { return !p.note || p.note.length > MAX_NOTE; });
suite.eq('每句机制都不为空且不超过 ' + MAX_NOTE + ' 字', tooLongNote.map(function (p) { return p.id; }), []);

const names = P.map(function (p) { return p.name; });
suite.ok('陷阱名不重复', new Set(names).size === names.length);

// --- 维度上的几句话：卡片要用，所以也受同样的规矩管 ---

const tooLongBlurb = D.filter(function (d) { return !d.blurb || d.blurb.length > MAX_BLURB; });
suite.eq('每个维度都有不超过 ' + MAX_BLURB + ' 字的短说明', tooLongBlurb.map(function (d) { return d.id; }), []);

const tooLongClosing = D.filter(function (d) { return !d.closing || d.closing.length > MAX_CLOSING; });
suite.eq('每个维度都有不超过 ' + MAX_CLOSING + ' 字的收尾话', tooLongClosing.map(function (d) { return d.id; }), []);

const closings = D.map(function (d) { return d.closing; });
suite.ok('收尾话不重复（五个维度看起来得是五件事）', new Set(closings).size === closings.length);

suite.ok(
  '多维度收尾话不为空且不超过 40 字（实际 ' + hooks.MULTI_DIMENSION_CLOSING.length + ' 字）',
  !!hooks.MULTI_DIMENSION_CLOSING && hooks.MULTI_DIMENSION_CLOSING.length <= 40
);
suite.ok(
  '单维度收尾话和多维度收尾话不是同一句（否则「收成一件事」是假的）',
  closings.indexOf(hooks.MULTI_DIMENSION_CLOSING) === -1
);

// --- 文案规矩：只说机制，不说教 ---

const FORBIDDEN = ['不要', '别上当', '套路', '警惕', '你应该', '骗子', '黑心'];
const lecturing = P.filter(function (p) {
  return FORBIDDEN.some(function (w) { return p.note.indexOf(w) !== -1 || p.name.indexOf(w) !== -1; });
});
suite.eq('没有说教式文案', lecturing.map(function (p) { return p.id; }), []);

const lecturingDim = D.filter(function (d) {
  return FORBIDDEN.some(function (w) {
    return d.closing.indexOf(w) !== -1 || d.blurb.indexOf(w) !== -1;
  });
});
suite.eq('维度的收尾话和短说明也没有说教', lecturingDim.map(function (d) { return d.id; }), []);

// 收尾话一律以「它」开头 —— 主语是机制，不是用户。
// 这样读起来是在讲这套设计怎么起作用，不是在教人该怎么想。
const wrongSubject = D.filter(function (d) { return d.closing.indexOf('它') !== 0; });
suite.eq('收尾话的主语是机制本身（都以「它」开头）', wrongSubject.map(function (d) { return d.id; }), []);

// --- 查询函数 ---

suite.eq('getHookPattern 能取到 A1', hooks.getHookPattern('A1').name, '限时倒计时');
suite.eq('getHookPattern 取未知名返回 undefined', hooks.getHookPattern('Z9'), undefined);
suite.eq('getHookPattern 可以接受 undefined 不崩', hooks.getHookPattern(undefined), undefined);
suite.eq('getHookDimension 能取到 E', hooks.getHookDimension('E').name, '进出不对称');
suite.eq('getHookDimension 取未知名返回 undefined', hooks.getHookDimension('F'), undefined);
suite.eq('patternsByDimension 只返回该维度下的模式', hooks.patternsByDimension('A').length, 2);

// 唯一来源：getHookPattern 返回的就是词典里的同一个对象，不是复制品
suite.ok('getHookPattern 返回词典本体（改一处即全站生效）', hooks.getHookPattern('B1') === P.find(function (p) { return p.id === 'B1'; }));

suite.done();
