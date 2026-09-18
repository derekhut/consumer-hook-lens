/**
 * 卡片页的检查 —— 连画布一起在 Node 里假出来。
 *
 * 页面这一层「薄」，但薄不等于不用测。它管的是三件很容易出错的事：
 *   1. **参数守卫** —— 参数不对时不能进一个空白页
 *   2. **画布尺寸** —— 比例错了卡片就被压扁
 *   3. **照着计划画** —— 计划里的每种图元都得真的画出来
 *
 * 第 3 点用的是一个「记账用」的假画布：它不画图，只把每一次 fillText /
 * drawImage / arc / stroke 记下来。于是「计划里有 20 段字，画布上就画了 20 段字」
 * 这种话能在 Node 里断言。真机上还要看的是「字有没有画歪」，那就只能手点。
 */

const { createSuite } = require('./harness');

let cardConfig = null;
const errors = [];

// console.error 是要被检查的：happy path 上一次都不该出现
const realError = console.error;
console.error = function () {
  errors.push(Array.prototype.slice.call(arguments).join(' '));
};

// --- 假画布：只记账，不画 ---

function makeRecorder() {
  const rec = { fillText: [], drawImage: [], arc: [], stroke: [], fill: [], scale: null };
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic',
    fillText(t, x, y) {
      rec.fillText.push({ text: t, x: x, y: y, font: ctx.font, color: ctx.fillStyle, align: ctx.textAlign });
    },
    drawImage(img, x, y, w, h) { rec.drawImage.push({ src: img.src, x: x, y: y, w: w, h: h }); },
    arc(cx, cy, r) { rec.arc.push({ cx: cx, cy: cy, r: r, color: ctx.fillStyle }); },
    fill() { rec.fill.push(ctx.fillStyle); },
    stroke() { rec.stroke.push(ctx.strokeStyle); },
    scale(sx, sy) { rec.scale = [sx, sy]; },
    beginPath() {}, moveTo() {}, lineTo() {}, rect() {}, arcTo() {}, closePath() {}
  };
  return { ctx: ctx, rec: rec };
}

function makeCanvas() {
  const r = makeRecorder();
  return {
    width: 0,
    height: 0,
    rec: r.rec,
    getContext() { return r.ctx; },
    // 图片加载在真机上是异步的；这里同步回调，让整个流程在一行里跑完
    createImage() {
      const img = { src: '' };
      Object.defineProperty(img, 'src', {
        get() { return img._src; },
        set(v) {
          img._src = v;
          if (img.onload) img.onload();
        }
      });
      return img;
    }
  };
}

// --- 桩 ---

let imageOk = true;
let nodeOk = true;
let lastCanvas = null;

global.Page = function (cfg) { cardConfig = cfg; };
global.getCurrentPages = function () { return [{}, {}]; };
global.wx = {
  showToast: function () {},
  showModal: function () {},
  navigateBack: function () {},
  navigateTo: function () {},
  getWindowInfo: function () { return { windowWidth: 375, pixelRatio: 3 }; },
  getImageInfo: function (o) {
    if (imageOk) o.success({ width: 750, height: 1125 });
    else o.fail({ errMsg: 'getImageInfo:fail 打不开' });
  },
  createSelectorQuery: function () {
    return {
      select: function () {
        return {
          fields: function () {
            return {
              exec: function (cb) {
                const canvas = makeCanvas();
                lastCanvas = canvas;
                cb([nodeOk ? { node: canvas, width: 343, height: 700 } : { width: 343, height: 700 }]);
              }
            };
          }
        };
      }
    };
  },
  canvasToTempFilePath: function (o) {
    o.success({ tempFilePath: '/tmp/fake-card.png' });
  },
  saveImageToPhotosAlbum: function (o) {
    o.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' });
  }
};

require('../pages/card/index.js');

const card = require('../utils/card');
const { SHARE_TITLE } = require('../utils/brand');
const { SHOTS } = require('../data/shots');

const suite = createSuite('check-page-card.js');

if (!cardConfig) {
  throw new Error('卡片页没把配置交给 Page()，后面的检查都无从谈起');
}

/** 造一个页面实例，并记下 paint 里那块假画布 */
function makePage(options) {
  const inst = {};
  Object.keys(cardConfig).forEach(function (k) { inst[k] = cardConfig[k]; });
  inst.data = JSON.parse(JSON.stringify(cardConfig.data));
  inst.setData = function (patch, cb) {
    const self = this;
    Object.keys(patch).forEach(function (k) { self.data[k] = patch[k]; });
    if (typeof cb === 'function') cb.call(self);
  };
  return inst;
}

function run(options) {
  errors.length = 0;
  const p = makePage();
  p.onLoad(options);
  return p;
}

// --- 参数守卫：参数不对不能进空白页 ---

suite.eq('示例序号不存在 → 失败状态', run({ shot: '99', ids: 'A1' }).data.state, 'failed');
suite.ok('失败时说清楚是没找到', run({ shot: '99', ids: 'A1' }).data.message.indexOf('没找到') !== -1);
suite.eq('没带 ids → 失败状态', run({ shot: '0' }).data.state, 'failed');
suite.eq('ids 是空串 → 失败状态', run({ shot: '0', ids: '' }).data.state, 'failed');
suite.eq('ids 全是逗号和空格 → 失败状态', run({ shot: '0', ids: ' , , ' }).data.state, 'failed');
suite.eq('什么都没带 → 失败状态', run({}).data.state, 'failed');
suite.eq('不改参数时不会误报失败', run({ shot: '0', ids: 'A1' }).data.state, 'ready');

// --- 正常路径 ---

const page = run({ shot: '0', ids: 'A1,B1' });

suite.eq('正常参数 → ready', page.data.state, 'ready');
suite.eq('数出来是两处', page.data.count, 2);
suite.ok('画布样式非空', !!page.data.canvasStyle);
suite.ok('画布样式里有宽度和高度', page.data.canvasStyle.indexOf('width:') === 0 && page.data.canvasStyle.indexOf('height:') !== -1);
suite.eq('happy path 上一条错误都没有', errors, []);

// 画布尺寸必须按计划的比例来，不然卡片会被压扁
const plan = card.buildCard({ shot: SHOTS[0], revealed: ['A1', 'B1'], imageRatio: 1125 / 750 });
const wMatch = page.data.canvasStyle.match(/width:(\d+)px/);
const hMatch = page.data.canvasStyle.match(/height:(\d+)px/);
suite.ok('画布宽度按屏幕算出来了', !!wMatch && Number(wMatch[1]) > 0);
suite.ok('画布高度按计划的比例算出来了', !!hMatch && Number(hMatch[1]) > 0);
suite.ok(
  '画布宽高比和计划一致（不会压扁）',
  Math.abs(Number(hMatch[1]) / Number(wMatch[1]) - plan.height / plan.width) < 0.01
);
suite.eq('页面排出来的计划和直接调 card.buildCard 一致', page.plan.height, plan.height);

// --- 照着计划画：每种图元都得真的画出来 ---

const rec = lastCanvas.rec;
const countOf = function (type) {
  return plan.items.filter(function (it) { return it.type === type; }).length;
};

suite.eq('每一段字都画了（计划 ' + countOf('text') + ' 段）', rec.fillText.length, countOf('text'));
suite.eq('图只画了一次', rec.drawImage.length, 1);
suite.eq('图片是按计划的框画的', [rec.drawImage[0].x, rec.drawImage[0].y, rec.drawImage[0].w, rec.drawImage[0].h],
  (function () {
    const it = plan.items.filter(function (x) { return x.type === 'image'; })[0];
    return [it.x, it.y, it.w, it.h];
  })());
suite.eq('图片路径是示例的路径', rec.drawImage[0].src, '/assets/samples/01.jpg');
suite.eq('每个圆圈都画了', rec.arc.length, countOf('circle'));
suite.eq('每条线都描了', rec.stroke.filter(function (c) { return c && String(c).indexOf('rgba') === 0; }).length, countOf('line'));
suite.eq('画布被缩放过（否则坐标全错）', rec.scale !== null, true);

// 画上去的字要和计划里的字一模一样（顺序、位置、大小都不能错位）
const planTexts = plan.items.filter(function (it) { return it.type === 'text'; });
const mismatched = [];
planTexts.forEach(function (it, i) {
  const got = rec.fillText[i];
  if (!got) { mismatched.push('第 ' + i + ' 段没画'); return; }
  if (got.text !== it.text) mismatched.push('第 ' + i + ' 段的字不对：' + got.text);
  if (got.x !== it.x || got.y !== it.y) mismatched.push('第 ' + i + ' 段位置不对：' + got.text);
  if (got.color !== it.color) mismatched.push('第 ' + i + ' 段颜色不对：' + got.text);
  if (got.align !== it.align) mismatched.push('第 ' + i + ' 段对齐不对：' + got.text);
  if (got.font.indexOf(String(it.size) + 'px') === -1) mismatched.push('第 ' + i + ' 段字号不对：' + got.text);
});
suite.eq('画上去的字和计划逐段对得上', mismatched, []);

// 计划里有几种图元，页面就得认识几种 —— 页面上有未知类型会打 console.error
suite.eq('没有出现「不认识的图元类型」', errors.filter(function (e) { return e.indexOf('不认识的图元') !== -1; }), []);

// --- 导出图片与转发 ---

suite.eq('导出图片拿到了文件路径', page.tempFilePath, '/tmp/fake-card.png');

const share = page.onShareAppMessage();
suite.eq('转发标题来自唯一来源', share.title, SHARE_TITLE);
suite.ok('转发路径指向卡片页本身', share.path.indexOf('/pages/card/index') === 0);
suite.ok('转发路径带上了这张示例', share.path.indexOf('shot=0') !== -1);
suite.ok('转发路径带上了已标出的两处', share.path.indexOf('ids=A1,B1') !== -1);
suite.eq('转发用上了导出出来的图', share.imageUrl, '/tmp/fake-card.png');

// 图没导出成功时，转发仍然要能用（退回默认缩略图），不能整个崩掉
const noImg = run({ shot: '0', ids: 'A1' });
noImg.tempFilePath = '';
const share2 = noImg.onShareAppMessage();
suite.eq('没导出图时不带 imageUrl，但转发照常可用', share2.imageUrl, undefined);
suite.ok('没导出图时仍然有标题和路径', !!share2.title && !!share2.path);

// --- 失败路径：每一处都要给能行动的文案，且错误进日志 ---

imageOk = false;
const badImage = run({ shot: '0', ids: 'A1' });
suite.eq('读不到图片尺寸 → 失败状态', badImage.data.state, 'failed');
suite.ok('读不到图片尺寸时说人话', badImage.data.message.indexOf('图片') !== -1);
suite.ok('读不到图片尺寸时原始错误进了日志', errors.some(function (e) { return e.indexOf('读图片尺寸失败') !== -1; }));
imageOk = true;

nodeOk = false;
const noNode = run({ shot: '0', ids: 'A1' });
suite.eq('取不到画布节点 → 失败状态', noNode.data.state, 'failed');
suite.ok('取不到画布节点时原始错误进了日志', errors.some(function (e) { return e.indexOf('取不到画布节点') !== -1; }));
nodeOk = true;

// 比例不合法时不该不出卡片
const oddRatio = run({ shot: '0', ids: 'A1' });
oddRatio.plan = null;
oddRatio.shot = SHOTS[0];
oddRatio.build(0);
suite.eq('比例是 0 也能排出版来（退回默认比例）', oddRatio.data.state, 'ready');

// 重试要从失败状态回到正常
const retry = run({ shot: '99', ids: 'A1' });
retry.onRetry();
suite.eq('重试：坏参数仍然是失败（参数本身没变）', retry.data.state, 'failed');
const retry2 = run({ shot: '0', ids: 'A1' });
retry2.setData({ state: 'failed', message: '假装失败了' });
retry2.onRetry();
suite.eq('重试：好参数能把页面救回来', retry2.data.state, 'ready');

// --- 存相册与入口 ---

let toasts = [];
const realToast = wx.showToast;
wx.showToast = function (o) { toasts.push(o && o.title); };

const noFile = makePage();
noFile.tempFilePath = '';
noFile.onSave();
suite.eq('图还没导出来时点保存，只给一句提示', toasts.length, 1);

// 拒绝授权时给的是「去哪开权限」，不是一句失败
let modal = null;
wx.showModal = function (o) { modal = o; };
const savePage = makePage();
savePage.tempFilePath = '/tmp/fake-card.png';
savePage.onSave();
suite.ok('相册权限被拒时弹的是引导弹窗', !!modal);
suite.ok('弹窗讲的是怎么开权限', modal.content.indexOf('权限') !== -1);

wx.showToast = realToast;

let backs = 0;
let tos = 0;
wx.navigateBack = function () { backs += 1; };
wx.navigateTo = function () { tos += 1; };
const enterPage = makePage();
enterPage.onEnter();
suite.eq('从卡片页返回时，栈里有上一页就返回', [backs, tos], [1, 0]);

global.getCurrentPages = function () { return [{}]; };;
const soloPage = makePage();
soloPage.onEnter();
suite.eq('被转发点开时栈里只有自己，就进取一趟', [backs, tos], [1, 1]);

// --- 别把页面搞崩 ---

suite.noThrow('脏参数不崩', function () {
  const p = makePage();
  p.onLoad(null);
  p.onLoad({ shot: 'x', ids: null });
  p.onRetry();
});

console.error = realError;
suite.done();
