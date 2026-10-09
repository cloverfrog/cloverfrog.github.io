# AGENTS.md

## 项目约束

- `Pages/` 下每个目录都是独立模块。修改某个模块时，不要改动其他模块，除非任务明确要求。
- 不要因为新增或修改模块而顺手修改根目录 `README.md`。
- 不要为了“登记新模块”而自动修改首页、根目录公共资源或其他无关文件，除非任务明确要求。
- 保持项目简单。没有明确需求时，不要主动引入统一框架、构建系统或跨模块抽象。

## 资源

- `/resources/` 不提交 Git，本地可用于开发和调试。
- 线上 `/resources/*` 对应服务器目录 `/srv/resources/`。
- 大文件应放在 `resources`，不要提交到 Git。

## PocketBase

项目可使用服务器上的 PocketBase：

```text
https://pocketbase.cloverfrog.xyz
```

服务器内部运行于：

```text
127.0.0.1:8090
```

由 Caddy 反向代理到上述子域名。

- 可以通过 PocketBase API 为网站模块提供数据存储、认证等功能。
- 不要把管理员凭据、token、密码或其他敏感信息写入 Git。
- 不要主动修改 PocketBase collection/schema 或服务器实例配置，除非任务明确要求。

## 云服务器

需要访问云服务器时，请在经过我的批准后在已经配置好 `~/.ssh/config` 的机器上使用：

```bash
ssh aliyun
```

线上主要目录：

```text
/srv/web        # 网站 Git 工作目录
/srv/resources  # 不进入 Git 的大文件资源
```

主站：

```text
https://cloverfrog.xyz
```

Caddy 当前负责：
- `/srv/web` 的静态网站服务；
- `/resources/*` → `/srv/resources/`；
- `pocketbase.cloverfrog.xyz` → `127.0.0.1:8090`；
- 其他独立服务的反向代理。

除非任务确实需要，否则不要主动修改服务器配置、重启服务或 reload Caddy。访问云服务器前，请确保已获得我的批准。