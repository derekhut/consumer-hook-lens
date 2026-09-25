/**
 * 文档和代码不许各说各话。
 *
 * PRD 第 6 节那张词典表是 `utils/hooks.js` 的**镜像**。镜像这种东西，
 * 只要没有检查就一定会漂 —— 实测：那张表在本 PRD 写完之后一天内就漂了三处
 * （C 维度的名字、D1 的机制句、E2 的名字），而这三处没有任何人会发现，
 * 直到有人拿着 PRD 去对代码。
 *
 * 所以这里逐条比对：每个模式的 id + 名字、每句机制、每句收尾话，
 * 都必须在 PRD 里原样出现。改词典忘了改 PRD，就会有一条变红。
 *
 * 反过来不强求（PRD 里可以多写别的），因为文档本来就该比代码说得多。
 */

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./harness');
const hooks = require('../utils/hooks');

const suite = createSuite('check-docs.js');

const ROOT = path.join(__dirname, '..');

function readDoc(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

const prd = readDoc('PRD.md');
suite.ok('读到了 PRD.md（' + prd.length + ' 字）', prd.length > 0);

// --- 每个模式：id + 名字、机制句，都要在 PRD 里原样出现 ---

const missingName = [];
const missingNote = [];

hooks.HOOK_PATTERNS.forEach(function (p) {
  // 表里写成「A1 限时倒计时」，这样连 id 带名字一起核对
  if (prd.indexOf(p.id + ' ' + p.name) === -1) missingName.push(p.id + ' ' + p.name);
  if (prd.indexOf(p.note) === -1) missingNote.push(p.id + '：' + p.note);
});

suite.eq('PRD 里每个模式的「id + 名字」都能原样找到', missingName, []);
suite.eq('PRD 里每句机制都能原样找到（一个字都不能差）', missingNote, []);

// --- 每个维度：名字和收尾话 ---

const missingDim = [];
hooks.HOOK_DIMENSIONS.forEach(function (d) {
  if (prd.indexOf(d.name) === -1) missingDim.push(d.id + ' ' + d.name);
});
suite.eq('PRD 里每个维度的名字都能找到', missingDim, []);

const missingClosing = [];
hooks.HOOK_DIMENSIONS.forEach(function (d) {
  if (prd.indexOf(d.closing) === -1) missingClosing.push(d.id + '：' + d.closing);
});
suite.eq('PRD 里每句收尾话都能原样找到', missingClosing, []);

suite.ok(
  'PRD 里有多维度那句收尾话',
  prd.indexOf(hooks.MULTI_DIMENSION_CLOSING) !== -1
);

// --- 反过来的检查：PRD 里不许留着已经不存在的模式名 ---

// 只在词典表那一段里找，避免把历史章节里的旧说法也算进来
const tableStart = prd.indexOf('### 5 个一级维度');
const tableEnd = prd.indexOf('### 与旧词典');
suite.ok('找得到 PRD 里的词典表那一节', tableStart !== -1 && tableEnd > tableStart);

if (tableStart !== -1 && tableEnd > tableStart) {
  const table = prd.slice(tableStart, tableEnd);
  // 表里出现的所有「字母+数字」编码，都必须是词典里真实存在的
  const codes = [];
  const re = /\b([A-E][1-9])\b/g;
  let m;
  while ((m = re.exec(table)) !== null) {
    if (codes.indexOf(m[1]) === -1) codes.push(m[1]);
  }
  const ghost = codes.filter(function (c) { return !hooks.getHookPattern(c); });
  suite.eq('PRD 的词典表里没有已经不存在的模式编码（实际列了 ' + codes.length + ' 个）', ghost, []);

  const realIds = hooks.HOOK_PATTERNS.map(function (p) { return p.id; });
  const notListed = realIds.filter(function (id) { return codes.indexOf(id) === -1; });
  suite.eq('词典里的 13 个模式一个不漏地列在 PRD 表里', notListed, []);
}

// --- PRD 里提到的用例数字也要和示例数据对得上 ---

const { SHOTS } = require('../data/shots');
const wrongCount = [];
SHOTS.forEach(function (shot) {
  const ids = shot.hooks.map(function (h) { return h.id; });
  ids.forEach(function (id) {
    const p = hooks.getHookPattern(id);
    if (!p) wrongCount.push(shot.id + ' 用了词典里没有的 ' + id);
  });
});
suite.eq('示例数据里用到的模式都真实存在', wrongCount, []);

// --- TODO 和 README 提到的测试文件都得真的存在 ---

const docs = { 'TODO.md': readDoc('TODO.md'), 'README.md': readDoc('README.md') };
const ghostFile = [];

Object.keys(docs).forEach(function (name) {
  const text = docs[name];
  if (!text) return;
  const re = /`(tests\/[a-z-]+\.js)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rel = m[1];
    if (!fs.existsSync(path.join(ROOT, rel))) ghostFile.push(name + ' 提到的 ' + rel + ' 不存在');
  }
});
suite.eq('TODO/README 里提到的测试文件都真实存在（改名后别名忘改）', ghostFile, []);

// --- 文档里提到的 utils 文件也得真的存在 ---

const ghostUtil = [];
Object.keys(docs).forEach(function (name) {
  const text = docs[name];
  const re = /`(utils\/[a-z-]+\.js)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!fs.existsSync(path.join(ROOT, m[1]))) ghostUtil.push(name + ' 提到的 ' + m[1] + ' 不存在');
  }
});
suite.eq('TODO/README 里提到的 utils 文件都真实存在', ghostUtil, []);

// --- 会变的配置值不许写进文档 ---
// project.config.json 里的 appid 是会变的（游客占位 → 正式 AppID），
// 一旦文档复述了具体值，改配置的人不会想起去改文档。
// 实测就是这样：README 写着 touristappid 的时候，配置里已经不是它了。

const projectConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
suite.ok('project.config.json 里有 appid 字段', typeof projectConfig.appid === 'string');

// 注意：占位值本身不是「本项目的值」，它是开发者工具的公共常量，
// 谁都能写、永远不会变。文档**应该**定义它（不然读者不知道看到它意味着什么）。
// 只有配置里是一个真实 AppID 时，复述才算漂移 —— 因为那才是项目独有的、会变的值。
const appidIsPlaceholder = projectConfig.appid === 'touristappid';

const restated = [];
if (!appidIsPlaceholder) {
  Object.keys(docs).forEach(function (name) {
    if (docs[name].indexOf(projectConfig.appid) !== -1) restated.push(name);
  });
}
suite.eq(
  '文档里没有复述当前 appid（' + (appidIsPlaceholder ? '当前是占位值，跳过' : '它变了文档不会跟着变') + '）',
  restated,
  []
);

// 反过来也要挡住，但**不能**只要出现占位值就报错。
//
// 一开始这条守卫写的是「文档里出现 touristappid 就算漂移」，结果它把 README 判红了，
// 而 README 那两处都是对的：
//   一是「`touristappid` = 游客模式占位」—— 这是在**定义**开发者工具那个常量，
//      它不是本项目的配置，永远为真，不存在过期；
//   二是「值已经不是 `touristappid` 了」—— 这是个**否定句**，说的正是漂移这件事。
// 这两句删掉，文档只会变得更没用。
//
// 真正会过期的只有一种写法：**声称本项目的 appid 就是占位值**。
// 所以按行扫，并且把否定句放过 —— 否定不止「不是」一种说法，
// 变异测试里写「并非 …，而是」照样被判红了，所以 不/并非/绝非 一起放过。
const placeholderClaims = [];
Object.keys(docs).forEach(function (name) {
  docs[name].split('\n').forEach(function (line, i) {
    if (line.indexOf('touristappid') === -1) return;
    if (/不(再)?是|并非|绝非/.test(line)) return;   // 否定句，放过
    if (!/是|当前|现在|目前|用的/.test(line)) return; // 定义/指路，不算声称
    placeholderClaims.push(name + ' 第 ' + (i + 1) + ' 行：' + line.trim());
  });
});
suite.eq('文档里没有声称「本项目的 appid 就是占位值」', placeholderClaims, []);

// --- 会变的值（之二）：云开发环境 ID 同样不许复述 ---
//
// 环境 ID 和 appid 是同一性质的东西：它属于**本项目的配置**，只在 `app.js` 里写一遍。
// 文档里复述一份，换环境时没人想得起去改它 —— 而文档里多出来的那个值恰恰是
// 读者最信的那个（他没法跑起来验证，只能信文档）。
//
// 实测漂了一处：TODO 阶段 7 那句「环境 ID `cloud1-…` 已填进 app.js」。
// 这句话里真正有用的是「已填进 app.js」这个**指路**，具体值一个字都不必写。
//
// 具体值**从 app.js 里读出来**，不写死在测试里（抄一份等于又开了一个副本，守卫自己先漂）。
const ENV_DECL = /const\s+CLOUD_ENV\s*=\s*'([^']*)'/;

// 只扫「给人看的、会被人照着改配置」的那几份文档
const driftDocs = ['TODO.md', 'README.md', 'WORKFLOW.md', 'ONBOARDING.md'];
const appSource = readDoc('app.js');
const envMatch = ENV_DECL.exec(appSource);
const envValue = envMatch ? envMatch[1] : '';

// 反过来确认下面那条守卫不是空的：app.js 里确实得配着一个环境 ID。
// 没有这条，守卫会在「有人把那行删了」时**更绿**（没值可扫，自然没漂）。
suite.ok('app.js 里确实写着一个云开发环境 ID（否则下面那条守卫是空的）', envValue.length > 0);

// ⚠️ **不按形状判断，只按「是不是占位符」判断**。
// 第一版写的是按 `cloud1-` 这个形状扫 —— 那是本项目当时那一个环境的写法，
// 不是云开发的通用写法。别人新建的环境 ID 换一种格式，守卫就会把他判成「没配环境」，
// 而实际上他配好了 —— 守卫比它要守的规则更聪明，开始乱咬人，比没有守卫更糟。
// 真正要挡的只有一件事：**配了但没换成自己的**（占位符躺在那里，跑起来静默失败）。
const PLACEHOLDER = /REPLACE|TODO|CHANGEME|YOUR_ENV|填写|待填|改成你的|示例|xxx/i;
const envLooksReal = envValue.length >= 8 && !PLACEHOLDER.test(envValue);
suite.ok(
  '环境 ID 不是占位符（' + envValue.length + ' 个字符；配了但没换掉，跑起来只会静默失败）',
  envLooksReal
);

// 文档里不许出现这个值。两种扫法各管一半：
//   ① 按**当前值**扫 —— 和 appid 那条一样，能抓住任何格式的新环境；
//   ② 按**形状**扫 `cloud1-…` —— 能抓住「换过环境、文档里留着旧值」这种残留。
// 只做 ① 会漏掉旧值；只做 ② 会漏掉新格式。
const envRestated = [];
driftDocs.forEach(function (name) {
  const text = readDoc(name);
  if (!text) return;
  text.split('\n').forEach(function (line, i) {
    const hitValue = envValue.length > 0 && line.indexOf(envValue) !== -1;
    const hitShape = /cloud1-[a-z0-9]{8,}/.test(line);
    if (hitValue || hitShape) {
      envRestated.push(name + ' 第 ' + (i + 1) + ' 行：' + line.trim());
    }
  });
});
suite.eq('文档里没有复述云开发环境 ID（值只在 app.js 里写一遍）', envRestated, []);

// 顺带：这个环境 ID 必须真的被 wx.cloud.init 用上，不能只是躺着。
// 「配了但没接上」是这一类配置最常见的失败方式，而且跑测试不会报错。
suite.ok('app.js 里把环境 ID 交给了 wx.cloud.init', /wx\.cloud\.init\s*\(\s*\{[^}]*env:\s*CLOUD_ENV/.test(appSource));

suite.done();
