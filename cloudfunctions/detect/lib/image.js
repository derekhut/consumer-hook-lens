/**
 * 把图从云存储取出来，转成模型能吃的形状。
 *
 * ── 为什么非要多这一步 ──
 * 把「临时链接」交给模型看着更省事，但实测那样会**卡死**：云函数两次都在 20 秒整超时，
 * 对端一个字没回。原因是传链接等于让模型服务商去跨云下载腾讯的图，那一段慢起来
 * 我们这边只看到「超时」，分不清是下载慢还是推理慢。
 *
 * 自己下载完再发字节，中间就没有「对端还要去别处取图」这一跳了 ——
 * 而且图本来就在云开发存储里，云函数取它属于内网，快。
 *
 * ── 可验证 ──
 * downloadFile 是注入的，所以「取不到图 / 取到空 / 取到正常」都能离线验，
 * 不必真的往云存储里传一张图。
 */

/** 云开发下载下来的是 Buffer，统一按 jpeg 交给模型（模型认内容，不认文件名） */
const DEFAULT_MIME = 'image/jpeg';

/**
 * 造一个取图函数。
 *
 * @param {object} options
 * @param {function} options.downloadFile  (fileID) => Promise<Buffer>，注入以便离线测
 * @returns {(fileID: string) => Promise<{base64: string, mime: string, bytes: number}|null>}
 *
 * 取不到一律返回 **null**，不抛 —— 让调用方决定是退回传链接，还是直接说明失败。
 * 抛出去的话，一个「图没传上来」的小问题会把整条调用带崩。
 */
function createImageLoader(options) {
  const opts = options || {};
  const downloadFile = opts.downloadFile;

  return async function loadImage(fileID) {
    if (typeof downloadFile !== 'function') return null;
    let buffer;
    try {
      buffer = await downloadFile(fileID);
    } catch (err) {
      return null;
    }
    if (!buffer || !buffer.length) return null;
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mime: DEFAULT_MIME,
      bytes: buffer.length
    };
  };
}

module.exports = {
  DEFAULT_MIME: DEFAULT_MIME,
  createImageLoader: createImageLoader
};
