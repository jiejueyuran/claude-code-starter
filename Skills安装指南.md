# Skills 安装指南

Skills 是 Claude Code 的专用技能包，提供领域特定的工作流。

## 已安装 Skills 列表

| Skill | 用途 |
|-------|------|
| `agent-introspection-debugging` | AI Agent 故障自检与修复 |
| `brainstorming` | 创意需求探索与设计讨论 |
| `dispatching-parallel-agents` | 并行执行独立子任务 |
| `executing-plans` | 执行书面实施计划 |
| `find-skills` | 搜索和发现可用 Skills |
| `finishing-a-development-branch` | 开发分支收尾与集成 |
| `receiving-code-review` | 接收代码评审反馈 |
| `requesting-code-review` | 请求代码评审 |
| `skill-creator` | 创建/编辑/优化 Skills |
| `subagent-driven-development` | 当前会话内独立任务执行 |
| `systematic-debugging` | 系统化 Bug 定位与修复 |
| `test-driven-development` | 测试驱动开发工作流 |
| `unreal-bridge` | Unreal Engine Python 脚本控制 |
| `using-git-worktrees` | Git 工作树隔离开发 |
| `using-superpowers` | 超级权限模式 |
| `verification-before-completion` | 完成前验证检查 |
| `writing-plans` | 编写实施计划 |
| `writing-skills` | 编写 Skill 定义 |
| `code-review` | 代码变更审查 |
| `verify` | 手动验证代码行为 |
| `loop` | 定时循环执行任务 |
| `claude-api` | Claude API / Anthropic SDK 开发 |
| `security-review` | 安全审查 |
| `run` | 启动和运行项目 |
| `init` | 初始化 CLAUDE.md |
| `update-config` | 配置 Claude Code 设置 |
| `keybindings-help` | 快捷键自定义帮助 |
| `fewer-permission-prompts` | 减少权限提示频率 |

## 安装方式

### 从官方 Skill 市场安装

```bash
# 搜索 skill
npx skills search <关键词>

# 安装 skill
npx skills install <skill-name>

# 列出已安装 skills
npx skills list
```

### 安装全部推荐 skills

```bash
npx skills install agent-introspection-debugging
npx skills install brainstorming
npx skills install dispatching-parallel-agents
npx skills install executing-plans
# ... 其他 skills
```

> 注意：skills 数量达到约 12 个后可能会影响 Claude 的响应速度，建议按需安装。
