/**
 * 「按住，只看商品」的纯逻辑 —— 不碰界面。
 *
 * 这个动作是整套演示的高潮：按住时把已经标出来的那几处促销提示盖住，
 * 商品和价格留下。松手复原，评委就能在同一位置比较：
 * 「有这些提示时我先看什么？没有它们时，我还想买吗？」
 *
 * 规矩（写在这里，改之前先想清楚）：
 * - **只盖已经标出来的那些**。没找到的那处如果也被盖住，等于剧透答案。
 * - 盖子必须有一句点破差异的话。只让东西"灰掉"，用户只会说"变少了"，
 *   说不出所以然 —— 那就白做了。
 */

const { getHookPattern } = require('./hooks');

/** 至少标出一处，按住才有意义 */
function canHold(revealed) {
  return Array.isArray(revealed) && revealed.length > 0;
}

/** 按住时要盖住哪些：就是已经标出来的那些 */
function coveredIds(hooks, revealed) {
  if (!Array.isArray(hooks)) return [];
  const list = Array.isArray(revealed) ? revealed : [];
  const out = [];
  hooks.forEach(function (h) {
    if (list.indexOf(h.id) !== -1) out.push(h.id);
  });
  return out;
}

/**
 * 每个名字各自带引号，再连接。
 * 不能把引号加在整个列表外面 ——「限时倒计时和划线价锚定」读起来像一个名字，
 * 而这句话的全部意义就在于把两处分别点出来。
 */
function quoteNames(names) {
  const quoted = names.map(function (n) { return '「' + n + '」'; });
  if (quoted.length === 1) return quoted[0];
  return quoted.slice(0, -1).join('、') + '和' + quoted[quoted.length - 1];
}

/**
 * 按住时那句点破差异的话。
 * 用「刚才先跳出来的是『限时倒计时』和『划线价锚定』」这个句式：
 * 它把「命名」和「消失」绑在一起 —— 名字是这场演示真正要留下的东西。
 */
function holdCaption(hooks, revealed) {
  const names = coveredIds(hooks, revealed)
    .map(function (id) {
      const p = getHookPattern(id);
      return p ? p.name : '';
    })
    .filter(function (n) { return !!n; });

  if (names.length === 0) return '';
  return '刚才先跳出来的是' + quoteNames(names);
}

function holdLabel(holding) {
  return holding ? '松开，恢复' : '按住，只看商品';
}

/**
 * 按钮下面那行小字。
 *
 * 「先标出一处，再按住试试」和「按住下面，把刚才那几处拿掉」都是**邀请动作**，
 * 它们和那句点破差异的话（holdCaption）不是一回事 —— 混了就等于没点破。
 * 按住时返回空串：那时候词在图上那条横幅里，两处同时说话会互相抢。
 */
const HOLD_LOCKED_TEXT = '先标出一处，再按住试试';
const HOLD_IDLE_TEXT = '按住下面，把刚才那几处拿掉';

function holdHintText(canHoldNow, holding) {
  if (!canHoldNow) return HOLD_LOCKED_TEXT;
  if (holding) return '';
  return HOLD_IDLE_TEXT;
}

/**
 * 图上那条点破差异的横幅。
 *
 * 它压在图上、不占版面：位置就落在刚才那几处消失的地方，眼睛不用挪。
 * 因为用了绝对定位，长成两行也只会多盖一点图，不会把整页顶下去。
 * 不按住就不出现 —— 它存在的唯一理由是给差异一个名字。
 */
const HOLD_FALLBACK_TEXT = '这几处已经拿掉了';

function holdBannerText(canHoldNow, holding, caption) {
  if (!canHoldNow || !holding) return '';
  return caption && caption.length ? caption : HOLD_FALLBACK_TEXT;
}

module.exports = {
  canHold: canHold,
  coveredIds: coveredIds,
  holdCaption: holdCaption,
  holdLabel: holdLabel,
  holdHintText: holdHintText,
  holdBannerText: holdBannerText,
  HOLD_LOCKED_TEXT: HOLD_LOCKED_TEXT,
  HOLD_IDLE_TEXT: HOLD_IDLE_TEXT,
  HOLD_FALLBACK_TEXT: HOLD_FALLBACK_TEXT
};
