const { APP_NAME } = require('./utils/brand');

/**
 * 云开发环境 ID：只在这一处配置。
 * 环境 ID 不是密钥，写在客户端是正常的；真正的模型凭证由平台托管。
 * （真实环境 ID，来自云开发控制台 → 环境信息）
 */
const CLOUD_ENV = 'cloud1-d8gwiynhc694725d6';

App({
  globalData: {
    // 产品名从这里读，别再写一遍字面量 —— 改名字只改 utils/brand.js
    // （app.json 的标题是唯一改不掉的第二处，见 brand.js 的说明）
    appName: APP_NAME
  },

  onLaunch: function () {
    if (!wx.cloud) {
      // 基础库过低时没有 wx.cloud。不弹窗打断启动：
      // 第四屏走到云调用时会自己发现并给出诚实的失败态。
      console.error('[app] 当前基础库不支持云开发，第四屏将不可用');
      return;
    }
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true
    });
  }
});
