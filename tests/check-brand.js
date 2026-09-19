/**
 * 产品名的一致性。
 *
 * 这是个看起来很小题大做的检查，但产品名在全项目**只允许出现两处**：
 * `utils/brand.js`（JS 侧唯一来源）和 `app.json`（纯 JSON，import 不进来，
 * 只能硬编码）。一旦有人图快在某个页面里又写一遍，以后改名就会漏掉那一处，
 * 界面上两个名字同时存在 —— 演示时评委一眼就看见。
 *
 * 这个检查第一次跑就抓到两处真泄漏：`pages/journey/index.json` 自己盖了一层
 * 标题（已删，改用 app.json 的全局标题），以及本文件注释里写了字面量。
 *
 * 所以这里直接**扫全项目**找出所有出现产品名的代码/配置文件，只允许那两处。
 * 文档（.md）不算。
 */

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./harness');
const brand = require('../utils/brand');

const suite = createSuite('check-brand.js');

const ROOT = path.join(__dirname, '..');
const CODE_EXT = ['.js', '.json', '.wxml', '.wxss', '.wxs'];
const SKIP_DIR = ['node_modules', '.workbuddy', 'assets', '.git', 'cloudfunctions'];

/** 产品名只允许出现在这两个文件里 */
const ALLOWED = ['utils/brand.js', 'app.json'];

/** 扫描器自己也要跳过：它的注释里会提到这个检查，硬扫会自己抓自己 */
const SELF = path.join('tests', 'check-brand.js');

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (e) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (SKIP_DIR.indexOf(e.name) !== -1) return;
      walk(full, out);
      return;
    }
    if (CODE_EXT.indexOf(path.extname(e.name)) === -1) return;
    out.push(rel);
  });
  return out;
}

const files = walk(ROOT, []);

suite.ok('扫到了项目文件（' + files.length + ' 个）', files.length > 0);

// --- 名字本身 ---

suite.ok('产品名不为空', !!brand.APP_NAME && brand.APP_NAME.length > 0);
suite.ok('产品名不超过 10 个字（实际 ' + brand.APP_NAME.length + ' 字）', brand.APP_NAME.length <= 10);

suite.ok('卡片页脚不为空', !!brand.CARD_FOOTER);
suite.ok(
  '卡片页脚不超过 30 个字（实际 ' + brand.CARD_FOOTER.length + ' 字）',
  brand.CARD_FOOTER.length <= 30
);
suite.ok('转发文案不为空', !!brand.SHARE_TITLE);
suite.ok(
  '转发文案不超过 30 个字（实际 ' + brand.SHARE_TITLE.length + ' 字）',
  brand.SHARE_TITLE.length <= 30
);

// --- app.json 的标题必须跟着走 ---

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
suite.eq(
  'app.json 的标题和产品名一致',
  appJson.window.navigationBarTitleText,
  brand.APP_NAME
);

// --- 全项目扫一遍：只允许那两处出现这个名字 ---

const hits = [];
files.forEach(function (rel) {
  if (ALLOWED.indexOf(rel) !== -1) return;
  if (rel === SELF) return;
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (text.indexOf(brand.APP_NAME) !== -1) hits.push(rel);
});

suite.eq(
  '产品名只出现在 brand.js 和 app.json 里（别处都是漏改的隐患）',
  hits,
  []
);

suite.done();
