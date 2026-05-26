# Hooks 安装指南

Hooks 是 Claude Code 的生命周期钩子，在特定事件触发时自动执行脚本。

## 可用 Hooks

### 1. save-conversation（会话保存）

每次用户发送消息时保存对话内容到本地 JSONL 文件。

```javascript
// hooks/save-conversation.cjs
// 自动保存对话到 %USERPROFILE%\.claude\history.jsonl
```

### 2. reme-session-end（记忆增强）

会话结束时自动运行 ReMeLight 记忆摘要，通过 BM25 语义搜索持久化关键信息。

```javascript
// hooks/reme-session-end.cjs
// 调用 ReMeLight API 生成会话摘要并保存
```

### 3. feishu-upload（飞书上传播）

将会话摘要自动上传到飞书云文档归档。

```javascript
// hooks/feishu-upload.cjs
// 调用 feishu-user-plugin 创建/更新飞书文档
```

## 安装步骤

```bash
# 1. 创建 hooks 目录
mkdir %USERPROFILE%\.claude\hooks

# 2. 复制 hooks 脚本到该目录
# （从本部署包的 hooks/ 目录复制所有 .cjs 文件）

# 3. 配置文件已写在 settings.local.json 中
```

## 配置说明

在 `settings.local.json` 的 `hooks` 字段中配置：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%/.claude/hooks/save-conversation.cjs\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%/.claude/hooks/save-conversation.cjs\" && node \"%USERPROFILE%/.claude/hooks/reme-session-end.cjs\" && node \"%USERPROFILE%/.claude/hooks/feishu-upload.cjs\"",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

## 所需依赖

```bash
npm install -g @anthropic-ai/claude-code
```

hooks 脚本自包含，无额外 npm 依赖。
