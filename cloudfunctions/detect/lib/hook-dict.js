/**
 * 【生成文件，不要手改】改了也会被覆盖。
 * 来源：utils/hooks.js —— 全站唯一的词典。
 * 重新生成：node tools/build-detect-prompt.js
 *
 * 云函数上传时只打包自己那个目录，require 不到上级的 utils/，
 * 所以这里必须有一份副本。为了让这一份永远等于词典，它是生成的，
 * 并由 tests/check-detect-sync.js 守着 —— 改了词典不重新生成就会变红。
 *
 * 注意：纯 JSON 数组字面量，所以云函数里也能直接读，不依赖任何工具链。
 */

const DIMENSIONS = [
  {
    "id": "A",
    "name": "制造紧迫",
    "blurb": "压缩你做决定的时间",
    "closing": "它不让你比较，只让你别错过。"
  },
  {
    "id": "B",
    "name": "价格感知操纵",
    "blurb": "让你以为现在买很划算",
    "closing": "它给的是参照，不是折扣。"
  },
  {
    "id": "C",
    "name": "阻力消除与默认捆绑",
    "blurb": "让冲动零阻力地变成订单",
    "closing": "它把「多买一点」做成了不费力的事。"
  },
  {
    "id": "D",
    "name": "社交与从众",
    "blurb": "用别人的选择替你做决定",
    "closing": "它把别人的选择，铺在你的选择前面。"
  },
  {
    "id": "E",
    "name": "进出不对称",
    "blurb": "进来只要一步，出去要六步",
    "closing": "它让进来只要一步，出去要好几步。"
  }
];

const PATTERNS = [
  {
    "id": "A1",
    "dimensionId": "A",
    "name": "限时倒计时",
    "note": "用即将结束的提示，压缩比较和考虑的时间"
  },
  {
    "id": "A2",
    "dimensionId": "A",
    "name": "库存与人气告急",
    "note": "用稀缺感把犹豫变成抢购"
  },
  {
    "id": "B1",
    "dimensionId": "B",
    "name": "划线价锚定",
    "note": "用更高的划线价作参照，让当前价格显得更划算"
  },
  {
    "id": "B2",
    "dimensionId": "B",
    "name": "先涨后降",
    "note": "折前价被人为抬高，折扣幅度失真"
  },
  {
    "id": "B3",
    "dimensionId": "B",
    "name": "满减门槛",
    "note": "把优惠设在更高金额，推动额外加购"
  },
  {
    "id": "C1",
    "dimensionId": "C",
    "name": "一键下单",
    "note": "让冲动几乎零阻力地变成订单"
  },
  {
    "id": "C2",
    "dimensionId": "C",
    "name": "默认勾选与搭售",
    "note": "用默认值替你做了决定"
  },
  {
    "id": "C3",
    "dimensionId": "C",
    "name": "凑单加购推荐",
    "note": "用一个差一点就够的门槛，让你再挑一件"
  },
  {
    "id": "D1",
    "dimensionId": "D",
    "name": "从众提示",
    "note": "用别人的选择，降低你的犹豫"
  },
  {
    "id": "D2",
    "dimensionId": "D",
    "name": "种草与达人同款",
    "note": "把推荐包装成生活分享"
  },
  {
    "id": "E1",
    "dimensionId": "E",
    "name": "取消与退订设障",
    "note": "进来只要一步，出去要六步"
  },
  {
    "id": "E2",
    "dimensionId": "E",
    "name": "自动续费默认开启",
    "note": "让你在忘记的时候继续付费"
  },
  {
    "id": "E3",
    "dimensionId": "E",
    "name": "权益即将过期",
    "note": "用即将失去的东西催你回来消费"
  }
];

module.exports = { DIMENSIONS: DIMENSIONS, PATTERNS: PATTERNS };
