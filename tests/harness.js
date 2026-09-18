/**
 * 极简测试脚手架。注意：文件名不以 check- 开头，所以不会被 run-all 当成套件跑。
 * 每个套件的最后一行必须是「... 0 失败」—— 这是我们唯一的判断标准。
 */

function createSuite(name) {
  let passed = 0;
  let failed = 0;

  function record(ok, label, extra) {
    if (ok) {
      passed += 1;
      console.log('  ok    ' + label);
    } else {
      failed += 1;
      console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : ''));
    }
  }

  return {
    ok: function (label, cond) {
      record(!!cond, label);
    },
    eq: function (label, actual, expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      record(a === e, label, a === e ? '' : '实际 ' + a + '，期望 ' + e);
    },
    /** 断言不抛错：把异常当失败，而不是让整个脚本崩掉 */
    noThrow: function (label, fn) {
      try {
        fn();
        record(true, label);
      } catch (err) {
        record(false, label, err && err.message);
      }
    },
    done: function () {
      console.log(name + '：' + (passed + failed) + ' 项，' + failed + ' 失败');
      if (failed > 0) process.exit(1);
    }
  };
}

module.exports = { createSuite: createSuite };
