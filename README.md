# cloverfrog.github.io

cloverfrog 的个人网站源码。项目保持简单：一个 Git 仓库管理首页和各独立页面模块，不使用统一前端框架，也不要求模块共享样式或结构。

## 目录

```text
/
├── index.html        # 网站首页
├── assets/           # 首页资源
├── pages/           # 独立页面模块
└── resources/        # 本地调试用大文件，不提交 Git
```

`pages/` 下每个目录视为独立模块，模块应尽量自包含，避免与其他模块耦合。

## 资源

大文件不提交 Git。

本地开发时放在：

```text
/resources/
```

线上对应服务器目录：

```text
/srv/resources/
```

Caddy 将 `/resources/*` 映射到该目录，因此页面代码统一使用 `/resources/...` 访问资源。

## 部署

主站源码部署于：

```text
/srv/web
```

由 Caddy 提供静态文件服务。

项目原则：保持简单、模块独立、按实际需求逐步扩展，避免提前引入不必要的统一框架或复杂架构。