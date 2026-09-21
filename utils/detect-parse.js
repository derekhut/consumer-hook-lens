/**
 * 把模型返回的原始结果，变成界面直接能用的标注数组 —— 纯逻辑。
 *
 * 不联网、不碰界面，所以能逐条喂脏数据在 Node 里验。
 * 这是阶段 7 里唯一「没有界面、又最容易悄悄坏掉」的部分：
 * 模型返回什么形状，谁也保证不了 —— 但这个项目只允许一种结果，
 * 就是**结构合法、且要么出标注、要么明说没看出问题**。
 *
 * 输出刻意和 `data/shots.js` 里的 hooks 同构：{ id, rect, evidence, confidence }。
 * 同构才能让 journey 页整段复用标注、逐个揭示、按住只看商品、卡片生成 ——
 * 不必为「我自己的图」再写一套界面。
 */

const { getHookPattern } = require('./hooks');
const { normalizeRect } = require('./annotations');

/**
 * 宁少不错：低于这个把握的一律不报。
 *
 * 演示时「图上有 2 处框得很准」，比「6 处里混着两处框错」可信得多 ——
 * 准确率是感知出来的，不是算出来的。
 */
const MIN_CONFIDENCE = 0.45;

/** 一张图上最多展示几处。再多，注意力会被摊平，底部卡片也排不下 */
const MAX_ANNOTATIONS = 4;

/** 图上原话留几个字。它是用来「对上号」的，不是用来引用全文的 */
const MAX_EVIDENCE = 12;

/**
 * 结果从哪来。界面靠它决定要不要说那句真话 ——
 * 兜底可以让演示继续，但**不能让界面以为自己成功了**。
 */
const SOURCE = {
  MODEL: 'model',
  CACHE: 'cache',
  FALLBACK: 'fallback'
};

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 模型有时把数组包在 annotations / hooks / items 里，有时直接给数组。
 * 这不是「兼容各种写法」，是因为模型的输出形状本身就不稳定 ——
 * 只认一种写法，等于把一次可用结果扔成失败。
 */
const LIST_KEYS = ['annotations', 'hooks', 'items', 'results'];

function pickRawList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!isPlainObject(raw)) return null;
  for (let i = 0; i < LIST_KEYS.length; i++) {
    if (Array.isArray(raw[LIST_KEYS[i]])) return raw[LIST_KEYS[i]];
  }
  return null;
}

function normalizeEvidence(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > MAX_EVIDENCE ? s.slice(0, MAX_EVIDENCE) : s;
}

/**
 * 置信度只负责一件事：**模型自己说没把握的，丢掉**。
 *
 * 模型没给这个字段时**不丢** —— 拿不到信息就替它做决定，会把一整份能用的结果
 * 变成空。那时候该被丢掉的是「对模型的期待」，不是这几处标注。
 * 返回值 null 表示「模型没说」，不是「说了 0」。
 */
function normalizeConfidence(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  // 有的模型按 0–100 给。>1 的一律压到 1，不做除以 100 的猜测 ——
  // 猜错的方向是「把没把握的当成有把握」，那正是这个阈值要拦的事。
  if (n > 1) return 1;
  if (n < 0) return 0;
  return n;
}

/**
 * 一条原始项 → 一条标注。不合格返回 { drop: 原因 }，
 * 原因会进日志（排查用），但不进界面。
 */
function normalizeOne(item) {
  if (!isPlainObject(item)) return { drop: 'not-an-object' };

  const id = item.patternId || item.id;
  if (!id || typeof id !== 'string') return { drop: 'no-id' };
  // 白名单：词典里没有的 id 一律当失败处理。宁可少一处，
  // 也不要界面上出现一个点开没有解释的空框。
  if (!getHookPattern(id)) return { drop: 'unknown-pattern:' + id };

  const rect = normalizeRect(item.rect);
  if (!rect) return { drop: 'bad-rect:' + id };

  const confidence = normalizeConfidence(item.confidence);
  if (confidence !== null && confidence < MIN_CONFIDENCE) {
    return { drop: 'low-confidence:' + id };
  }

  return {
    value: {
      id: id,
      rect: rect,
      evidence: normalizeEvidence(item.evidence),
      confidence: confidence
    }
  };
}

/**
 * 主入口。
 *
 * 返回 { annotations, dropped, shapeOk }：
 * - `annotations` 已按把握从高到低排序、已按模式去重、已截到上限
 * - `dropped` 只用于日志，界面不显示（用户不需要知道模型报了几条废的）
 * - `shapeOk` 说的**不是**「有没有结果」，而是「这份返回像不像一份回答」。
 *   空数组是合法回答（「这张图没看出问题」是一个真实结论）；乱码不是。
 *   云函数据此区分「没看出问题」和「这次没成功」，后者才去走重试与兜底。
 */
function parseAnnotations(raw, options) {
  const opts = options || {};
  const max = typeof opts.max === 'number' && opts.max > 0 ? opts.max : MAX_ANNOTATIONS;

  const list = pickRawList(raw);
  if (!list) {
    // 形状都不对，就不是「没问题」，是「没成功」。这两件事在界面上不一样
    return { annotations: [], dropped: ['broken-shape'], shapeOk: false };
  }

  const dropped = [];
  const byId = {};

  for (let i = 0; i < list.length; i++) {
    const one = normalizeOne(list[i]);
    if (one.drop) {
      dropped.push(one.drop);
      continue;
    }

    const item = one.value;
    const prev = byId[item.id];
    // 同一个模式报了两处，只留把握更大的那一处。
    // 不留两处不是洁癖：界面的「已揭示」是按模式 id 记的，两条同 id 的标注
    // 只能同进同出 —— 留着它们，「点一下揭示一处」直接失效。
    if (!prev || (item.confidence || 0) > (prev.confidence || 0)) {
      byId[item.id] = item;
    }
  }

  const kept = Object.keys(byId).map(function (k) { return byId[k]; });
  kept.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });

  if (kept.length > max) {
    dropped.push('over-limit:' + (kept.length - max));
  }

  return {
    annotations: kept.slice(0, max),
    dropped: dropped,
    shapeOk: true
  };
}

/**
 * 兜底时界面上必须说的那句话。
 *
 * `model` / `cache` 返回 null —— 正常路径没什么要交代的。
 * 这句话放在这里而不是页面里，是为了让「兜底不许假装」这条规矩
 * **能被脚本守住**，而不是只写在文档里。
 */
function sourceNotice(source) {
  if (source === SOURCE.FALLBACK) return '这张图没读出来，先看看示例';
  return null;
}

module.exports = {
  MIN_CONFIDENCE: MIN_CONFIDENCE,
  MAX_ANNOTATIONS: MAX_ANNOTATIONS,
  MAX_EVIDENCE: MAX_EVIDENCE,
  // 导出是为了让云函数侧那张同名清单能被断言比对 —— 两边认的字段名必须一样，
  // 否则会出现「云函数说成功、客户端说解析不出来」这种最难查的错。
  LIST_KEYS: LIST_KEYS,
  SOURCE: SOURCE,
  parseAnnotations: parseAnnotations,
  sourceNotice: sourceNotice
};
