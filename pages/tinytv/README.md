# TinyTV

访问 `/pages/tinytv/`，观看按固定时间线循环播放的频道。依赖[网站公共认证](../../login/README.md)和[TinyTV 后端](https://github.com/cloverfrog/cloverfrog.github.io-backend/blob/main/modules/tinytv/README.md)。

## 使用

登录后显示当前节目、下一节目和循环节目单。点击“进入频道”开始播放，进度跟随后端频道时间，不从头播放。频道尚未开播时显示开播时间。

点击“全屏”进入全屏播放；操作栏静置 2.5 秒后隐藏，移动指针、触屏或键盘操作时显示。视频能否播放取决于浏览器对源视频编码的支持，尤其需要确认 H.265 支持情况。

## 开发与依赖

`player.js` 负责播放、时间校准和全屏交互，`style.css` 维护本模块样式。页面调用同源 `/api/tinytv/*` 查询节目与播放，前端不保存 AList 地址或源文件路径。

节目编排、媒体源配置、接口和视频代理说明见后端模块 README；本地启动见[网站 README](../../README.md)。修改前端脚本后可在本目录检查语法：

```bash
node --check player.js
```

联调时验证当前进度播放、节目切换、全屏操作和登录过期处理。真实播放验证需要配置可访问的媒体源。
