/**
 * 把词典编译成云函数要用的那一份。
 *
 * 为什么需要这个脚本：云函数上传时**只打包它自己那个目录**，
 * `require('../../utils/hooks')` 在真机上是拿不到的。所以词典必须在
 * cloudfunctions/detect/ 里也有一份 —— 而「同一件事写两遍，就一定会有
 * 一遍忘了改」是这个项目已经栽过的坑。
 *
 * 解法沿用 tools/preview-card.js 那套：**不手抄，生成过去**，
 * 再由 tests/check-detect-sync.js 守着「生成物 = 词典」。
 * 改了词典忘了重新生成，测试就会变红，并且明确告诉你跑这条命令。
 *
 * 用法：node tools/build-detect-prompt.js
 */

const fs = require('fs');
const path = require('path');
const hooks = require('../utils/hooks');

const OUT_DIR = path.join(__dirname, '..', 'cloudfunctions', 'detect', 'lib');
const OUT_FILE = path.join(OUT_DIR, 'hook-dict.js');

const HEADER = [
  '/**',
  ' * 【生成文件，不要手改】改了也会被覆盖。',
  ' * 来源：utils/hooks.js —— 全站唯一的词典。',
  ' * 重新生成：node tools/build-detect-prompt.js',
  ' *',
  ' * 云函数上传时只打包自己那个目录，require 不到上级的 utils/，',
  ' * 所以这里必须有一份副本。为了让这一份永远等于词典，它是生成的，',
  ' * 并由 tests/check-detect-sync.js 守着 —— 改了词典不重新生成就会变红。',
  ' *',
  ' * 注意：纯 JSON 数组字面量，所以云函数里也能直接读，不依赖任何工具链。',
  ' */',
  ''
].join('\n');

// 只搬云函数真正要用的字段。搬得越多，越容易在下一次改词典时被迫跟着动
const dimensions = hooks.HOOK_DIMENSIONS.map(function (d) {
  return { id: d.id, name: d.name, blurb: d.blurb, closing: d.closing };
});

const patterns = hooks.HOOK_PATTERNS.map(function (p) {
  return { id: p.id, dimensionId: p.dimensionId, name: p.name, note: p.note };
});

const body = [
  'const DIMENSIONS = ' + JSON.stringify(dimensions, null, 2) + ';',
  '',
  'const PATTERNS = ' + JSON.stringify(patterns, null, 2) + ';',
  '',
  'module.exports = { DIMENSIONS: DIMENSIONS, PATTERNS: PATTERNS };',
  ''
].join('\n');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, HEADER + '\n' + body, 'utf8');

console.log('已生成 ' + path.relative(path.join(__dirname, '..'), OUT_FILE));
console.log('  维度 ' + dimensions.length + ' 个，模式 ' + patterns.length + ' 个');
