/**
 * 产品名的唯一来源（JS 侧）。
 *
 * 现在这个名是**暂用**的。它不只是个字符串 —— **小程序名称全平台唯一**，
 * 定不下来就没法注册，所以它卡着阶段 0 的最后一步。
 * 备选：先看清 / 买之前（暂用名「看清消费」偏口号，读起来像标语不像产品名）。
 *
 * 改名字要动的地方**只有两处**：
 *   1. 这个文件
 *   2. app.json 的 window.navigationBarTitleText
 *      （app.json 是纯 JSON，import 不进来，这一处只能硬编码 —— 整个项目唯一
 *       允许重复的地方，改完记得两边对一遍）
 *
 * 检查脚本会读这里，并在 README 里被提到，不会散落到别处。
 */

const APP_NAME = '看清消费';

/** 卡片底部那行小字。它不出现在小程序界面上，只在分享出去的图片里 */
const CARD_FOOTER = '把诱导多花钱的设计，一个个认出来';

/** 转发时好友看到的那句话 */
const SHARE_TITLE = '这张图里，有几处是在催你下单？';

module.exports = {
  APP_NAME: APP_NAME,
  CARD_FOOTER: CARD_FOOTER,
  SHARE_TITLE: SHARE_TITLE
};
