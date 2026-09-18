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

suite.done();
