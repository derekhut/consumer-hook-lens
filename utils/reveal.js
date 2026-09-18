/**
 * 揭示流程的纯逻辑 —— 不碰界面，所以能直接被脚本测到。
 *
 * 「已揭示集合」用陷阱 id 的数组表示：['A1'] 表示第一处已揭示。
 */

/**
 * 每一屏的角色。三段示例按这三档逐渐放手：
 *   teach → practice → explore
 * 这是整个演示的骨架，改它等于改演示脚本。
 */
const SHOT_MODES = {
  /** 教：卡片上直接写着陷阱名，点一下看它在哪 */
  REVEAL: 'reveal',
  /** 练：先替你揭示一处，剩下的自己找 */
  FIND_ONE: 'find-one',
  /** 放手：一处都不给，全靠自己找 */
  FIND_ALL: 'find-all'
};

function isFindMode(mode) {
  return mode === SHOT_MODES.FIND_ONE || mode === SHOT_MODES.FIND_ALL;
}

/** 进这一屏时先替用户揭示哪几处 */
function initialRevealed(mode, hooks) {
  if (mode === SHOT_MODES.FIND_ONE) {
    if (!Array.isArray(hooks) || hooks.length === 0) return [];
    return [hooks[0].id];
  }
  return [];
}

/** 找的模式下，还没找到的那几处不能剧透名字 —— 剧透了就没得找了 */
function shouldHideName(mode, hookId, revealed) {
  return isFindMode(mode) && !isRevealed(revealed, hookId);
}

function toList(revealed) {
  return Array.isArray(revealed) ? revealed.slice() : [];
}

function isRevealed(revealed, hookId) {
  return toList(revealed).indexOf(hookId) !== -1;
}

/** 已揭示几处（跟着示例里定义的顺序数，重复 id 不会重复计数） */
function revealedCount(hooks, revealed) {
  if (!Array.isArray(hooks)) return 0;
  const list = toList(revealed);
  let n = 0;
  for (let i = 0; i < hooks.length; i++) {
    if (list.indexOf(hooks[i].id) !== -1) n += 1;
  }
  return n;
}

/** 是否已经全部揭示。空数组不算「全部揭示」 */
function allRevealed(hooks, revealed) {
  if (!Array.isArray(hooks) || hooks.length === 0) return false;
  return revealedCount(hooks, revealed) === hooks.length;
}

/** 按示例里定义的顺序，返回下一个还没揭示的陷阱；全部揭示完返回 null */
function nextUnrevealed(hooks, revealed) {
  if (!Array.isArray(hooks)) return null;
  const list = toList(revealed);
  for (let i = 0; i < hooks.length; i++) {
    if (list.indexOf(hooks[i].id) === -1) return hooks[i];
  }
  return null;
}

/** 点一次揭示，再点一次收起 */
function toggleRevealed(revealed, hookId) {
  const list = toList(revealed);
  const i = list.indexOf(hookId);
  if (i === -1) {
    list.push(hookId);
  } else {
    list.splice(i, 1);
  }
  return list;
}

/** 外层进度：第几张示例图 */
function shotProgressText(shotIndex, shotTotal) {
  return '示例 ' + (shotIndex + 1) + ' / ' + shotTotal;
}

/** 内层进度：这张图里已揭示几处 */
function hookProgressText(hooks, revealed) {
  if (!Array.isArray(hooks)) return '0 / 0';
  return revealedCount(hooks, revealed) + ' / ' + hooks.length;
}

/**
 * 提示语。
 *
 * 「还有一处」里的「一处」不给具体数字 —— 给数字就变成填空题，
 * 不给自己找的念头才会起来。三处以上才说总数，因为那时用户需要知道范围。
 */
function findHint(mode, hooks, revealed) {
  if (!isFindMode(mode)) return '';
  if (!Array.isArray(hooks) || hooks.length === 0) return '';
  const left = hooks.length - revealedCount(hooks, revealed);
  if (left <= 0) return '';
  if (left === 1) return '还有一处，你觉得在哪？';
  return '这张图里有 ' + hooks.length + ' 处，你来找找看';
}

/** 找的模式下点错地方时的轻提示。不判错，也不出现任何惩罚性的东西 */
function wrongTapHint() {
  return '看看这里的作用';
}

/** 想跳过「自己找」时的退路。没有它，找不到就卡住了 */
function skipHint() {
  return '直接显示';
}

/** 总量提示：这张图里一共有几处 */
function totalHint(hooks) {
  if (!Array.isArray(hooks) || hooks.length === 0) return '';
  return '这张图里有 ' + hooks.length + ' 处';
}

module.exports = {
  SHOT_MODES: SHOT_MODES,
  isFindMode: isFindMode,
  initialRevealed: initialRevealed,
  shouldHideName: shouldHideName,
  isRevealed: isRevealed,
  revealedCount: revealedCount,
  allRevealed: allRevealed,
  nextUnrevealed: nextUnrevealed,
  toggleRevealed: toggleRevealed,
  shotProgressText: shotProgressText,
  hookProgressText: hookProgressText,
  findHint: findHint,
  wrongTapHint: wrongTapHint,
  skipHint: skipHint,
  totalHint: totalHint
};
