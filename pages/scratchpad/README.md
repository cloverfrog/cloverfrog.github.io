# Scratchpad

访问 `/pages/scratchpad/`，使用普通 PocketBase 账号登录，无需构建。

## 使用

- **手动保存**：点击“保存”或按 Ctrl/Cmd+S 上传草稿；未保存修改显示 `*` 和“未保存”。未保存输入仅存在当前页面内存中，刷新或关闭后可能丢失。
- **跨设备读取**：点击“刷新列表”获取其他设备保存的草稿。不自动同步、不检测冲突，同时编辑以最后一次保存为准。
- **草稿操作**：支持新建、切换、重命名、复制全文、完成及 8 秒撤销。Ctrl/Cmd+Enter 仅复制全文。
- **恢复缓存**：手动保存时写入 IndexedDB，网络失败后可重试或重新打开恢复；兼容旧版本遗留的本机未同步草稿。保存期间继续输入的内容仍需再次保存。
- **文件速传**：独立于正文保存，支持多选逐个上传，单文件最大 50 MB。同账号在其他设备点击“刷新文件”后即可下载，也可手动删除。

上传显示进度并支持取消，不支持断点续传或自动重试。取消或超时后，先刷新文件列表确认结果，避免重复上传。普通请求超时为 15 秒，上传/下载为 5 分钟。

## 3 天清理

草稿从最后一次保存、文件从上传开始保留 72 小时；复制和下载不续期。页面在登录、打开或刷新时清理当前账号的过期数据，上传前也会清理过期文件。无人使用页面时不执行清理，因此并非到点立即删除。

正在编辑或等待保存的草稿暂时保留，保存成功后重新计时。IndexedDB 恢复缓存同样保留 72 小时；旧版无时间记录的缓存从首次使用此版本起计时。清理依赖设备时钟，失败会显示数量并在后续操作重试。服务器备份不在清理范围内。

## PocketBase 配置

API 地址在 `config.js`，默认 `https://pocketbase.cloverfrog.xyz`。使用标准 REST API，无需自定义 API、hooks 或后台定时任务。普通账号由管理员创建，`users` 的 Create 规则保持 locked。

### 草稿集合 `scratchpads`

| 字段 | 配置 |
| --- | --- |
| owner | Relation → users，必填，单值 |
| title | Text，最大 500 |
| content | Text，最大 2000000 |
| created / updated | Autodate，分别在创建 / 创建及更新时写入 |

若已有 `version` 字段，取消 Required、Min 设为 0，无需删除字段或已有数据。

| API Rule | 表达式 |
| --- | --- |
| List / View / Delete | `@request.auth.id != "" && owner = @request.auth.id` |
| Create | `@request.auth.id != "" && @request.body.owner = @request.auth.id` |
| Update | `@request.auth.id != "" && owner = @request.auth.id && @request.body.owner:changed = false` |

### 文件集合 `scratchpad_files`

创建 Base Collection：

| 字段 | 配置 |
| --- | --- |
| owner | Relation → users，必填，单值 |
| file | File，必填，Max Files = 1，Max Size = 52428800 bytes，**Protected 开启**，类型不限 |
| originalName | Text，必填，最大 1024 |
| size | Number，必填，整数，Min 1，Max 52428800 |
| created / updated | Autodate，分别在创建 / 创建及更新时写入 |

List / View / Delete、Create 规则与草稿集合相同，Update 保持 locked。**必须同时开启 Protected 并设置 owner 的 View 规则**。下载通过 `POST /api/files/token` 获取短期文件 token，不提供公开分享。

文件默认存储在 PocketBase 的 `pb_data/storage`，随记录删除；备份需包含数据库和 storage。总容量取决于服务器磁盘和带宽。

配置参考：[API Rules](https://pocketbase.io/docs/api-rules-and-filters/)、[文件处理](https://pocketbase.io/docs/files-handling/)。