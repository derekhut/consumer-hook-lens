/**
 * 云函数那一侧的梯子：抠 JSON、四层防御、以及它和客户端之间的契约。
 *
 * 这里测的都是「没有界面」的东西 —— 按项目纪律，这类东西「我点了一遍没问题」不算验证。
 * 而且它们的失败方式特别难查：云函数说成功、客户端说解析不出来，界面上只表现为
 * 「这张图没什么问题」，看起来像模型的判断，其实是接缝漏了。
 *
 * 所以除了逐层走一遍梯子，还有一整组**契约断言**：两边认的字段名、两边对
 * 「有没有一条能用的」的判断，都必须一致。
 */

const { createSuite } = require('./harness');
const defense = require('../cloudfunctions/detect/lib/defense');
const { extractJson } = require('../cloudfunctions/detect/lib/extract-json');
const detectParse = require('../utils/detect-parse');

const suite = createSuite('check-detect-defense.js');

const GOOD = {
  patternId: 'A1',
  evidence: '仅剩 2 件',
  rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
  confidence: 0.9
};
const UNKNOWN = { patternId: 'Z9', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, confidence: 0.9 };

function textOf(obj) {
  return JSON.stringify(obj);
}

// ---------- 抠 JSON ----------

suite.eq('整段就是 JSON，直接用', extractJson('{"annotations":[]}').ok, true);
suite.eq('数组也认', extractJson('[1,2]').ok, true);
suite.eq(
  '```json 围栏里的能抠出来',
  extractJson('```json\n{"annotations":[]}\n```').ok,
  true
);
suite.eq(
  '围栏不带语言标记也能抠',
  extractJson('```\n{"annotations":[]}\n```').ok,
  true
);
suite.eq(
  '大写 JSON 标记也认（模型不总是听话）',
  extractJson('```JSON\n{"annotations":[]}\n```').ok,
  true
);
suite.eq(
  '前面多一句解释也能抠出来',
  extractJson('好的，我找到了：\n{"annotations":[]}').ok,
  true
);
suite.eq('空字符串抠不出来', extractJson('').reason, 'empty');
suite.eq('全是空格抠不出来', extractJson('   ').reason, 'empty');
suite.eq('不是字符串抠不出来', extractJson(null).reason, 'not-text');
suite.eq('一段和 JSON 无关的话抠不出来', extractJson('我看了一下，没什么问题').reason, 'bad-json');
suite.eq('合法 JSON 但不是对象（比如一句话）不算', extractJson('"ok"').reason, 'json-not-object');
suite.eq(
  '解释里先出现花括号时会抠错 —— 明知有这条边界，也不去猜（猜错的代价是画错框）',
  extractJson('我看到 {奇怪} 的东西 {"annotations":[]}').ok,
  false
);
suite.noThrow('抠 JSON 不崩', function () {
  extractJson(undefined);
  extractJson(123);
  extractJson('{{{{');
});

// ---------- 四层防御 ----------

async function run(callModel, extra) {
  const logs = [];
  const options = {
    callModel: callModel,
    log: function (level, message, detail) {
      logs.push({ level: level, message: message, detail: detail });
    }
  };
  if (extra) Object.keys(extra).forEach(function (k) { options[k] = extra[k]; });
  const result = await defense.runDetect(options);
  return { result: result, logs: logs };
}

async function main() {
  // 第 1 层失败、第 2 层成功 —— 这是重试最常见的用法
  {
    const r = await run(function (attempt) {
      return attempt === 1 ? '这不是 JSON' : textOf({ annotations: [GOOD] });
    });
    suite.eq('第一次坏、第二次好：算成功', r.result.source, 'model');
    suite.eq('并且记录用了两次', r.result.attempts, 2);
    suite.eq('原始标注原样带回来（严格校验在客户端做）', r.result.annotations.length, 1);
    suite.ok('第一次的失败进了日志，没被吞掉', r.logs.some(function (l) { return l.level === 'error'; }));
  }

  // 一次就对，不该多问一次
  {
    let calls = 0;
    const r = await run(function () {
      calls += 1;
      return textOf({ annotations: [GOOD] });
    });
    suite.eq('一次就对时只问一次（重试不能白花几秒钟）', calls, 1);
    suite.eq('attempts 记 1', r.result.attempts, 1);
    suite.ok('没失败', r.result.failed === false);
  }

  // 两次都坏 —— 第 3 层：诚实失败
  {
    const r = await run(function () {
      return '模型今天不想说话';
    });
    suite.eq('两次都坏就是失败', r.result.failed, true);
    suite.eq('source 标成 fallback（界面据此说真话）', r.result.source, 'fallback');
    suite.eq('不伪造标注，给空数组', r.result.annotations.length, 0);
    suite.ok('原因记下来了', typeof r.result.reason === 'string' && r.result.reason.length > 0);
    suite.ok(
      '最后的失败原因进了日志',
      r.logs.some(function (l) { return l.level === 'error'; })
    );
  }

  // 模型直接抛异常（超时、鉴权失败）
  {
    const r = await run(function () {
      throw new Error('model timeout');
    });
    suite.eq('模型抛异常也不崩，走同一条失败路径', r.result.source, 'fallback');
    suite.eq('异常本身带在返回里（排查要用）', r.result.error && r.result.error.message, 'model timeout');
    suite.ok(
      '原始错误进了日志，一个字都没改',
      r.logs.some(function (l) { return l.detail && l.detail.message === 'model timeout'; })
    );
  }

  // 返回了数组，但一条都不在词典里 —— 不能算成功
  {
    let calls = 0;
    const r = await run(function () {
      calls += 1;
      return textOf({ annotations: [UNKNOWN] });
    });
    suite.eq('全是词典外的编码：要重试，不能当成功', calls, 2);
    suite.eq('重试后仍失败', r.result.failed, true);
    suite.eq('原因写明是「没有一条合法的」', r.result.reason, 'no-legal-annotation');
  }

  // 空数组是合法答案，不能重试、更不能算失败
  {
    let calls = 0;
    const r = await run(function () {
      calls += 1;
      return textOf({ annotations: [] });
    });
    suite.eq('「没看出问题」是合法结论，不重试', calls, 1);
    suite.eq('算成功', r.result.source, 'model');
    suite.ok('失败标记为假', r.result.failed === false);
    suite.eq('原因标明是「什么都没找到」', r.result.reason, 'nothing-found');
  }

  // 一条合法 + 两条词典外：成功，整份交给客户端去筛
  {
    const r = await run(function () {
      return textOf({ annotations: [GOOD, UNKNOWN, UNKNOWN] });
    });
    suite.eq('只要有一条合法就算成功', r.result.source, 'model');
    suite.eq('但不会替客户端筛（三条都带回去）', r.result.annotations.length, 3);
  }

  // 形状不对：对象里没有数组
  {
    const r = await run(function () {
      return textOf({ message: '这张图很干净' });
    });
    suite.eq('没有标注数组 = 失败', r.result.reason, 'no-annotation-list');
  }

  // 次数可配
  {
    let calls = 0;
    const r = await run(
      function () {
        calls += 1;
        return '还是不行';
      },
      { maxAttempts: 3 }
    );
    suite.eq('重试次数可配', calls, 3);
    suite.eq('返回里也记上三次', r.result.attempts, 3);
  }

  // 没给 callModel：不能崩，要明确失败
  {
    const r = await run(undefined);
    suite.eq('没给 callModel 时明确失败', r.result.reason, 'no-call-model');
    suite.eq('同样返回空数组而不是 undefined', r.result.annotations.length, 0);
  }

  // 任何一条路径上，返回结构都必须是合法的
  {
    const cases = [
      function () { return textOf({ annotations: [GOOD] }); },
      function () { return 'bad'; },
      function () { throw new Error('x'); }
    ];
    let structOk = true;
    for (let i = 0; i < cases.length; i++) {
      const r = await run(cases[i]);
      if (!Array.isArray(r.result.annotations)) structOk = false;
      if (typeof r.result.source !== 'string') structOk = false;
      if (typeof r.result.failed !== 'boolean') structOk = false;
    }
    suite.ok('每一条路径的返回结构都合法（界面永远有状态可显示）', structOk);
  }

  // ---------- 契约：云函数与客户端之间 ----------

  suite.eq(
    '契约：两边认的数组字段名完全一致',
    defense.LIST_KEYS,
    detectParse.LIST_KEYS
  );
  suite.eq(
    '契约：两边定义的 source 取值一致',
    defense.SOURCE,
    detectParse.SOURCE
  );

  const samples = [
    { name: '一条合法', list: [GOOD] },
    { name: '一条合法 + 一条词典外', list: [GOOD, UNKNOWN] },
    { name: '全是词典外的编码', list: [UNKNOWN] },
    { name: '空数组', list: [] }
  ];
  samples.forEach(function (s) {
    const cloudSays = defense.countLegal(s.list) > 0;
    const clientSays = detectParse.parseAnnotations(s.list).annotations.length > 0;
    suite.eq(
      '契约：' + s.name + ' 时，两边对「有没有能用的」判断一致',
      cloudSays,
      clientSays
    );
  });

  // 上面那条契约有一个**已知的边界**：置信度只在客户端生效。
  // 记在这里，免得以后有人以为是漏了。
  {
    const lowConfidence = { patternId: 'A1', rect: GOOD.rect, confidence: 0.1 };
    suite.ok(
      '已知边界：只报低置信度的结果时，云函数算成功、客户端筛成空 —— 这一屏要说「没把握」而不是「没问题」',
      defense.countLegal([lowConfidence]) > 0 &&
        detectParse.parseAnnotations([lowConfidence]).annotations.length === 0
    );
  }

  // 云函数的两种返回，客户端都要能消化
  {
    const fromModel = await run(function () { return textOf({ annotations: [GOOD] }); });
    const parsed = detectParse.parseAnnotations(fromModel.result.annotations);
    suite.ok('契约：客户端能吃下 model 分支的返回', parsed.shapeOk === true);
    suite.eq('并且真的解析出一条', parsed.annotations.length, 1);

    const fromFallback = await run(function () { return 'bad'; });
    const parsedFb = detectParse.parseAnnotations(fromFallback.result.annotations);
    suite.ok('契约：客户端能吃下 fallback 分支的返回', parsedFb.shapeOk === true);
    suite.eq('并且是空结果（界面走「没读出来」那一屏）', parsedFb.annotations.length, 0);
    suite.ok(
      '兜底时客户端会说那句实话',
      detectParse.sourceNotice(fromFallback.result.source) !== null
    );
    suite.eq(
      'model 分支不需要交代什么',
      detectParse.sourceNotice(fromModel.result.source),
      null
    );
  }

  suite.done();
}

main().catch(function (err) {
  console.error('check-detect-defense.js 自己崩了：', err);
  process.exit(1);
});
