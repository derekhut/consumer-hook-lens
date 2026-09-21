/**
 * 四层防御的编排 —— 纯逻辑，模型调用与日志都由外部注入。
 *
 * 注入是为了**能验证**：整条梯子可以在 Node 里逐层走一遍（第一层失败、第二层成功、
 * 两层都失败、模型直接抛异常），不必真的联网，也不必真的等模型挂掉。
 * 云函数里那几十行做不到这件事 —— 那是「没界面的东西」，按项目纪律必须写脚本。
 *
 * 梯子：
 *   第 1 层 严格校验   形状不对就当失败。严格（白名单、坐标、置信度）在客户端做，
 *                      这里只做「有没有一条能用的」这个粗判，避免一次彻底白跑。
 *   第 2 层 自动重试   再问一次模型。很多失败是瞬时的（超时、偶发乱码）。
 *   第 3 层 诚实失败   **不再伪造标注**（见下方长注释）。
 *   第 4 层 外层捕获   任何没预料到的异常，也返回结构合法的结果，界面永远有明确状态。
 *
 * ── 为什么第 3 层不是「返回一份内置的示例数据」 ──
 *
 * PRD 初稿写的是「返回一份内置的示例数据（提前准备好、格式完全合法的）」。
 * 那是网页版的做法，用到这一屏会出事：**示例数据的坐标是给示例那张图的**，
 * 套到用户自己的截图上，框会落在完全无关的地方。
 *
 * 那不是兜底，那是假装成功 —— 比直接失败更糟。用户会以为模型看错了图，
 * 而不是以为「这次没读出来」。而「没读出来」还能重试，看错了图只会让人不信任整个产品。
 *
 * 所以这一屏真正的兜底是**缓存**（这张图之前成功过，坐标是真的），由调用方先查；
 * 缓存不命中，就诚实地说没读出来，把「重试 / 换一张」两条路交给界面。
 * 这一条已经回写进 PRD 与 TODO。
 */

const { extractJson } = require('./extract-json');
const { PATTERNS } = require('./hook-dict');

/**
 * 模型可能把数组放在这几个字段里。**必须和客户端 utils/detect-parse.js 的那一份一致** ——
 * 两边认的字段名不一样，就会出现「云函数说成功、客户端说解析不出来」这种最难查的错。
 * `tests/check-detect-defense.js` 里有一条断言专门比对这两个列表。
 */
const LIST_KEYS = ['annotations', 'hooks', 'items', 'results'];

const SOURCE = {
  MODEL: 'model',
  CACHE: 'cache',
  FALLBACK: 'fallback'
};

/** 默认问两次：第一次 + 重试一次 */
const DEFAULT_MAX_ATTEMPTS = 2;

/** 从模型返回的对象里取那个数组。取不到返回 null（不是空数组 —— 两者含义不同） */
function pickList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  for (let i = 0; i < LIST_KEYS.length; i++) {
    if (Array.isArray(value[LIST_KEYS[i]])) return value[LIST_KEYS[i]];
  }
  return null;
}

/**
 * 数一数有几条用的是词典里真实存在的模式。
 *
 * 这一条是必要的：模型完全可能返回 3 条**一个都不在词典里**的结果。形状上是合法的数组，
 * 客户端严格校验后会一条不剩地丢掉 —— 那时候界面会说「没看出问题」，
 * 而事实是「它答的东西我们一个都不认」。这两件事必须分开，所以这里要粗判一次，
 * 好让第 2 层有机会重试。
 */
function countLegal(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const id = item.patternId || item.id;
    if (typeof id !== 'string') continue;
    for (let j = 0; j < PATTERNS.length; j++) {
      if (PATTERNS[j].id === id) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

function failResult(attempts, reason, error) {
  return {
    source: SOURCE.FALLBACK,
    // 空数组，不是伪造的标注。界面据此走「没读出来」那一屏
    annotations: [],
    attempts: attempts,
    failed: true,
    reason: reason,
    error: error || null
  };
}

/**
 * 跑完整条梯子。
 *
 * @param {object} options
 * @param {function} options.callModel  (attempt) => Promise<string> 返回模型的原始文本
 * @param {function} [options.log]      (level, message, detail) => void，默认打到 console
 * @param {number}   [options.maxAttempts]
 */
async function runDetect(options) {
  const opts = options || {};
  const callModel = opts.callModel;
  const maxAttempts =
    typeof opts.maxAttempts === 'number' && opts.maxAttempts > 0
      ? opts.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;
  // 日志默认走 console：错误不许吞掉，这一条是底线，所以没有「静默」这个选项
  const log =
    typeof opts.log === 'function'
      ? opts.log
      : function (level, message, detail) {
          if (level === 'error') console.error('[detect] ' + message, detail || '');
          else console.log('[detect] ' + message);
        };

  if (typeof callModel !== 'function') {
    log('error', '没有拿到 callModel，这次调用不可能成功');
    return failResult(0, 'no-call-model', null);
  }

  let lastReason = 'unknown';
  let lastError = null;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let text;
      try {
        text = await callModel(attempt);
      } catch (err) {
        // 原始错误整体进日志，界面只看 source。不在这里吞掉
        lastError = err;
        lastReason = 'model-call-failed';
        log('error', '第 ' + attempt + ' 次调用模型失败：' + (err && err.message), err);
        continue;
      }

      const parsed = extractJson(text);
      if (!parsed.ok) {
        lastError = null;
        lastReason = 'unparseable:' + parsed.reason;
        log(
          'error',
          '第 ' + attempt + ' 次返回的内容里没有 JSON（' + parsed.reason + '）',
          typeof text === 'string' ? text.slice(0, 200) : text
        );
        continue;
      }

      const list = pickList(parsed.value);
      if (!list) {
        lastError = null;
        lastReason = 'no-annotation-list';
        log('error', '第 ' + attempt + ' 次返回的 JSON 里没有标注数组', parsed.value);
        continue;
      }

      const legal = countLegal(list);
      if (list.length > 0 && legal === 0) {
        // 它答了，但答的都不是我们认的东西。当成失败，给重试一次的机会
        lastError = null;
        lastReason = 'no-legal-annotation';
        log(
          'warn',
          '第 ' + attempt + ' 次返回了 ' + list.length + ' 条，但一条都不在词典里',
          list
        );
        continue;
      }

      // 成功。注意 list 可能是空数组 —— 那是「这张图没看出问题」，是一个合法结论，
      // 不能重试，也不能当成失败
      return {
        source: SOURCE.MODEL,
        annotations: list,
        attempts: attempt,
        failed: false,
        reason: list.length === 0 ? 'nothing-found' : null,
        error: null
      };
    }

    log('error', '两次都没成功，最后一次的原因：' + lastReason, lastError);
    return failResult(maxAttempts, lastReason, lastError);
  } catch (err) {
    // 第 4 层：连上面的循环本身都炸了（注入的 log 抛异常之类的）
    lastError = err;
    return failResult(0, 'unexpected:' + (err && err.message), err);
  }
}

module.exports = {
  LIST_KEYS: LIST_KEYS,
  SOURCE: SOURCE,
  DEFAULT_MAX_ATTEMPTS: DEFAULT_MAX_ATTEMPTS,
  pickList: pickList,
  countLegal: countLegal,
  runDetect: runDetect
};
