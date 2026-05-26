# Claude Code 全权限配置部署包

本部署包提供了一套完整的 Claude Code 全权限配置，包含：

- **API 代理配置**（DeepSeek V4 通道）
- **全权限豁免**（免确认执行任意操作）
- **MCP 服务器**（Playwright 浏览器控制、飞书集成、UE5 控制）
- **Hooks 自动化钩子**（会话保存、记忆增强、飞书上传播）
- **Skills 技能集**（20+ 实用开发技能）
- **记忆持久化系统**（ReMeLight BM25 语义搜索）

---

## 快速开始

### 第 1 步：安装 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### 第 2 步：复制配置文件

将本目录中的 `settings.json` 和 `settings.local.json` 复制到：

```
%USERPROFILE%\.claude\
```

即 `C:\Users\你的用户名\.claude\`

### 第 3 步：配置 API Key

编辑 `%USERPROFILE%\.claude\settings.json`，将 `ANTHROPIC_AUTH_TOKEN` 改为你自己的 Key：

```json
"ANTHROPIC_AUTH_TOKEN": "sk-你的key",
```

默认配置使用 DeepSeek V4 API 代理通道（需兼容 Anthropic API 格式的代理）。

### 第 4 步：安装 MCP 服务器

根据 `MCP服务器安装指南.md` 安装所需 MCP 服务器。

### 第 5 步：安装 Hooks

根据 `Hooks安装指南.md` 配置自动化钩子。

### 第 6 步：安装 Skills

根据 `Skills安装指南.md` 安装技能集。

---

## 配置概览

| 组件 | 说明 |
|------|------|
| **API 代理** | DeepSeek V4 Flash/Pro 模型通道 |
| **权限模式** | `bypassPermissions`（完全豁免） |
| **浏览器控制** | Playwright MCP（网页自动化测试/截图） |
| **飞书集成** | feishu-user-plugin（消息收发/文档管理） |
| **UE5 控制** | Unreal Bridge + unreal-rc MCP |
| **会话持久化** | save-conversation + ReMeLight + 飞书上传播 |
| **记忆系统** | BM25 语义搜索 + SqliteFileStore |

## 环境变量配置

hooks 脚本需要以下环境变量（配置在 `settings.local.json` 的 `env` 字段中）：

```json
{
  "env": {
    "CLAUDE_MEMORY_DIR": "C:/Users/你的用户名/.claude/projects/你的项目目录/memory",
    "REME_DIR": "C:/Users/你的用户名/.claude/projects/你的项目目录/memory/.reme"
  }
}
```
