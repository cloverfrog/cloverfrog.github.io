# cloverfrog 个人网站

普通静态网站，一个 Git 仓库管理首页与各模块，不需要构建步骤。

```text
index.html                  首页
assets/                     首页样式
Pages/flash_games/          自治的小游戏模块
  assets/config.js          游戏资源地址配置
  data/games.json           游戏清单（随 Git 同步）
Data/                       大资源（不随 Git 同步）
  flash_games/
    twin-stars/
      twin-stars.swf
      twin-stars.jpg
    ...
```

## 游戏资源迁移

把旧服务器 `FlashGames/` 内的各游戏目录复制到站点根目录的 `Data/flash_games/`，保留内部文件和目录结构。整个游戏目录一起迁移，以便 SWF 引用的其他文件也能加载。仓库不包含这些资源。

默认资源入口为同源 `/Data/flash_games/`，在 `Pages/flash_games/assets/config.js` 中修改 `gameBase` 即可切换资源位置。若暂未搬运资源，可将它设回旧地址 `https://39.106.231.121/FlashGames/`；该地址的证书和跨域访问须可用。页面本身使用模块内相对路径。

访问首页 `/`，小游戏列表 `/Pages/flash_games/`。本地预览应从仓库根目录启动静态 HTTP 服务，例如 `python -m http.server 8080`，再打开 `http://localhost:8080/`。不要直接双击 HTML，游戏清单需要通过 HTTP 加载。

## 存档

迁移域名或游戏资源路径前，在旧站导出存档 JSON；迁移后从新站导入。备份会保留来源资源地址，导入时按新资源入口替换旧路径前缀。浏览器存档受来源和资源路径影响，不会仅因页面搬迁就自动跨域迁移；也可用 Ruffle 的存档管理器导入导出 `.sol` 或 `saves.zip`。

## 新增模块

在 `Pages/` 下新增独立目录，模块自行管理 HTML、CSS、JS，再在首页增加入口。首页无需承担模块的样式或运行依赖。

当前不修改 Caddy。`Data/` 应通过站点同源 URL 提供，后续需要防盗链时再配置；不要开启目录浏览。
