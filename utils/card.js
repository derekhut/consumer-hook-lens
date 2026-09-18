/**
 * 分享卡片的**排版** —— 纯逻辑，不碰 canvas。
 *
 * 为什么这么切：小程序的 canvas 只在真机上跑得起来，Node 里没有。如果把
 * 「算位置」和「调 canvas API」写在一个函数里，那么**卡片的排版一个测试都写不了**，
 * 只能靠上真机肉眼看。
 *
 * 所以这里只产出**一份绘制计划**：一串带绝对坐标的图元（rect / text / image /
 * line / circle）+ 画布尺寸。`pages/card/` 拿到它只管照着画，不做任何判断。
 *
 * 好处：折行对不对、有没有出界、编号和列表对不对得上、结论跟不跟着维度走 ——
 * 全都能在 Node 里断言。真机上要看的只剩下「字有没有画歪」。
 *
 * 坐标系：设计稿宽度固定 750（跟 rpx 一致的思路），页面上再整体缩放到真实画布，
 * 于是所有数值在这里都是确定的、可断言的。
 */

const { getHookPattern, getHookDimension, MULTI_DIMENSION_CLOSING } = require('./hooks');
const { APP_NAME, CARD_FOOTER } = require('./brand');
const { normalizeRect } = require('./annotations');

const DESIGN_WIDTH = 750;
const PAD = 56;
const CONTENT_W = DESIGN_WIDTH - PAD * 2;

/** 图最高画到多少。用户自己传的截图可能特别长（长图截屏），不能让它无限拉高卡片 */
const MAX_IMAGE_H = 1020;

const COLOR = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  text2: '#6B6B6B',
  text3: '#9A9A9A',
  line: 'rgba(0, 0, 0, 0.10)',
  mark: '#E8A33D',
  markSoft: 'rgba(232, 163, 61, 0.12)',
  accent: '#1F9D55',
  onMark: '#FFFFFF'
};

const SIZE = { title: 40, trap: 32, body: 27, small: 24, tiny: 22 };

// --- 文字度量 ---
// canvas 里有 measureText，但排版要在没有 canvas 的地方也能算。所以自己估。
// 规矩：**宁可估宽，不要估窄**。估宽了顶多这一行少放两个字；估窄了字就画出界了。

function isWideChar(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0x1100 && c <= 0x115f) return true;   // 韩文字母
  if (c >= 0x2e80 && c <= 0xa4cf) return true;   // 中日韩部首、假名、注音、汉字
  if (c >= 0xac00 && c <= 0xd7a3) return true;   // 韩文音节
  if (c >= 0xf900 && c <= 0xfaff) return true;   // 兼容汉字
  if (c >= 0xfe30 && c <= 0xfe6f) return true;   // 兼容标点
  if (c >= 0xff00 && c <= 0xff60) return true;   // 全角字母数字标点（含 ：）
  if (c >= 0xffe0 && c <= 0xffe6) return true;
  return false;
}

function charWidth(ch, size) {
  if (isWideChar(ch)) return size;
  if (ch === ' ' || ch === '\t') return size * 0.35;
  return size * 0.6;
}

function measure(text, size) {
  let w = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) w += charWidth(s.charAt(i), size);
  return w;
}

// 禁则：这两类标点不能待在行首、行尾，否则读起来像断错了句
const NO_LINE_START = '。，、；：！？）」』】》…·%';
const NO_LINE_END = '（「『【《';

/**
 * 折行。按字数贪心，但不让标点跑到行首/行尾。
 *
 * 「把标点拉回上一行」会让那一行**超出 maxWidth 一点点**（不到一个字宽）——
 * 这是中文排版的常规做法，比让逗号孤零零地开始一行好看得多。
 * 所以这里的约定是：每行不超过 maxWidth，**除非它是以收尾标点结束的**。
 */
function wrapText(text, size, maxWidth) {
  const s = String(text === null || text === undefined ? '' : text);
  if (!s) return [];
  const lines = [];
  let line = '';
  let lineW = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    const w = charWidth(ch, size);

    if (lineW + w <= maxWidth || line === '') {
      line += ch;
      lineW += w;
      continue;
    }

    // 该换行了：先把行尾那些「不能结尾」的字符挪到下一行去
    let carry = '';
    while (line.length > 1 && NO_LINE_END.indexOf(line.charAt(line.length - 1)) !== -1) {
      carry = line.charAt(line.length - 1) + carry;
      line = line.slice(0, -1);
    }
    lines.push(line);
    line = carry + ch;
    lineW = measure(line, size);

    // 行首不能是收尾标点：把它退回上一行（宁可那行宽一点）
    if (NO_LINE_START.indexOf(ch) !== -1 && lines.length > 0 && carry === '') {
      lines[lines.length - 1] += ch;
      line = '';
      lineW = 0;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function lineHeight(size) {
  return Math.round(size * 1.5);
}

/** 行盒内文字基线的位置。汉字基线大约落在字号的 0.85 处 */
function baseline(yTop, size) {
  return yTop + Math.round(size * 0.85);
}

// --- 图元生成 ---

function rect(x, y, w, h, style) {
  return Object.assign({ type: 'rect', x: x, y: y, w: w, h: h }, style);
}

function circle(cx, cy, r, fill) {
  return { type: 'circle', cx: cx, cy: cy, r: r, fill: fill };
}

function line(x1, y1, x2, y2, color, lineWidth) {
  return { type: 'line', x1: x1, y1: y1, x2: x2, y2: y2, color: color, lineWidth: lineWidth };
}

/**
 * 往计划里加一段文字（自动折行），返回下一段的起始 yTop。
 * x 是文本框左边的位置；align 为 right 时 x 是右边。
 */
function pushText(items, x, yTop, text, size, color, weight, opts) {
  const o = opts || {};
  const maxW = o.maxWidth || CONTENT_W;
  const lines = wrapText(text, size, maxW);
  const h = lineHeight(size);
  const align = o.align || 'left';

  lines.forEach(function (ln, i) {
    items.push({
      type: 'text',
      x: x,
      y: baseline(yTop + i * h, size),
      text: ln,
      size: size,
      color: color,
      weight: weight || '400',
      align: align
    });
  });

  return yTop + Math.max(lines.length, 1) * h;
}

/** 图在卡片里占多大：铺满内容宽，太高就按最高值回缩，然后居中 */
function imageBox(ratio) {
  const r = typeof ratio === 'number' && isFinite(ratio) && ratio > 0 ? ratio : 1.5;
  let w = CONTENT_W;
  let h = w * r;
  if (h > MAX_IMAGE_H) {
    h = MAX_IMAGE_H;
    w = h / r;
  }
  h = Math.round(h);
  w = Math.round(w);
  // 宽度取偶数：设计稿宽度 750 是偶数，偶数宽才分得出一模一样的左右边距。
  // 不这么做，居中会差 1 像素（round(247.5) 往上进），检查脚本里那条
  // 「回缩后仍然居中」就会红 —— 那种差 1 像素的矩形，肉眼看不见，但会让
  // 「居中」这个断言永远没法用。
  if (w % 2 !== 0) w -= 1;
  return { x: (DESIGN_WIDTH - w) / 2, y: 0, w: w, h: h };
}

/**
 * 卡片底部那句结论。
 *
 * 跟着**维度**走：只命中一个维度就用那个维度的收尾话；命中两个以上，
 * 说明这一屏的证据已经够说明一件共同的事，用那句总的话。
 * 收到单个陷阱上就变成复述了，用户读完还得自己想它们有什么关系。
 */
function conclusionFor(patterns) {
  const dims = [];
  const list = Array.isArray(patterns) ? patterns : [];
  list.forEach(function (p) {
    if (!p) return;
    const d = getHookDimension(p.dimensionId);
    if (!d) return;
    if (dims.indexOf(d) === -1) dims.push(d);
  });
  if (dims.length === 0) return '';
  if (dims.length === 1) return dims[0].closing;
  return MULTI_DIMENSION_CLOSING;
}

/** 卡片上要展示哪几处：只展示这一屏里**已经标出来**的，顺序跟着示例走 */
function pickHooks(shot, revealed) {
  if (!shot || !Array.isArray(shot.hooks)) return [];
  const list = Array.isArray(revealed) ? revealed : [];
  return shot.hooks.filter(function (h) {
    return list.indexOf(h.id) !== -1 && !!getHookPattern(h.id);
  });
}

/**
 * 生成绘制计划。
 * 输入不可用时返回 null（跟 annotations 的约定一致），调用方负责显示失败状态。
 */
function buildCard(opts) {
  const o = opts || {};
  const shot = o.shot;
  const picked = pickHooks(shot, o.revealed);
  if (!shot || !shot.image || picked.length === 0) return null;

  const items = [];
  const img = imageBox(o.imageRatio);
  let y = PAD;

  // 头部：产品名 + 共几处
  y = pushText(items, PAD, y, APP_NAME, SIZE.title, COLOR.text, '500', {
    maxWidth: CONTENT_W - 240
  });
  items.push({
    type: 'text',
    x: DESIGN_WIDTH - PAD,
    y: baseline(y - lineHeight(SIZE.title) + Math.round((lineHeight(SIZE.title) - lineHeight(SIZE.small)) / 2), SIZE.small),
    text: '共 ' + picked.length + ' 处促销设计',
    size: SIZE.small,
    color: COLOR.text3,
    weight: '400',
    align: 'right'
  });
  y += 16;

  // 来源
  if (shot.appName) {
    y = pushText(items, PAD, y, shot.appName, SIZE.tiny, COLOR.text3, '400');
    y += 8;
  }

  // 图 + 标出来的框
  const imgTop = y;
  items.push({ type: 'image', src: shot.image, x: img.x, y: imgTop, w: img.w, h: img.h });

  picked.forEach(function (h, i) {
    const r = normalizeRect(h.rect);
    if (!r) return;
    const bx = img.x + r.x * img.w;
    const by = imgTop + r.y * img.h;
    const bw = r.w * img.w;
    const bh = r.h * img.h;
    items.push(rect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh), {
      fill: COLOR.markSoft,
      stroke: COLOR.mark,
      lineWidth: 3,
      radius: 6
    }));

    // 编号徽章压在框的左上角
    const cr = 21;
    const ccx = Math.round(bx);
    const ccy = Math.round(by);
    items.push(circle(ccx, ccy, cr, COLOR.mark));
    items.push({
      type: 'text',
      x: ccx,
      y: ccy + Math.round(SIZE.small * 0.35),
      text: String(i + 1),
      size: SIZE.small,
      color: COLOR.onMark,
      weight: '500',
      align: 'center'
    });
  });

  y = imgTop + img.h + 48;

  // 分隔线
  items.push(line(PAD, y, DESIGN_WIDTH - PAD, y, COLOR.line, 2));
  y += 40;

  // 逐条列出来
  picked.forEach(function (h, i) {
    const p = getHookPattern(h.id);
    const d = getHookDimension(p.dimensionId);
    const badgeR = 22;

    items.push(circle(PAD + badgeR, y + Math.round(SIZE.trap * 0.75), badgeR, COLOR.mark));
    items.push({
      type: 'text',
      x: PAD + badgeR,
      y: y + Math.round(SIZE.trap * 0.75) + Math.round(SIZE.small * 0.35),
      text: String(i + 1),
      size: SIZE.small,
      color: COLOR.onMark,
      weight: '500',
      align: 'center'
    });

    const textX = PAD + badgeR * 2 + 18;
    const dimW = d ? measure(d.name, SIZE.tiny) : 0;
    const nameEnd = pushText(items, textX, y, p.name, SIZE.trap, COLOR.text, '500', {
      maxWidth: CONTENT_W - (textX - PAD) - dimW - 24
    });

    // 维度名贴着右边，和陷阱名同一行
    if (d) {
      items.push({
        type: 'text',
        x: DESIGN_WIDTH - PAD,
        y: baseline(y, SIZE.tiny),
        text: d.name,
        size: SIZE.tiny,
        color: COLOR.accent,
        weight: '400',
        align: 'right'
      });
    }

    y = Math.max(nameEnd, y + lineHeight(SIZE.trap));
    y = pushText(items, textX, y, p.note, SIZE.body, COLOR.text2, '400', {
      maxWidth: CONTENT_W - (textX - PAD)
    });
    y += 30;
  });

  // 结论
  const patterns = picked.map(function (h) { return getHookPattern(h.id); });
  const conclusion = conclusionFor(patterns);
  if (conclusion) {
    y += 4;
    items.push(line(PAD, y, DESIGN_WIDTH - PAD, y, COLOR.line, 2));
    y += 32;
    y = pushText(items, PAD, y, conclusion, SIZE.body + 2, COLOR.text, '500');
  }

  // 页脚
  y += 16;
  y = pushText(items, PAD, y, CARD_FOOTER, SIZE.tiny, COLOR.text3, '400');
  y += PAD;

  const height = y;

  // 底色垫在最底下（高度算完了才知道）
  items.unshift(rect(0, 0, DESIGN_WIDTH, height, { fill: COLOR.bg, radius: 0 }));

  return {
    width: DESIGN_WIDTH,
    height: height,
    items: items,
    count: picked.length,
    conclusion: conclusion
  };
}

module.exports = {
  DESIGN_WIDTH: DESIGN_WIDTH,
  PAD: PAD,
  CONTENT_W: CONTENT_W,
  MAX_IMAGE_H: MAX_IMAGE_H,
  COLOR: COLOR,
  SIZE: SIZE,
  isWideChar: isWideChar,
  charWidth: charWidth,
  measure: measure,
  wrapText: wrapText,
  lineHeight: lineHeight,
  baseline: baseline,
  imageBox: imageBox,
  conclusionFor: conclusionFor,
  pickHooks: pickHooks,
  buildCard: buildCard
};
