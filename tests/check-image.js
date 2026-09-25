/**
 * 取图那一小段（lib/image.js）。
 *
 * 为什么要为这么点代码单开一个套件：它站在「云函数 → 模型」这条链的最前面，
 * 一旦取不到图，后面整条链都会走样（要么退回那条已知会慢的链接，要么直接失败）。
 * 而它又是「没界面」的 —— 只能靠脚本。
 *
 * downloadFile 是注入的，所以「取到 / 取到空 / 抛错」都能离线验。
 */

const { createSuite } = require('./harness');
const { createImageLoader, DEFAULT_MIME } = require('../cloudfunctions/detect/lib/image');

const suite = createSuite('check-image.js');

function bufferOf(text) {
  return Buffer.from(text, 'utf8');
}

async function main() {
  // 正常取到
  {
    const load = createImageLoader({
      downloadFile: async function () { return bufferOf('hello'); }
    });
    const got = await load('cloud://abc.png');
    suite.eq('取到图时转成 base64', got.base64, Buffer.from('hello', 'utf8').toString('base64'));
    suite.eq('统一按 jpeg 交给模型（模型认内容，不认文件名）', got.mime, DEFAULT_MIME);
    suite.eq('顺便报出字节数（日志里要打大小）', got.bytes, 5);
  }

  // 取到的东西是空的
  {
    const load = createImageLoader({ downloadFile: async function () { return bufferOf(''); } });
    suite.eq('空 Buffer 当作没取到（不能拿着空图去问模型）', await load('x'), null);

    const load2 = createImageLoader({ downloadFile: async function () { return null; } });
    suite.eq('返回 null 也当作没取到', await load2('x'), null);
  }

  // 下载抛错：不能把整条调用带崩
  {
    const load = createImageLoader({
      downloadFile: async function () { throw new Error('file not exist'); }
    });
    let got;
    try {
      got = await load('x');
    } catch (err) {
      got = 'THREW';
    }
    suite.eq('下载抛错时返回 null，让调用方决定退路（不抛）', got, null);
  }

  // 没注入 downloadFile
  {
    const load = createImageLoader({});
    suite.eq('没给 downloadFile 时返回 null', await load('x'), null);
    const load2 = createImageLoader();
    suite.eq('什么都没传时也返回 null', await load2('x'), null);
  }

  // 二进制内容不能被当成字符串改写（base64 必须可逆）
  {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 10, 13]);
    const load = createImageLoader({ downloadFile: async function () { return bytes; } });
    const got = await load('x');
    suite.eq(
      '二进制内容原样编码（换回去必须一模一样）',
      Buffer.from(got.base64, 'base64').toString('hex'),
      bytes.toString('hex')
    );
  }

  suite.done();
}

main().catch(function (err) {
  console.error('check-image.js 自己崩了：', err);
  process.exit(1);
});
