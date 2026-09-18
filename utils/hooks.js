/**
 * 消费陷阱词典 —— 全站唯一来源。
 *
 * 规矩：示例数据、卡片文案、云函数 prompt 都从这里读。
 * 同一件事不要在两个地方各写一遍 —— 写了两遍，就一定会有一次改了一边忘了另一边。
 *
 * 命名规矩（写死在这里，新增时照着填）：
 * - name     陷阱名，不超过 10 个字（现在最长的 8 个字），是卡片标题
 * - note     一句话机制，只回答「它怎么起作用」，不回答「它多坏」，不超过 30 个字
 * - blurb    维度的短说明，不超过 12 个字
 * - closing  维度的收尾话，卡片底部的「一句结论」用它，不超过 20 个字
 *
 * closing 存在的理由：卡片末尾需要一句话把这一屏的几处收成一件事。
 * 它必须跟着**维度**走、而不是跟着单个陷阱走 —— 收尾要收到"同一套机制"上，
 * 收到某一个陷阱上就变成了复述。
 */

const HOOK_DIMENSIONS = [
  { id: 'A', name: '制造紧迫', blurb: '压缩你做决定的时间', closing: '它不让你比较，只让你别错过。' },
  { id: 'B', name: '价格感知操纵', blurb: '让你以为现在买很划算', closing: '它给的是参照，不是折扣。' },
  { id: 'C', name: '阻力消除与默认捆绑', blurb: '让冲动零阻力地变成订单', closing: '它把「多买一点」做成了不费力的事。' },
  { id: 'D', name: '社交与从众', blurb: '用别人的选择替你做决定', closing: '它把别人的选择，铺在你的选择前面。' },
  { id: 'E', name: '进出不对称', blurb: '进来只要一步，出去要六步', closing: '它让进来只要一步，出去要好几步。' }
];

const HOOK_PATTERNS = [
  { id: 'A1', dimensionId: 'A', name: '限时倒计时', note: '用即将结束的提示，压缩比较和考虑的时间' },
  { id: 'A2', dimensionId: 'A', name: '库存与人气告急', note: '用稀缺感把犹豫变成抢购' },
  { id: 'B1', dimensionId: 'B', name: '划线价锚定', note: '用更高的划线价作参照，让当前价格显得更划算' },
  { id: 'B2', dimensionId: 'B', name: '先涨后降', note: '折前价被人为抬高，折扣幅度失真' },
  { id: 'B3', dimensionId: 'B', name: '满减门槛', note: '把优惠设在更高金额，推动额外加购' },
  { id: 'C1', dimensionId: 'C', name: '一键下单', note: '让冲动几乎零阻力地变成订单' },
  { id: 'C2', dimensionId: 'C', name: '默认勾选与搭售', note: '用默认值替你做了决定' },
  { id: 'C3', dimensionId: 'C', name: '凑单加购推荐', note: '用一个差一点就够的门槛，让你再挑一件' },
  { id: 'D1', dimensionId: 'D', name: '从众提示', note: '用别人的选择，降低你的犹豫' },
  { id: 'D2', dimensionId: 'D', name: '种草与达人同款', note: '把推荐包装成生活分享' },
  { id: 'E1', dimensionId: 'E', name: '取消与退订设障', note: '进来只要一步，出去要六步' },
  { id: 'E2', dimensionId: 'E', name: '自动续费默认开启', note: '让你在忘记的时候继续付费' },
  { id: 'E3', dimensionId: 'E', name: '权益即将过期', note: '用即将失去的东西催你回来消费' }
];

function findById(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return undefined;
}

/** 取一个陷阱模式；id 不存在时返回 undefined（调用方必须处理） */
function getHookPattern(id) {
  return findById(HOOK_PATTERNS, id);
}

/** 取一个一级维度；id 不存在时返回 undefined */
function getHookDimension(id) {
  return findById(HOOK_DIMENSIONS, id);
}

/**
 * 两张图里的同一套机制，怎么用一句话收尾。
 *
 * 规矩：**收尾要收到"同一套机制"上，不要收到某一个陷阱上。**
 * 收到单个陷阱上就变成了复述，用户读完还得自己想它们有什么关系。
 */
const MULTI_DIMENSION_CLOSING = '这几处都在做同一件事：缩短你从「看到」到「决定」的时间。';

function patternsByDimension(dimensionId) {
  return HOOK_PATTERNS.filter(function (p) {
    return p.dimensionId === dimensionId;
  });
}

module.exports = {
  HOOK_DIMENSIONS: HOOK_DIMENSIONS,
  HOOK_PATTERNS: HOOK_PATTERNS,
  MULTI_DIMENSION_CLOSING: MULTI_DIMENSION_CLOSING,
  getHookPattern: getHookPattern,
  getHookDimension: getHookDimension,
  patternsByDimension: patternsByDimension
};
