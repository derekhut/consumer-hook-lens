const { APP_NAME } = require('./utils/brand');

App({
  globalData: {
    // 产品名从这里读，别再写一遍字面量 —— 改名字只改 utils/brand.js
    // （app.json 的标题是唯一改不掉的第二处，见 brand.js 的说明）
    appName: APP_NAME
  }

  // 云开发初始化在阶段 7 加上：
  // wx.cloud.init({ env: <环境 ID>, traceUser: true })
  // 环境 ID 不是密钥，写在客户端是正常的；真正的 API Key 只放云函数环境变量。
});
