/**
 * 识别云函数：截图的 fileID 进去，一组原始标注出来。
 *
 * 这里刻意**只做三件事**：换临时链接、问模型、跑四层防御。
 * 剩下的判断（白名单、坐标、置信度、去重、上限）全部交给客户端的
 * utils/detect-parse.js —— 那份代码客户端本来就有，而云函数上传时
 * **只打包自己这个目录**，require 不到上级的 utils/。与其在这里放一份副本
 * （两份必漂），不如把职责切干净：云函数管「看得见」，客户端管「信不信」。
 *
 * 注意：这个文件里的任何东西都没办法在本地跑起来（要云环境、要模型），
 * 所以它必须薄到「一眼看完就敢信」。真正的逻辑都在 lib/ 里，那些是有测试的。
 */

const cloud = require('wx-server-sdk');
const tcb = require('@cloudbase/node-sdk');

const { runDetect } = require('./lib/defense');
const { buildDetectPrompt } = require('./lib/prompt');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 模型名只写这一处。
 *
 * ⚠️ **必须选支持图片输入的模型**。云开发里免费的体验模型（混元 hy3）是纯文本模型，
 * 传图片进去会被忽略或直接报错 —— 表现是「云函数成功返回，但一条标注都没有」，
 * 很容易被误判成「模型看不出问题」。可用的多模态模型：
 * glm-5v-turbo / qwen3.5-plus / kimi-k2.6 / kimi-k2.5。
 */
const MODEL = 'glm-5v-turbo';

exports.main = async function (event) {
  const fileID = event && event.fileID;
  if (!fileID || typeof fileID !== 'string') {
    // 参数不对是调用方的错，说清楚，别让它变成一次莫名其妙的模型调用
    return { source: 'fallback', annotations: [], failed: true, reason: 'no-file-id' };
  }

  let imageUrl;
  try {
    const res = await cloud.getTempFileURL({ fileList: [fileID] });
    const file = res.fileList && res.fileList[0];
    if (!file || !file.tempFileURL) {
      console.error('[detect] 拿不到临时链接', res);
      return { source: 'fallback', annotations: [], failed: true, reason: 'no-temp-url' };
    }
    imageUrl = file.tempFileURL;
  } catch (err) {
    console.error('[detect] 取临时链接失败', err);
    return { source: 'fallback', annotations: [], failed: true, reason: 'temp-url-failed' };
  }

  // 凭证由云函数环境自动注入，不需要在代码里放任何 Key
  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
  const ai = app.ai();
  const model = ai.createModel('cloudbase');
  const prompt = buildDetectPrompt();

  const result = await runDetect({
    callModel: async function () {
      const res = await model.generateText({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ]
      });
      return res && res.text;
    },
    log: function (level, message, detail) {
      if (level === 'error') console.error('[detect] ' + message, detail || '');
      else console.warn('[detect] ' + message, detail || '');
    }
  });

  // 只回 source 与原始数组。界面文案由客户端按 source 决定 ——
  // 这里再生成一份文案，就是同一件事写两遍了
  return {
    source: result.source,
    annotations: result.annotations,
    attempts: result.attempts,
    failed: result.failed,
    reason: result.reason
  };
};
