# MCP 服务器安装指南

## 1. Playwright（浏览器自动化）

用于网页操作、截图、自动化测试。

```bash
# 安装 Playwright MCP（无需额外配置）
npx @playwright/mcp@latest

# 测试是否可用
npx playwright install chromium
```

配置方式：在 `.claude/settings.json` 中设置 `"enableAllProjectMcpServers": true`，或在项目根目录创建 `.mcp.json`：

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest"]
  }
}
```

## 2. feishu-user-plugin（飞书集成）

用于飞书消息收发、文档管理、Bitable、日历等。

```bash
# 安装
npx feishu-user-plugin setup --app-id 你的APP_ID --app-secret 你的APP_SECRET --cookie 你的LARK_COOKIE

# 配置 OAuth（获取用户身份权限）
npx feishu-user-plugin oauth

# 查看已配置的身份
npx feishu-user-plugin profiles
```

**需要准备：**
- 飞书开放平台应用（App ID + App Secret）
- LARK_COOKIE（登录飞书网页版后从 Cookie 获取）
- 开启机器人能力

## 3. Unreal Bridge（UE5 控制）

用于通过 Python 控制 Unreal Engine 5 编辑器。

### 3.1 安装 unreal-rc MCP 服务器

将 `C:\Users\你的用户名\.claude\mcp-servers\unreal-rc\` 复制到你的 `.claude\mcp-servers\` 目录，然后安装依赖：

```bash
cd %USERPROFILE%\.claude\mcp-servers\unreal-rc
uv sync
```

### 3.2 安装 Unreal Engine 插件

将 Unreal Engine 项目中的 `Bridge` 插件复制到项目的 `Plugins/` 目录。

### 3.3 启动桥接

1. 打开 UE5 编辑器
2. 在项目目录运行：

```bash
python bridge.py
```

> 要求 UE 5.3+，Python 3.11+，需安装 `unreal` 包和 WebSocket 支持。

## 4. 其他可选 MCP 服务器

以下 MCP 服务器也可根据需要安装（来自官方插件市场）：

| 服务器 | 安装方式 | 用途 |
|--------|---------|------|
| GitHub | `npx @anthropic-ai/mcp-github` | GitHub API 操作 |
| Discord | `npx @anthropic-ai/mcp-discord` | Discord 消息收发 |
| Linear | `npx @anthropic-ai/mcp-linear` | Linear 项目管理 |
| GitLab | `npx @anthropic-ai/mcp-gitlab` | GitLab API 操作 |
| Firebase | `npx @anthropic-ai/mcp-firebase` | Firebase 数据库操作 |
| Terraform | `npx @anthropic-ai/mcp-terraform` | Terraform 基础设施管理 |
