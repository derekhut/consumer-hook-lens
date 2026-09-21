/**
 * 模型返回什么都不由我们决定，所以「它回来的东西」必须逐条喂一遍。
 *
 * 判据只有一条：**要么给出一份合法的标注，要么给出一个明确的结论** ——
 * 不许出现「结构不合法但界面照画」这种结果，那会让错位和空框跑到评委眼前。
 */

const { createSuite } = require('./harness');
const detect = require('../utils/detect-parse');

const suite = createSuite('check-detect-parse.js');

/** 一个能通过校验的原始项，后面按需要改字段 */
function raw(over) {
  const base = {
    patternId: 'A1',
    evidence: '仅剩 2 件',
    rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
    confidence: 0.9
  };
  const out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  Object.keys(over || {}).forEach(function (k) { out[k] = over[k]; });
  return out;
}

// --- 正常路径 ---

const okResult = detect.parseAnnotations([
  raw(),
  raw({ patternId: 'B1', confidence: 0.7, evidence: '¥299' })
]);
suite.ok('合法结果能被接受', okResult.shapeOk === true);
suite.eq('两条都留下了', okResult.annotations.length, 2);
suite.eq('按把握从高到低排', okResult.annotations.map(function (a) { return a.id; }), ['A1', 'B1']);
suite.eq('一条什么都不缺', okResult.annotations[0], {
  id: 'A1',
  rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
  evidence: '仅剩 2 件',
  confidence: 0.9
});

suite.eq(
  '输出和示例数据的 hooks 同构（journey 靠这两个字段吃饭）',
  Object.keys(okResult.annotations[0]).sort(),
  ['confidence', 'evidence', 'id', 'rect']
);

// --- 字段名的容错 ---

const alias = detect.parseAnnotations([raw({ patternId: undefined, id: 'A1', evidence: null })]);
suite.eq('patternId 缺失时认 id 字段', alias.annotations.map(function (a) { return a.id; }), ['A1']);
suite.eq('evidence 缺失时给 null，不编一个出来', alias.annotations[0].evidence, null);
suite.eq('整条包在 annotations 里也认', detect.parseAnnotations({ annotations: [raw()] }).annotations.length, 1);
suite.eq('整条包在 hooks 里也认', detect.parseAnnotations({ hooks: [raw()] }).annotations.length, 1);

// --- 坐标 ---

const clipped = detect.parseAnnotations([raw({ rect: { x: 0.9, y: '0.5', w: 0.5, h: 0.3 } })]);
suite.ok('越界的框被裁回图内', clipped.annotations.length === 1);
suite.ok('裁完宽度正好到右边界', clipped.annotations[0].rect.x + clipped.annotations[0].rect.w === 1);
suite.eq('数字字符串的坐标照样收（模型爱这么写）', clipped.annotations[0].rect.y, 0.5);

suite.eq(
  '框太小的一律丢掉（不是画歪，是不画）',
  detect.parseAnnotations([raw({ rect: { x: 0.1, y: 0.1, w: 0.01, h: 0.01 } })]).annotations.length,
  0
);
suite.eq(
  '缺 rect 的丢掉',
  detect.parseAnnotations([raw({ rect: undefined })]).annotations.length,
  0
);

// --- 白名单 ---

const ghost = detect.parseAnnotations([raw({ patternId: 'Z9' })]);
suite.eq('词典里没有的编码一律不收', ghost.annotations.length, 0);
suite.ok('并且记下了原因（排查用）', ghost.dropped.join(',').indexOf('unknown-pattern:Z9') !== -1);
suite.eq('没给 id 的丢掉', detect.parseAnnotations([raw({ patternId: undefined, id: undefined })]).annotations.length, 0);

// --- 置信度 ---

suite.eq(
  '把握太低的不报',
  detect.parseAnnotations([raw({ confidence: 0.2 })]).annotations.length,
  0
);
suite.eq(
  '刚好等于阈值要留下（阈值只管「低于」）',
  detect.parseAnnotations([raw({ confidence: detect.MIN_CONFIDENCE })]).annotations.length,
  1
);
suite.eq(
  '模型没说把握时不替它决定 —— 照样留下',
  detect.parseAnnotations([raw({ confidence: undefined })]).annotations.length,
  1
);
suite.eq(
  '没说的那处 confidence 记成 null，不伪造成 0.9',
  detect.parseAnnotations([raw({ confidence: undefined })]).annotations[0].confidence,
  null
);
suite.eq(
  '按 0–100 给的分数不猜着除以 100（猜错的方向正是这里的反方向）',
  detect.parseAnnotations([raw({ confidence: 85 })]).annotations[0].confidence,
  1
);
suite.eq(
  '不是数字的置信度当没说',
  detect.parseAnnotations([raw({ confidence: '很高' })]).annotations.length,
  1
);

// --- 去重与上限 ---

const dup = detect.parseAnnotations([
  raw({ confidence: 0.5, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
  raw({ confidence: 0.95, rect: { x: 0.6, y: 0.6, w: 0.2, h: 0.2 } })
]);
suite.eq('同一模式只留一处（两条同 id 会让「点一下揭示一处」失效）', dup.annotations.length, 1);
suite.eq('留下的那个是把握更高的', dup.annotations[0].rect.x, 0.6);

const many = detect.parseAnnotations([
  raw({ patternId: 'A1', confidence: 0.9 }),
  raw({ patternId: 'A2', confidence: 0.8 }),
  raw({ patternId: 'B1', confidence: 0.7 }),
  raw({ patternId: 'B2', confidence: 0.6 }),
  raw({ patternId: 'B3', confidence: 0.5 })
]);
suite.eq('超过上限的截掉', many.annotations.length, detect.MAX_ANNOTATIONS);
suite.eq('截的是把握最低的那些', many.annotations.map(function (a) { return a.id; }), ['A1', 'A2', 'B1', 'B2']);

// --- 空结果与坏形状，是两件事 ---

const empty = detect.parseAnnotations([]);
suite.ok('空数组是一个合法回答（「这张图没看出问题」）', empty.shapeOk === true);
suite.eq('空就是空，不塞兜底数据进来', empty.annotations.length, 0);

suite.ok('{} 不算一份回答', detect.parseAnnotations({}).shapeOk === false);
suite.ok('null 不算一份回答', detect.parseAnnotations(null).shapeOk === false);
suite.ok('一句解释文字不算一份回答', detect.parseAnnotations('我看了一下，没什么问题').shapeOk === false);
suite.ok('坏形状也要给出空数组，不能是 undefined', Array.isArray(detect.parseAnnotations(null).annotations));

// --- 原话 ---

suite.eq(
  '原话两头的空格去掉',
  detect.parseAnnotations([raw({ evidence: '  仅剩 2 件  ' })]).annotations[0].evidence,
  '仅剩 2 件'
);
suite.eq(
  '原话太长就截断（它是拿来对号入座的，不是引用全文）',
  detect.parseAnnotations([raw({ evidence: '这是一句特别特别长的图上原话一共好几十个字' })]).annotations[0].evidence.length,
  detect.MAX_EVIDENCE
);
suite.eq(
  '空字符串的原话当没有',
  detect.parseAnnotations([raw({ evidence: '   ' })]).annotations[0].evidence,
  null
);

// --- 兜底时说的那句话 ---

suite.eq('正常从模型来，不用交代什么', detect.sourceNotice(detect.SOURCE.MODEL), null);
suite.eq('命中缓存也不用交代（那本来就是正常结果）', detect.sourceNotice(detect.SOURCE.CACHE), null);
suite.ok('走了兜底必须说话', typeof detect.sourceNotice(detect.SOURCE.FALLBACK) === 'string');
suite.ok('兜底那句话里不许出现技术词', detect.sourceNotice(detect.SOURCE.FALLBACK).indexOf('errCode') === -1);

// --- 脏数据不许崩 ---

suite.noThrow('一坨乱七八糟的东西不崩', function () {
  detect.parseAnnotations([null, 3, 'x', [], { patternId: {} }, { rect: 'no' }]);
});
suite.noThrow('undefined 不崩', function () {
  detect.parseAnnotations(undefined);
});
suite.noThrow('自己就是数组的数组不崩', function () {
  detect.parseAnnotations([[raw()]]);
});

suite.done();
