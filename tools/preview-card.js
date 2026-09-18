/**
 * 离线预览卡片 —— 开发工具，不参与小程序运行。
 *
 * 为什么需要它：卡片是 P0 的交付物，但它的**样子**（字有没有画歪、行距舒不舒服、
 * 框压不压住商品）在 Node 里断言不出来，只能看。而微信开发者工具要手动点半天，
 * 每次改排版都得重来一遍。
 *
 * 关键在于：这个工具**不重新实现渲染**，它把 `utils/canvas-draw.js` 的源码原样内联进
 * HTML，用的是和小程序页面同一份绘制代码。否则「预览好看、真机画歪」就白验了。
 *
 * 用法：
 *   node tools/preview-card.js            # 三段示例各出一张，堆在一个页面上
 *   node tools/preview-card.js 0 A1,B1    # 只出第一张示例、只标这两处
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const card = require(path.join(ROOT, 'utils/card'));
const { SHOTS } = require(path.join(ROOT, 'data/shots'));

/** 模拟一台 375pt 宽的手机，左右各留 16px */
const CSS_W = 375 - 32;

/**
 * 把 canvas-draw.js 的源码拿来内联。
 * 去掉 module.exports 那一段 —— 浏览器里不需要模块系统。
 */
function drawSource() {
  const src = fs.readFileSync(path.join(ROOT, 'utils/canvas-draw.js'), 'utf8');
  const cut = src.indexOf('module.exports');
  if (cut === -1) {
    throw new Error('canvas-draw.js 里找不到 module.exports，内联会带上不该有的代码');
  }
  return src.slice(0, cut).trim();
}

function dataUri(rel) {
  const p = path.join(ROOT, rel.replace(/^\//, ''));
  if (!fs.existsSync(p)) return '';
  const buf = fs.readFileSync(p);
  const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

/** 图片的真实宽高比。用 sips 问太麻烦，直接按示例图的实际尺寸读文件头 */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 里带着尺寸
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * 再出一份 SVG。
 *
 * 为什么要两份：HTML 那份是**给眼睛看真机效果**的（它内联了 canvas-draw.js，
 * 用的是页面同一份绘制代码）。SVG 这份是为了能**脱离浏览器**看一眼 ——
 * 微信开发者工具没开、浏览器自动化又太重的时候，SVG 能被任何工具直接打开或转成图片。
 *
 * 两者都只吃 plan，几何、颜色、字号全在 plan 里，所以不会各画一个样。
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function planToSvg(plan, imgSrc) {
  const anchor = { left: 'start', center: 'middle', right: 'end' };
  const parts = [];

  parts.push('<rect width="' + plan.width + '" height="' + plan.height + '" fill="#ffffff"/>');

  plan.items.forEach(function (it) {
    if (it.type === 'rect' && it.w > 0 && it.h > 0) {
      parts.push(
        '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '"' +
        (it.radius ? ' rx="' + it.radius + '"' : '') +
        ' fill="' + (it.fill || 'none') + '"' +
        (it.stroke ? ' stroke="' + it.stroke + '" stroke-width="' + (it.lineWidth || 1) + '"' : '') +
        '/>'
      );
      return;
    }
    if (it.type === 'circle') {
      parts.push('<circle cx="' + it.cx + '" cy="' + it.cy + '" r="' + it.r + '" fill="' + it.fill + '"/>');
      return;
    }
    if (it.type === 'line') {
      parts.push(
        '<line x1="' + it.x1 + '" y1="' + it.y1 + '" x2="' + it.x2 + '" y2="' + it.y2 +
        '" stroke="' + it.color + '" stroke-width="' + (it.lineWidth || 1) + '"/>'
      );
      return;
    }
    if (it.type === 'image') {
      parts.push(
        '<image href="' + imgSrc + '" x="' + it.x + '" y="' + it.y +
        '" width="' + it.w + '" height="' + it.h + '" preserveAspectRatio="none"/>'
      );
      return;
    }
    if (it.type === 'text') {
      // plan 里的 y 就是基线，SVG 默认也是基线对齐，直接照搬
      parts.push(
        '<text x="' + it.x + '" y="' + it.y + '" fill="' + it.color +
        '" font-size="' + it.size + '" font-weight="' + (it.weight || '400') +
        '" font-family="PingFang SC, sans-serif" text-anchor="' + (anchor[it.align] || 'start') + '">' +
        esc(it.text) + '</text>'
      );
      return;
    }
    console.log('  SVG 有不认识的图元：' + it.type);
  });

  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'viewBox="0 0 ' + plan.width + ' ' + plan.height + '" width="' + plan.width + '" height="' + plan.height + '">' +
    '<rect width="100%" height="100%" fill="#ffffff"/>' + parts.join('') + '</svg>';
}

function build() {
  const argShot = process.argv[2];
  const argIds = process.argv[3];

  const jobs = [];
  if (argShot !== undefined) {
    const i = Number(argShot);
    const shot = SHOTS[i];
    if (!shot) throw new Error('没有第 ' + argShot + ' 张示例');
    jobs.push({ shot: shot, ids: (argIds || shot.hooks.map(function (h) { return h.id; }).join(',')).split(','), label: '示例 ' + (i + 1) });
  } else {
    SHOTS.forEach(function (shot, i) {
      jobs.push({
        shot: shot,
        ids: shot.hooks.map(function (h) { return h.id; }),
        label: '示例 ' + (i + 1) + ' · ' + shot.appName + ' · ' + shot.mode
      });
    });
  }

  const blocks = [];
  const problems = [];

  jobs.forEach(function (job, index) {
    const file = path.join(ROOT, job.shot.image.replace(/^\//, ''));
    const size = jpegSize(fs.readFileSync(file));
    if (!size) throw new Error('读不出图片尺寸：' + job.shot.image);

    const plan = card.buildCard({
      shot: job.shot,
      revealed: job.ids,
      imageRatio: size.height / size.width
    });
    if (!plan) {
      problems.push(job.label + ' 排不出卡片');
      return;
    }

    blocks.push(
      '<section>\n' +
      '  <h2>' + job.label + '</h2>\n' +
      '  <p class="meta">画布 ' + plan.width + ' × ' + plan.height +
      '（宽高比 1 : ' + (plan.height / plan.width).toFixed(2) + '）· 共 ' + plan.count +
      ' 处 · 计划里有 ' + plan.items.length + ' 个图元</p>\n' +
      '  <canvas id="c' + index + '"></canvas>\n' +
      '  <script>\n' +
      '    paintCard("c' + index + '", ' + JSON.stringify(plan) + ', ' + JSON.stringify(dataUri(job.shot.image)) + ');\n' +
      '  </script>\n' +
      '</section>'
    );

    // 顺带出一份 SVG，方便不开浏览器也能看一眼
    const svg = planToSvg(plan, dataUri(job.shot.image));
    const svgOut = path.join(ROOT, 'tools', 'preview-card-' + (index + 1) + '.svg');
    fs.writeFileSync(svgOut, svg);
    console.log('已生成 ' + path.relative(ROOT, svgOut) + '（' + plan.width + '×' + plan.height + '）');
  });

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>卡片预览</title>',
    '<style>',
    '  body { margin:0; padding:24px 0 48px; background:#f7f7f7;',
    '         font-family:"PingFang SC",-apple-system,sans-serif; color:#1a1a1a; }',
    '  section { display:flex; flex-direction:column; align-items:center; margin-bottom:40px; }',
    '  h2 { font-size:15px; font-weight:500; margin:0 0 4px; }',
    '  .meta { font-size:12px; color:#9a9a9a; margin:0 0 12px; }',
    '  canvas { background:#fff; border-radius:12px; box-shadow:0 2px 16px rgba(0,0,0,.08); }',
    '  .note { max-width:640px; margin:0 auto 32px; padding:0 24px; font-size:12px;',
    '          line-height:1.7; color:#6b6b6b; }',
    '</style>',
    '</head>',
    '<body>',
    '<p class="note">这张页面用和小程序页面**同一份**渲染代码（utils/canvas-draw.js 原样内联）' +
    '把 utils/card.js 排好的版画出来。改排版后重新跑一次就能看结果，不用开微信开发者工具。</p>',
    blocks.join('\n'),
    '<script>',
    drawSource(),
    '</script>',
    '<script>',
    // 这个常量必须一起注入：它是 Node 这边的，浏览器里没有
    'var CSS_W = ' + CSS_W + ';',
    'function paintCard(id, plan, imgSrc) {',
    '  var canvas = document.getElementById(id);',
    '  var cssH = CSS_W * plan.height / plan.width;',
    '  var dpr = window.devicePixelRatio || 2;',
    '  canvas.style.width = CSS_W + "px";',
    '  canvas.style.height = cssH + "px";',
    '  canvas.width = Math.round(CSS_W * dpr);',
    '  canvas.height = Math.round(cssH * dpr);',
    '  var ctx = canvas.getContext("2d");',
    '  ctx.scale(canvas.width / plan.width, canvas.height / plan.height);',
    '  var img = new Image();',
    '  img.onload = function () { drawPlan(ctx, plan, img, function (m) { console.error(m); }); };',
    '  img.onerror = function () { document.body.insertAdjacentHTML("beforeend",',
    '    "<p class=\\"note\\">有一张示例图没加载出来</p>"); };',
    '  img.src = imgSrc;',
    '}',
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  const out = path.join(ROOT, 'tools', 'preview-card.html');
  fs.writeFileSync(out, html);
  console.log('已生成 ' + path.relative(ROOT, out));
  if (problems.length) {
    console.log('有问题的：');
    problems.forEach(function (p) { console.log('  ' + p); });
  }
  jobs.forEach(function (job, i) {
    if (!problems.some(function (p) { return p.indexOf(job.label) === 0; })) return;
    console.log('  第 ' + i + ' 张：' + job.label);
  });
}

build();
