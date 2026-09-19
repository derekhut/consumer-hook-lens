const { SHOTS } = require('../../data/shots');
const { getHookPattern } = require('../../utils/hooks');
const reveal = require('../../utils/reveal');
const hold = require('../../utils/hold');
const { rectToStyle } = require('../../utils/annotations');
const swipe = require('../../utils/swipe');

Page({
  data: {
    shotIndex: 0,
    shotTotal: SHOTS.length,
    shot: null,
    hooks: [],
    cardIndex: 0,
    hookProgress: '',
    guide: '',
    allDone: false,
    skipLabel: '',
    findMode: false,
    isLastShot: false,
    isFirstShot: true,
    /** 手指正按在按钮上 */
    holding: false,
    /** 至少标出了一处，按住才有意义 */
    holdReady: false,
    holdBtnLabel: '',
    /** 按钮下面那行小字：邀请动作 */
    holdHint: '',
    /** 压在图上那条横幅：点破差异。不按住就不出现 */
    holdBanner: '',
    /**
     * 能不能做卡片。条件是「至少标出一处」，和 holdReady 恰好相同，
     * 但**故意分成两个字段** —— 它们回答的是两个问题，以后要分开改时不用动对方。
     */
    canMakeCard: false
  },

  onLoad() {
    this.revealed = [];
    this.holding = false;
    /** 每一屏的进度存档：shotIndex → 已揭示的 id 数组。回退时靠它恢复 */
    this.progressMap = {};
    this.goShot(0);
  },

  goShot(index) {
    const shot = SHOTS[index];
    // 页面守卫：没有数据就别往下走，免得出现一屏空白
    if (!shot) {
      console.error('[journey] 找不到第 ' + index + ' 张示例');
      return;
    }
    // 离开当前屏前，先把这屏已标出的进度存档 —— 回退时才能原样恢复。
    // 首次进页（还没有当前屏）不存，存进来的也是空集。
    if (this.data.shot) {
      this.progressMap[this.data.shotIndex] = this.revealed.slice();
    }
    // 换图时按住状态必须清掉，否则新一屏会带着上一屏的盖子进来
    this.holding = false;
    // 进这一屏：有存档就恢复存档（回退不丢进度），没有才按 mode 初始化。
    // slice 是防串档：恢复出来的一份，之后怎么点都不会改到存档。
    const saved = this.progressMap[index];
    this.revealed = saved ? saved.slice() : reveal.initialRevealed(shot.mode, shot.hooks);
    this.setData(
      {
        shotIndex: index,
        shot: shot,
        cardIndex: 0,
        findMode: reveal.isFindMode(shot.mode),
        isLastShot: index === SHOTS.length - 1,
        isFirstShot: index === 0
      },
      this.refresh
    );
  },

  /** 把示例数据 + 已揭示集合，拼成界面要用的视图数据 */
  refresh() {
    const shot = this.data.shot;
    if (!shot) return;
    const revealed = this.revealed;
    const holding = this.holding === true;

    const hooks = [];
    shot.hooks.forEach(function (h, i) {
      const pattern = getHookPattern(h.id);
      if (!pattern) {
        // 错误不许吞掉：词典里没这个 id，是数据写错了
        console.error('[journey] 词典里找不到陷阱 id：' + h.id);
        return;
      }
      const style = rectToStyle(h.rect);
      if (!style) {
        // 坐标非法就干脆不画这个框，也不要画出一个错位的框
        console.error('[journey] 坐标不合法，已跳过：' + h.id + ' ' + JSON.stringify(h.rect));
        return;
      }
      const isOn = revealed.indexOf(h.id) !== -1;
      const hidden = reveal.shouldHideName(shot.mode, h.id, revealed);

      let state = '点一下，看它在哪';
      let note = pattern.note;
      if (hidden) {
        state = '还没找到';
        note = '点一下图上你觉得可疑的地方';
      } else if (isOn) {
        state = reveal.isFindMode(shot.mode) ? '找到了 · 点一下收起' : '已标出 · 点一下收起';
      }

      hooks.push({
        id: h.id,
        order: i + 1,
        name: pattern.name,
        note: note,
        state: state,
        hidden: hidden,
        revealed: isOn,
        // 按住时，已经标出来的那几处被盖住
        covered: holding && isOn,
        style:
          'left:' + style.left + ';top:' + style.top + ';' +
          'width:' + style.width + ';height:' + style.height + ';'
      });
    });

    const holdReady = hold.canHold(revealed);
    const caption = hold.holdCaption(shot.hooks, revealed);

    const allDone = reveal.allRevealed(shot.hooks, revealed);

    this.setData({
      hooks: hooks,
      hookProgress: reveal.hookProgressText(shot.hooks, revealed),
      guide: reveal.guideText(shot.mode, shot.hooks, revealed),
      // 「直接显示」只在还有得找的屏上出现 —— 教学屏没有「找」可跳过
      skipLabel: reveal.isFindMode(shot.mode) && !allDone ? reveal.skipHint() : '',
      allDone: allDone,
      holding: holding,
      holdReady: holdReady,
      holdBtnLabel: hold.holdLabel(holding),
      holdHint: hold.holdHintText(holdReady, holding),
      holdBanner: hold.holdBannerText(holdReady, holding, caption),
      canMakeCard: hold.canHold(revealed)
    });
  },

  // --- 按住，只看商品 ---
  // 用 bindtouchstart / bindtouchend，不用 bindlongpress：
  // bindlongpress 只在长按时触发一次，而且不包含手指刚碰到的那一刻，
  // 松手时机也无从得知 —— 而「按住→松开」的连续性正是这个动作的全部。

  onHoldStart() {
    if (!this.data.holdReady) {
      wx.showToast({ title: hold.HOLD_LOCKED_TEXT, icon: 'none', duration: 1400 });
      return;
    }
    if (this.holding) return;
    this.holding = true;
    this.refresh();
  },

  onHoldEnd() {
    if (!this.holding) return;
    this.holding = false;
    this.refresh();
  },

  /** 盖子上的点击：什么都不做，只是别让它落到图上去（否则会误弹提示） */
  onCoverTap() {
    return;
  },

  /** 点底部卡片：揭示 / 收起。找的模式下，没找到的那几张点不动 ——
      否则一路点过去就把「找」这件事绕过去了 */
  onCardTap(e) {
    // 按住时不许操作，免得一只手按住、另一只手把状态改乱了
    if (this.holding) return;
    const item = this.findHook(e.currentTarget.dataset.id);
    if (!item) return;
    if (item.hidden) {
      wx.showToast({ title: '先在图里找找看', icon: 'none', duration: 1200 });
      return;
    }
    this.revealed = reveal.toggleRevealed(this.revealed, item.id);
    this.refresh();
  },

  /** 点左右滑动卡片 */
  onCardChange(e) {
    this.setData({ cardIndex: e.detail.current });
  },

  /** 点图上已经标出来的框：把对应卡片切到前面来 */
  onMarkTap(e) {
    if (this.holding) return;
    const order = Number(e.currentTarget.dataset.order);
    if (!order) return;
    this.setData({ cardIndex: order - 1 });
  },

  /** 在图上点中了一处还没找到的陷阱 —— 这就是「找到」 */
  onHitTap(e) {
    if (this.holding) return;
    const order = Number(e.currentTarget.dataset.order);
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.revealed = reveal.toggleRevealed(this.revealed, id);
    const next = {};
    if (order) next.cardIndex = order - 1;
    this.setData(next, this.refresh);
  },

  /** 点在图上、但没点中任何一处。不判错，只给一句轻提示 */
  onStageTap() {
    if (this.holding) return;
    const shot = this.data.shot;
    if (!shot || !reveal.isFindMode(shot.mode)) return;
    if (reveal.allRevealed(shot.hooks, this.revealed)) return;
    wx.showToast({ title: reveal.wrongTapHint(), icon: 'none', duration: 1200 });
  },

  /** 「直接显示」：不想找也能走通 */
  onRevealNext() {
    if (this.holding) return;
    const next = reveal.nextUnrevealed(this.data.shot.hooks, this.revealed);
    if (!next) return;
    const index = this.data.shot.hooks.map(function (h) { return h.id; }).indexOf(next.id);
    this.revealed = reveal.toggleRevealed(this.revealed, next.id);
    this.setData({ cardIndex: index < 0 ? this.data.cardIndex : index }, this.refresh);
  },

  onNextShot() {
    const next = this.data.shotIndex + 1;
    if (next >= SHOTS.length) return;
    this.goShot(next);
  },

  /** 退回上一张。第一张时没有上一张，直接不动（按钮同时是置灰的） */
  onPrevShot() {
    const prev = this.data.shotIndex - 1;
    if (prev < 0) return;
    this.goShot(prev);
  },

  // --- 图上左右滑动翻页 ---
  // 判别逻辑在 utils/swipe.js（纯函数）；这里只记起点、问方向、执行翻页。
  // touchend 用 changedTouches：手指此刻已经离开，touches 里未必还有它。

  onStageTouchStart(e) {
    const t = e.touches && e.touches[0];
    this.touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  },

  onStageTouchEnd(e) {
    // 按住看商品时不许翻页，免得一只手按住、另一只手把屏翻了
    if (this.holding) {
      this.touchStart = null;
      return;
    }
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this.touchStart) return;
    const dir = swipe.swipeDirection(this.touchStart, { x: t.clientX, y: t.clientY });
    this.touchStart = null;
    if (dir === 'left') this.onNextShot();
    else if (dir === 'right') this.onPrevShot();
  },

  onStageTouchCancel() {
    this.touchStart = null;
  },

  /** 去生成卡片。只带上这一屏里**已经标出来**的那几处 */
  onMakeCard() {
    if (!this.data.canMakeCard) {
      wx.showToast({ title: '先标出一处，再来做卡片', icon: 'none', duration: 1400 });
      return;
    }
    // 用 hooks 而不是 revealed：hooks 是按示例顺序拼好的，而且已经滤掉了词典里没有的 id
    const ids = this.data.hooks
      .filter(function (h) { return h.revealed; })
      .map(function (h) { return h.id; });
    if (ids.length === 0) {
      // 上面那道门已经挡住了，这里再挡一次：宁可什么都不做，也不要开一个空卡片页
      console.error('[journey] canMakeCard 为真但一处都没标出来，状态不一致');
      return;
    }
    wx.navigateTo({
      url: '/pages/card/index?shot=' + this.data.shotIndex + '&ids=' + ids.join(',')
    });
  },

  findHook(id) {
    const list = this.data.hooks.filter(function (h) { return h.id === id; });
    return list.length ? list[0] : null;
  }
});
