# Scratchpad（手动保存版）

访问 `/pages/scratchpad/`。无构建步骤，普通 PocketBase 用户登录。

- 输入不会自动保存。点击“保存”或按 Ctrl/Cmd+S，才将当前草稿提交云端；未保存修改显示 `*` 和“未保存”。中文组合输入期间忽略快捷键。
- 其他设备的保存通过“刷新列表”读取；不轮询、不自动上传，不检测版本冲突。同一草稿同时编辑，以最后一次手动保存为准。
- 保留新建、切换、重命名、复制全文、完成及 8 秒撤销。Ctrl/Cmd+Enter 只复制，不保存、不完成。
- 刷新/退出有未保存修改时浏览器会提示。未点击保存的输入只在当前页面内存中，不承诺刷新或关闭后恢复。
- 手动保存时会写一份 IndexedDB 恢复缓存；网络保存失败后可手动重试，重开也可恢复这次保存时的文本。此前自动保存版留下的本机未同步草稿也会读取，缓存也按最后一次手动保存保留 3 天。
- 保存期间继续输入，后续修改仍标记未保存；新建请求响应丢失后，下一次手动重试复用同一记录 ID，避免重复创建。

## PocketBase 配置

### 文件速传

页面新增独立文件区，与草稿内容分别管理。选择文件后点击“上传”，另一设备同账号登录并点击“刷新文件”即可下载。支持多选后逐个上传，单文件 50 MB；上传满 3 天后自动清理，也可手动删除。上传显示发送百分比、已发送大小，发送完成后显示“等待服务器确认”，并支持取消上传。文件上传不触发正文保存。暂不支持断点续传或自动重试，传输中关闭页面会有提示；取消或超时不保证服务器尚未保存，结果不确定时先刷新文件列表，避免重复上传。普通列表请求 15 秒超时，上传/下载 5 分钟超时。

文件存储使用 PocketBase 原生 File 字段，默认在服务器 `pb_data/storage`，不写入 Git 或主站静态目录；服务器磁盘和带宽决定总容量。参考官方 [文件处理说明](https://pocketbase.io/docs/files-handling/)。

现有 users 不变，新增 Base Collection `scratchpad_files`，配置如下：

| 字段 | 配置 |
| --- | --- |
| owner | Relation → users，必填，单值 |
| file | File，必填，Max Files = 1，Max Size = 52428800 bytes（50 MB），**Protected 开启**，类型不限制 |
| originalName | Text，必填，Max 1024，保留原文件名用于下载 |
| size | Number，必填，整数，Min 1，Max 52428800 |
| created | Autodate，On Create |
| updated | Autodate，On Create + On Update |

文件集合 API Rules：List / View / Delete 为 `@request.auth.id != "" && owner = @request.auth.id`；Create 为 `@request.auth.id != "" && @request.body.owner = @request.auth.id`；Update 保持 locked。**必须同时启用 Protected 与 owner 的 View 规则**，否则知道 URL 的其他人可能读取文件。下载通过标准 `POST /api/files/token` 取短期文件 token，再下载原始内容；不把登录 token 放进 URL，不提供公开分享入口。

部署者可在 PocketBase 后台完成上述配置，无需部署自定义 API 或改 Caddy 路由。若已有代理上传体积/时间限制，确认允许 50 MB 加 multipart 开销；前端传输超时为 5 分钟，超时后需手动重试。文件随记录删除；备份时包含数据库和 storage 两部分。

以下为集合配置参考；本次自动清理仅修改前端源码，未发布页面。浏览器模拟测试验证上传、原文件名下载和字节一致、刷新、删除、账号切换清空列表及手机布局；上线后还需用真实账号确认上传和 Protected 文件跨账号不可下载。

只使用标准 `/api/collections/scratchpads/records` 的 GET/POST/PATCH/DELETE。**不需要 pb_hooks、自定义 API、版本号、回执集合或新服务。** 旧的自定义 API 与自动同步代码已移除。保留现有 users、scratchpads 和数据，不删除集合。

在现有 PocketBase 管理后台编辑 scratchpads → API Rules：

| 规则 | 表达式 |
| --- | --- |
| List / View / Delete | `@request.auth.id != "" && owner = @request.auth.id` |
| Create | `@request.auth.id != "" && @request.body.owner = @request.auth.id` |
| Update | `@request.auth.id != "" && owner = @request.auth.id && @request.body.owner:changed = false` |

不要留为 locked，也不要设成无条件公开的空字符串。规则依据 PocketBase 官方 [API Rules](https://pocketbase.io/docs/api-rules-and-filters/)；owner 只能是当前普通用户，更新时不能转移所有权。

字段配置：owner 为指向 users 的必填单值关系；title 为 Text、最大 500；content 为 Text、最大 2000000；created/updated 沿用 Autodate。**若已有 version 字段，取消 Required，将 Min 设为 0 即可；不用删除字段或已有值。** users 的 Create 仍设为 locked，普通账号手动创建，不开放注册。

已有集合无需为自动清理新增字段、迁移或服务配置。

## 发布

当前服务器 `/opt/pocketbase/pocketbase` 0.39.9，主站 `/srv/web`，现有 Caddy 可直接提供本模块。完成上述权限和字段配置后，从仓库根目录上传：

```powershell
scp -i ~/.ssh/aliyun_rsa -r pages/scratchpad root@39.106.231.121:/srv/web/pages/
```

无需修改 Caddy 或部署 hooks。若曾经安装过 scratchpad.pb.js，只移走这一功能的旧 hook 并重启 PocketBase，不动其他扩展；当前只读检查发现线上尚无此 hook。API 地址在 config.js，更换域名时同步修改 index.html CSP。服务端 origins 应允许实际主站来源，CORS 不能替代权限规则。

本轮未执行线上配置或发布。发布后强制刷新页面资源，避免旧 app.mjs 仍调用 `/api/scratchpad/write`；不要清除站点数据，以免丢掉旧版本机草稿。

## 验证

浏览器测试用模拟的标准 REST API，不启动本地 PocketBase。设置已安装 Playwright 的入口和浏览器：

```powershell
$env:PLAYWRIGHT_PATH = 'C:\path\to\node_modules\playwright\index.mjs'
$env:BROWSER_CHANNEL = 'msedge'
node --test tests/scratchpad-retention.test.mjs tests/scratchpad.test.mjs
```

覆盖无自动上传、Ctrl+S、组合输入、复制独立、保存中继续输入、403 不误报过期、手动重试、缓存恢复、完成撤销与账号隔离。未设置 PLAYWRIGHT_PATH 会显示 skipped，不能当作通过。

线上还需用普通账号实际验证：新建保存、刷新恢复、另一设备登录读取、修改保存、完成删除；确认账号 A 不能读写 B 的记录，未登录不能读写。模拟测试不能替代线上权限验收。

## 3 天自动清理

无需后台定时任务或自定义 API。登录/打开页面、刷新草稿时清理当前账号最后保存已满 72 小时的云端草稿；登录、刷新文件、上传前清理上传已满 72 小时的文件。使用普通用户的标准 REST DELETE 权限，删除前重新读取时间，避免按旧列表删除已保存的内容。文件记录删除后其附件由 PocketBase 处理。

正在编辑或等待保存的草稿暂时保留，手动保存成功后重新计时。复制、下载不会续期。没有人打开页面时不会执行清理，到下次使用时才删除；不是精确到点删除。多个设备仍存在读取与删除之间的极短竞争窗口，沿用简单的手动保存方案。

手动保存的 IndexedDB 恢复副本也保留 72 小时，在打开页面或刷新时清理。旧版本没有缓存时间的副本，从首次使用此版本开始获得一次 3 天保留期。未保存输入仍只在当前页面内存中。清理使用设备时钟，应保持系统时间正确。

网络或权限导致删除失败时保留记录，下次操作重试；页面显示失败数量。只清理当前账号，仍需正确设置上述 owner 权限。服务器备份不在前端清理范围内。本轮无需修改或重启 PocketBase/Caddy；发布静态文件后生效，尚未执行线上发布。
