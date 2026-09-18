/**
 * 汇总脚本 —— 自动发现 tests/check-*.js 并逐个跑。
 *
 * 铁律：不要在下面硬编码测试文件清单。
 * 新人加了 tests/check-xxx.js 却忘了往清单里加，汇总会显示全绿，
 * 而那个套件根本没跑 —— 一个没跑的绿色检查，比没有检查更危险。
 *
 * 判断标准：每一行末尾都显示「0 失败」。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testsDir = __dirname;
const files = fs
  .readdirSync(testsDir)
  .filter(function (f) { return /^check-.*\.js$/.test(f); })
  .sort();

if (files.length === 0) {
  console.log('没有发现任何 tests/check-*.js —— 检查一下文件是不是放错目录了');
  process.exit(1);
}

console.log('发现 ' + files.length + ' 个套件：' + files.join('、') + '\n');

let failedSuites = 0;

files.forEach(function (file) {
  console.log('--- ' + file + ' ---');
  try {
    const out = execFileSync(process.execPath, [path.join(testsDir, file)], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (err) {
    if (err && err.stdout) process.stdout.write(String(err.stdout));
    if (err && err.stderr) process.stderr.write(String(err.stderr));
    failedSuites += 1;
  }
  console.log('');
});

if (failedSuites > 0) {
  console.log('有 ' + failedSuites + ' 个套件没跑绿，先修好再往下走');
  process.exit(1);
}

console.log('全部 ' + files.length + ' 个套件跑完，共 0 失败');
