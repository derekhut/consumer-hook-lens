/**
 * 从模型返回的文本里抠出 JSON —— 纯逻辑。
 *
 * 存在的理由很实际：模型很少只吐一段干净的 JSON。它会写「好的，我找到了：」
 * 或者把 JSON 包在 ```json 围栏里。不抠的话，一份**完全可用**的结果会因为
 * 多了三个反引号而被判成失败，然后去重试 —— 白花一次几秒钟的调用。
 *
 * 抠不出来就明确说抠不出来（返回 reason），不要返回一个"差不多的"东西：
 * 这里放过去的每一个字节，最后都会变成界面上的一个框。
 */

function tryParse(text) {
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object') {
      // 合法 JSON 但不是我们要的形状（比如 "ok"、123）
      return { ok: false, reason: 'json-not-object' };
    }
    return { ok: true, value: value };
  } catch (err) {
    return { ok: false, reason: 'bad-json' };
  }
}

/**
 * 依次尝试三种写法，从上到下越来越宽松：
 *   1. 整段就是 JSON（最省事，也是我们 prompt 里要求的）
 *   2. ```json ... ``` 围栏里
 *   3. 第一对花括号之间（最后手段）
 *
 * 第 3 种故意放在最后：模型如果先解释了一段带花括号的话，会抠错地方。
 * 它是兜底的兜底，不该在正常情况下被用到。
 */
function extractJson(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-text' };

  const t = text.trim();
  if (!t) return { ok: false, reason: 'empty' };

  const direct = tryParse(t);
  if (direct.ok) return direct;

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inFence = tryParse(fence[1].trim());
    if (inFence.ok) return inFence;
  }

  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const sliced = tryParse(t.slice(first, last + 1));
    if (sliced.ok) return sliced;
  }

  return { ok: false, reason: direct.reason };
}

module.exports = { extractJson: extractJson };
