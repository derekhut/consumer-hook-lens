/**
 * 交给视觉模型的指令 —— 手写，但**不含任何词典内容**。
 *
 * 规矩：这个文件不允许出现任何一个陷阱名或机制句。
 * 模式清单、名字、机制句一律从 ./hook-dict 读（那一份是生成的），
 * 这样「改了词典忘了改 prompt」在结构上就不可能发生 ——
 * `tests/check-detect-sync.js` 里有一条断言专门扫这个文件有没有手抄。
 *
 * 为什么坚持这么做：词典在本项目里已经漂过（PRD 那张表写完一天内漂了三处）。
 * prompt 是第二个最容易漂的地方，而且它漂了**不会有任何人发现** ——
 * 模型照样会返回结果，只是按旧名字返回。
 */

const { DIMENSIONS, PATTERNS } = require('./hook-dict');

/**
 * 词典区：逐条列出「id 名字（维度）：机制句」。
 * 从这里往下的每一个字都来自词典，没有一处是手抄的。
 */
function dictionaryText() {
  const dimName = {};
  DIMENSIONS.forEach(function (d) { dimName[d.id] = d.name; });

  return PATTERNS.map(function (p) {
    const dim = dimName[p.dimensionId] || p.dimensionId;
    return p.id + ' ' + p.name + '（' + dim + '）：' + p.note;
  }).join('\n');
}

function buildDetectPrompt() {
  return [
    '你是消费界面分析助手。给你一张购物相关的手机截图，',
    '找出其中「诱导人多花钱的设计」，并给出它在图上的位置。',
    '',
    '三条规矩：',
    '1. 只判断**设计机制**，不判断事实真伪 —— 不要评价商家，不要说欺骗、套路、警惕这类话。',
    '   你要回答的是「它怎么起作用」，不是「它多坏」。',
    '2. 只允许从下面这份词典里选，用 id 作答。词典里没有的，不要自造分类。',
    '3. 只报你有把握的。宁可少报两三处，也不要凑数 —— 报错一处的伤害比少报一处大得多。',
    '',
    '词典：',
    dictionaryText(),
    '',
    '一处都没看出来时，返回 {"annotations": []}。这是允许的答案，不要为了有结果而硬报。',
    '',
    '只输出 JSON，不要任何解释文字，格式如下：',
    '{"annotations":[{"patternId":"A1","evidence":"图上那句原话","rect":{"x":0.1,"y":0.2,"w":0.5,"h":0.1},"confidence":0.9}]}',
    '',
    '- rect 是相对整张图的 0–1 比例（左上角为原点），不是像素。它必须贴着那个元素，',
    '  宽高要能把这个元素框全 —— 框歪了比不框更糟。',
    '- evidence 是你在图上看到的那句原话，最多 12 个字；没有就省略这个字段。',
    '- confidence 是 0 到 1 的把握程度，没把握就别报这一处。'
  ].join('\n');
}

module.exports = {
  DETECT_PROMPT: buildDetectPrompt(),
  buildDetectPrompt: buildDetectPrompt,
  dictionaryText: dictionaryText
};
