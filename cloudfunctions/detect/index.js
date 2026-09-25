/**
 * 识别云函数：截图的 fileID 进去，一组原始标注出来。
 *
 * 这里刻意**只做三件事**：换临时链接、问模型、跑防御。
 * 「问模型」有两条路（内置 / 直连），选哪条由有没有配那三个环境变量决定 ——
 * 两条路的**返回形状完全一样**，所以后面的防御和界面都不知道（也不该知道）走了哪条。
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
const { createHttpCallModel, readConfig, isConfigured } = require('./lib/model-http');
const { createImageLoader } = require('./lib/image');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 提供商与模型名只写这两处。
 *
 * PROVIDER = 'cloudbase'（云开发内置模型，当前环境就能用，不用升级标准版）。
 * 第三方自定义提供商（如阿里云百炼）要升级标准版才能接入，**暂不采用**；
 * 以后若升级了，把这里改成控制台的提商标识（如 'custom-dashscope'）即可，其余代码不动。
 *
 * MODEL = **glm-5.3-flash**（已定，2026-09-22）。
 * 选型：控制台「生文模型 → 视觉理解」筛出来的三个里（glm-5.3-flash / kimi-k3 / kimi-k2.8-preview），
 * 它最便宜（输入 800 / 输出 2.8k 资源点·百万tokens）、flash 档快 —— 读促销截图不需要更大的模型。
 * ⚠️ 前提：控制台里该模型的**状态开关已打开**（不开的模型调不通）。
 * 纯文本模型（如 hy3）收图会被忽略或报错 —— 表现是「云函数成功返回，但一条标注都没有」，
 * 很容易被误判成「模型看不出问题」。
 */
const PROVIDER = 'cloudbase';
const MODEL = 'glm-5.3-flash';

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

  const prompt = buildDetectPrompt();

  // ── 先把图取到手里，再问模型 ──
  //
  // 之前是直接把临时链接交给模型，结果**两次都在 20 秒整超时**（日志里能看到）。
  // 传链接等于让模型服务商去跨云下载腾讯的图 —— 那一段慢起来，我们这边只看到超时，
  // 分不清是「它在下载」还是「它在想」。
  // 现在自己下载（图就在云开发存储里，内网，快），把字节直接发过去，中间那一跳就没了。
  //
  // 两段**分开计时**并打进日志：下次再卡，一眼就知道是卡在取图还是卡在问模型。
  const tImage = Date.now();
  const loaded = await createImageLoader({
    downloadFile: async function (id) {
      const res = await cloud.downloadFile({ fileID: id });
      return res && res.fileContent;
    }
  })(fileID);

  let image = imageUrl;
  if (loaded) {
    image = 'data:' + loaded.mime + ';base64,' + loaded.base64;
    console.log(
      '[detect] 图已取到：' + Math.round(loaded.bytes / 1024) + 'KB，耗时 ' + (Date.now() - tImage) + 'ms'
    );
  } else {
    // 退路：链接这条路已知会慢，但至少还能出结果 —— 留一句 warn，别让它悄悄发生
    console.warn('[detect] 图没取到，退回临时链接（这条路已知会慢）');
  }

  // 问模型有两条路：配齐了 MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME 就直连，
  // 否则走云开发内置大模型。
  //
  // 这个判断放在**入口**而不是塞进 lib/，是因为它还决定了下面「60 秒怎么分」——
  // 那是只有这里知道的事（函数超时上限），lib/ 那几个文件不该掺和。
  const httpConfig = readConfig(process.env);
  const useHttp = isConfigured(httpConfig);

  let callModel;
  let maxAttempts;

  if (useHttp) {
    //
    // ── 为什么是「1 次、55 秒」而不是「2 次、20 秒」──
    // 之前那套（2×20 秒）实测两次都在 20 秒整被打断、一个字节没收到。
    // 根因不是网络，是模型默认开深度思考：非流式要等思考全部生成完才返回，
    // 本地实测 18.1 秒（关掉思考后 2.5 秒）。20 秒的绳子正好卡在它脖子上 ——
    // 重试一次只是再卡一次，两次用完仍然什么都没有。
    // 现在关掉思考（见 lib/model-http.js 文件头），单次 2.5–4 秒，
    // 所以把 60 秒的预算**整段押在一次调用上**，不再重试：慢到 55 秒的情况，
    // 重试也不可能更快，重来一次只是把失败延后。
    //
    // 请求超时给 55 秒而不是写满 60：60 秒是**平台掐掉函数**的时限，
    // 真卡到那一刻，函数被杀、日志里一行都没有 —— 留 5 秒给收尾，
    // 至少能把「模型请求超时」这句话写进日志再返回。
    console.log('[detect] 走直连：' + httpConfig.model + '，思考=' + httpConfig.reasoningEffort);
    callModel = createHttpCallModel({
      config: httpConfig,
      prompt: prompt,
      image: image,
      timeoutMs: 55000
    });
    maxAttempts = 1;
  } else {
    console.log('[detect] 走云开发内置：' + MODEL);
    // 凭证由云开发控制台保管（添加提供商时填的 API Key），代码里不出现任何 Key
    const app = tcb.init({
      env: tcb.SYMBOL_CURRENT_ENV,
      // ⚠️ SDK 的请求超时默认只有 15 秒，实测 glm-5.3-flash 读一张截图要 25 秒以上。
      // 函数上限是 60 秒（1~60），塞不下两次 27 秒的重试 —— 所以单次直接给 55 秒，
      // 重试层关掉（maxAttempts: 1），把预算全部押在一次完整的模型调用上。
      timeout: 55000
    });
    const ai = app.ai();
    const model = ai.createModel(PROVIDER);
    callModel = async function () {
      const res = await model.generateText({
        model: MODEL,
        // 注：试过给 glm 传 thinking:{type:'disabled'} 关深度思考，网关不认识该字段直接 400，
        // 已撤。慢的问题靠压小图片 + （备选）换模型解决。
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: image } }
            ]
          }
        ]
      });
      return res && res.text;
    };
    maxAttempts = 1;
  }

  // 给每次模型调用记个耗时。
  // 之前排那次「两次都在 20 秒整超时」，日志里只有「超时」两个字，看不出卡在哪一段 ——
  // 有了这个数字，下次能直接分清是「它在下载图」还是「它在推理」。
  const inner = callModel;
  callModel = async function (attempt) {
    const t = Date.now();
    let ok = true;
    try {
      return await inner(attempt);
    } catch (err) {
      ok = false;
      throw err;
    } finally {
      console.log(
        '[detect] 第 ' + attempt + ' 次模型调用：' + (Date.now() - t) + 'ms，' + (ok ? '成功' : '失败')
      );
    }
  };

  const result = await runDetect({
    callModel: callModel,
    maxAttempts: maxAttempts,
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
