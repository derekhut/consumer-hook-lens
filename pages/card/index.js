/**
 * 卡片页：把 `utils/card.js` 排好的版照着画出来。
 *
 * 这一层故意做得很薄 —— 它**不做任何判断**：位置、折行、颜色、要不要画框，
 * 全在 plan 里定好了（那些是纯逻辑，有测试守着）。
 * 这里只做三件只能在真机上做的事：读图片尺寸、调 canvas、生成图片文件。
 */

const { SHOTS } = require('../../data/shots');
const card = require('../../utils/card');
const { drawPlan } = require('../../utils/canvas-draw');
const { SHARE_TITLE } = require('../../utils/brand');

/** 画布左右各留多少 px */
const SIDE = 16;

Page({
  data: {
    // loading | ready | failed
    state: 'loading',
    message: '',
    canvasStyle: '',
    count: 0,
    saveTip: ''
  },

  onLoad(options) {
    const shotIndex = Number((options && options.shot) || 0);
    const ids = String((options && options.ids) || '')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return !!s; });

    this.shotIndex = shotIndex;
    this.ids = ids;
    this.tempFilePath = '';

    const shot = SHOTS[shotIndex];
    if (!shot) {
      this.fail('没找到这张示例');
      return;
    }
    if (ids.length === 0) {
      this.fail('还没有标出任何一处，先回去标一处');
      return;
    }
    this.shot = shot;
    this.measureImage();
  },

  /** 先问一下图片本身的宽高 —— 排版要知道比例，不然图会被拉变形 */
  measureImage() {
    const self = this;
    wx.getImageInfo({
      src: this.shot.image,
      success(res) {
        if (!res || !res.width || !res.height) {
          console.error('[card] 图片尺寸不合法', res);
          self.fail('图片尺寸读不出来');
          return;
        }
        self.build(res.height / res.width);
      },
      fail(err) {
        // 错误不吞：日志留原始错误，界面给一句能行动的
        console.error('[card] 读图片尺寸失败', err);
        self.fail('图片读不出来，换一张试试');
      }
    });
  },

  build(imageRatio) {
    const plan = card.buildCard({
      shot: this.shot,
      revealed: this.ids,
      imageRatio: imageRatio
    });
    if (!plan) {
      console.error('[card] 排版没排出来', JSON.stringify(this.ids));
      this.fail('这张图里没有可展示的内容');
      return;
    }
    this.plan = plan;

    // 画布尺寸：宽度按屏幕来，高度按设计稿的比例算，这样卡片永远不会被压扁
    const win = this.windowInfo();
    const cssW = win.windowWidth - SIDE * 2;
    const cssH = Math.round(cssW * plan.height / plan.width);

    this.setData(
      {
        state: 'ready',
        count: plan.count,
        canvasStyle: 'width:' + cssW + 'px;height:' + cssH + 'px;'
      },
      this.paint
    );
  },

  windowInfo() {
    // getWindowInfo 是新接口，老基础库上退回 getSystemInfoSync
    if (typeof wx.getWindowInfo === 'function') {
      try {
        return wx.getWindowInfo();
      } catch (e) {
        console.error('[card] getWindowInfo 失败，退回 getSystemInfoSync', e);
      }
    }
    return wx.getSystemInfoSync() || { windowWidth: 375, pixelRatio: 2 };
  },

  paint() {
    const self = this;
    const plan = this.plan;

    wx.createSelectorQuery()
      .select('#card')
      .fields({ node: true, size: true })
      .exec(function (res) {
        const got = res && res[0];
        if (!got || !got.node) {
          console.error('[card] 取不到画布节点', res);
          self.fail('画布没准备好，返回重进一下');
          return;
        }
        const canvas = got.node;
        const ctx = canvas.getContext('2d');
        const info = self.windowInfo();
        const dpr = info.pixelRatio || 2;

        // 画布先按设备像素放大，再整体缩放到设计稿坐标 —— 于是 plan 里的数字可以直接用
        canvas.width = got.width * dpr;
        canvas.height = got.height * dpr;
        ctx.scale(canvas.width / plan.width, canvas.height / plan.height);

        const imageItem = plan.items.filter(function (it) { return it.type === 'image'; })[0];
        if (!imageItem) {
          console.error('[card] 计划里没有图', JSON.stringify(plan.items.length));
          self.fail('这张卡片缺了截图');
          return;
        }

        const img = canvas.createImage();
        img.onload = function () {
          self.draw(ctx, plan, img);
          self.exportImage(canvas);
        };
        img.onerror = function (err) {
          console.error('[card] 图片没加载出来', err);
          self.fail('截图没加载出来，返回重进一下');
        };
        img.src = imageItem.src;
      });
  },

  /**
   * 照着计划画。
   * 真正的绘制逻辑在 utils/canvas-draw.js —— 抽出去是为了让离线预览工具
   * 用同一份代码（预览自己实现一遍的话，验的就不是真机上的那份）。
   */
  draw(ctx, plan, img) {
    drawPlan(ctx, plan, img, function (msg) {
      console.error('[card] ' + msg);
    });
  },

  /** 生成一张图片文件，转发时当缩略图用 */
  exportImage(canvas) {
    const self = this;
    wx.canvasToTempFilePath({
      canvas: canvas,
      success(res) {
        self.tempFilePath = res.tempFilePath;
      },
      fail(err) {
        // 图没导出成功不该把卡片也毁了：界面照常显示，只是转发时用不到自定义缩略图
        console.error('[card] 导出图片失败（转发缩略图会退回默认图）', err);
      }
    }, this);
  },

  fail(message) {
    this.setData({ state: 'failed', message: message });
  },

  onRetry() {
    this.setData({ state: 'loading', message: '' });
    this.onLoad({ shot: String(this.shotIndex), ids: this.ids.join(',') });
  },

  /** 从卡片回来的人（转发点开的）也应该能进主体验一遍 */
  onEnter() {
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.navigateTo({ url: '/pages/journey/index' });
  },

  /** 存相册。这是全项目唯一会弹系统授权的地方，所以它只做次要动作 */
  onSave() {
    const p = this.tempFilePath;
    if (!p) {
      wx.showToast({ title: '卡片还在画，稍等一下', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: p,
      success() {
        wx.showToast({ title: '已存到相册' });
      },
      fail(err) {
        console.error('[card] 存相册失败', err);
        const msg = String((err && err.errMsg) || '');
        if (msg.indexOf('auth') !== -1 || msg.indexOf('authorize') !== -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '在小程序的「设置」里打开相册权限，就能保存了。',
            showCancel: false
          });
          return;
        }
        wx.showToast({ title: '没存上，再试一次', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    const out = {
      title: SHARE_TITLE,
      path: '/pages/card/index?shot=' + this.shotIndex + '&ids=' + this.ids.join(',')
    };
    if (this.tempFilePath) out.imageUrl = this.tempFilePath;
    return out;
  }
});
