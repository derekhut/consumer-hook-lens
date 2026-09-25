/**
 * 直连 OpenAI 兼容端点（自己写 HTTPS，不引第三方包）。
 *
 * ── 为什么要有这条路 ──
 * 走云开发内置大模型要「标准版套餐 + 控制台开模型开关」，而且内置那批视觉模型
 * 实测读一张截图要 25 秒以上。直连外部模型既省掉套餐门槛，也快得多
 * （实测 qwen3.8-omni-flash 约 2.7 秒）。
 *
 * ── 为什么不装依赖 ──
 * 用 Node 自带的 https 模块，云端就**不用装依赖**（「上传并部署：云端安装依赖」
 * 这一步本身就是一个会失败的环节）。这个目录只打包自己，少一个依赖少一处变数。
 *
 * ── 三个环境变量（配在云函数控制台，不进代码、不进仓库）──
 *   MODEL_BASE_URL  端点前缀，如 https://dashscope.aliyuncs.com/compatible-mode/v1
 *   MODEL_API_KEY   Bearer 令牌（**唯一敏感的一项**）
 *   MODEL_NAME      模型名，如 qwen3.8-omni-flash
 * 三个都配齐，这条才生效；缺一个就整体不走这里（由调用方决定退回哪条路）。
 *
 * ── 可验证 ──
 * httpPost 是**注入**进来的，所以整条链路能在 Node 里离线跑：200 / 403 / 乱 JSON /
 * 超时 / 分段返回，都不必真的联网。这一条和 defense.js 注入 callModel 是同一个理由。
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const CHAT_PATH = '/chat/completions';

/**
 * 单次请求的超时。
 *
 * ⚠️ 这个数字是被两头夹出来的：函数超时上限是 60 秒，而换临时链接、抠 JSON、
 * 写日志都要占一点 —— 所以留到 45 秒，不是拍脑袋，也不是越大越好：
 * 给大了，请求还没回来函数先被平台掐掉，日志里什么都看不到。
 */
const DEFAULT_TIMEOUT_MS = 45000;

function readConfig(env) {
  const e = env || process.env;
  return {
    // 尾部斜杠去掉，免得拼出 /v1//chat/completions
    baseUrl: String(e.MODEL_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: String(e.MODEL_API_KEY || ''),
    model: String(e.MODEL_NAME || '')
  };
}

function isConfigured(config) {
  const c = config || {};
  return !!(c.baseUrl && c.apiKey && c.model);
}

function defaultHttpPost(urlString, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const target = new URL(urlString);
    const payload = JSON.stringify(body);
    const client = target.protocol === 'http:' ? http : https;

    const req = client.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: target.pathname + target.search,
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          headers
        )
      },
      function (res) {
        let data = '';
        res.on('data', function (chunk) { data += chunk; });
        res.on('end', function () { resolve({ statusCode: res.statusCode, body: data }); });
      }
    );

    req.on('error', function (err) { reject(err); });
    // 不设超时，一次卡死的网络请求会把整个函数耗光 —— 而那时日志里什么都不会有
    req.setTimeout(timeoutMs, function () {
      req.destroy(new Error('模型请求超时（' + timeoutMs + 'ms）'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 从响应体里取出模型说的话。
 *
 * 两种形状都要认：
 *   - content 是字符串（大多数模型）
 *   - content 是**数组**（omni 这类全模态模型会分段返回） —— 不处理就会拿到 undefined，
 *     然后被当成「模型没说话」，而实际上它说了。
 */
function extractContent(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error('模型返回的不是 JSON：' + String(body).slice(0, 200));
  }

  const choice = parsed && parsed.choices && parsed.choices[0];
  const message = choice && choice.message;
  let content = message && message.content;

  if (Array.isArray(content)) {
    content = content
      .map(function (part) {
        return part && typeof part.text === 'string' ? part.text : '';
      })
      .join('');
  }

  if (typeof content !== 'string') {
    throw new Error('模型返回里没有文本内容：' + String(body).slice(0, 200));
  }
  return content;
}

/**
 * 造一个 callModel，形状和 defense.js 要求的一致：(attempt) => Promise<string>。
 *
 * @param {object} options
 * @param {object} options.config      { baseUrl, apiKey, model }，默认读环境变量
 * @param {string} options.prompt      提示词全文
 * @param {string} options.imageUrl    图片的公网地址
 * @param {function} [options.httpPost] 注入用，测试里替换掉真实网络
 * @param {number}  [options.timeoutMs]
 */
function createHttpCallModel(options) {
  const opts = options || {};
  const config = opts.config || readConfig(opts.env);
  const httpPost = opts.httpPost || defaultHttpPost;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const prompt = opts.prompt || '';
  const imageUrl = opts.imageUrl || '';

  return function callModel(attempt) {
    if (!isConfigured(config)) {
      return Promise.reject(new Error('未配齐 MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME 三个环境变量'));
    }

    const body = {
      model: config.model,
      temperature: 0.2,
      max_tokens: 1600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    };

    return httpPost(config.baseUrl + CHAT_PATH, { Authorization: 'Bearer ' + config.apiKey }, body, timeoutMs).then(
      function (res) {
        // 403 在现实里最常见的意思是「免费额度用尽 / 没开付费」。
        // 状态码必须进错误信息 —— 只看「调用失败」四个字，谁也猜不到是额度问题。
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error('模型返回状态码 ' + res.statusCode + '：' + String(res.body).slice(0, 300));
        }
        return extractContent(res.body);
      }
    );
  };
}

module.exports = {
  CHAT_PATH: CHAT_PATH,
  DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
  readConfig: readConfig,
  isConfigured: isConfigured,
  defaultHttpPost: defaultHttpPost,
  extractContent: extractContent,
  createHttpCallModel: createHttpCallModel
};
