/**
 * 左右滑动翻页的手势判别（utils/swipe.js）。
 *
 * 滑动是「有界面的手点」最容易误判的东西：点一下算不算滑？斜着划算不算？
 * 人在真机上滑十次，感觉是「好像能翻页」；脚本把边界逐个过一遍，
 * 才能挡住「斜着划一下页面翻了、滚动也跟着乱了」这类 bug。
 */

const { createSuite } = require('./harness');
const swipe = require('../utils/swipe');

const suite = createSuite('check-swipe.js');

// --- 基本方向 ---

suite.eq(
  '向左滑超过阈值，判为 left（下一张）',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 100, y: 400 }),
  'left'
);
suite.eq(
  '向右滑超过阈值，判为 right（上一张）',
  swipe.swipeDirection({ x: 100, y: 400 }, { x: 220, y: 400 }),
  'right'
);

// --- 两道门槛 ---

suite.eq(
  '横向位移不够长，不算滑（那是点一下）',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 160, y: 400 }),
  ''
);
suite.eq(
  '刚好等于阈值不算滑（宁可少翻，不要误翻）',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 140, y: 400 }),
  ''
);
suite.eq(
  '纵向位移比横向大，判为空（那是页面在滚动）',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 100, y: 560 }),
  ''
);
suite.eq(
  '斜着划但横向占优，仍是滑动',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 80, y: 460 }),
  'left'
);

// --- 阈值可调 ---

suite.eq(
  '阈值可以按场景收紧',
  swipe.swipeDirection({ x: 200, y: 400 }, { x: 160, y: 400 }, 30),
  'left'
);
suite.eq('阈值就是常量 60', swipe.SWIPE_THRESHOLD, 60);

// --- 脏输入不能崩、不能误判 ---

suite.eq('缺起点返回空', swipe.swipeDirection(null, { x: 100, y: 400 }), '');
suite.eq('缺终点返回空', swipe.swipeDirection({ x: 200, y: 400 }, null), '');
suite.eq('起点缺字段返回空', swipe.swipeDirection({ x: 200 }, { x: 100, y: 400 }), '');
suite.eq('坐标不是数字返回空', swipe.swipeDirection({ x: 'a', y: 400 }, { x: 100, y: 400 }), '');
suite.eq('NaN 坐标返回空（NaN 会把比较全算成 false，会漏成方向）', swipe.swipeDirection({ x: NaN, y: 400 }, { x: 100, y: 400 }), '');

suite.noThrow('脏数据不崩', function () {
  swipe.swipeDirection(null, null);
  swipe.swipeDirection(undefined, {});
  swipe.swipeDirection({ x: NaN, y: NaN }, { x: 1, y: 2 });
});

suite.done();
