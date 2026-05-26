# Claude Code 全权限快速部署脚本
# 以管理员身份运行

Write-Host "=== Claude Code 全权限部署 ===" -ForegroundColor Cyan

# 1. 检查 Node.js
try {
    $nodeVer = node --version
    Write-Host "[OK] Node.js $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[!] 需要安装 Node.js (https://nodejs.org)" -ForegroundColor Red
    exit 1
}

# 2. 安装 Claude Code
Write-Host "`n[1/4] 安装 Claude Code..." -ForegroundColor Yellow
npm install -g @anthropic-ai/claude-code
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Claude Code 安装完成" -ForegroundColor Green
} else {
    Write-Host "[!] 安装失败，请手动运行: npm install -g @anthropic-ai/claude-code" -ForegroundColor Red
}

# 3. 创建 .claude 目录
$claudeDir = "$env:USERPROFILE\.claude"
Write-Host "`n[2/4] 创建配置目录..." -ForegroundColor Yellow
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}
Write-Host "[OK] $claudeDir" -ForegroundColor Green

# 4. 复制配置文件
Write-Host "`n[3/4] 复制配置文件..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$scriptDir\settings.json" "$claudeDir\" -Force
Copy-Item "$scriptDir\settings.local.json" "$claudeDir\" -Force
Write-Host "[OK] 配置文件已复制" -ForegroundColor Green

# 5. 提示配置 API Key
Write-Host "`n[4/4] 后续步骤" -ForegroundColor Yellow
Write-Host "─────────────────────────────" -ForegroundColor DarkGray
Write-Host "1. 编辑 $claudeDir\settings.json" -ForegroundColor White
Write-Host "   将 ANTHROPIC_AUTH_TOKEN 改为你的 API Key" -ForegroundColor White
Write-Host "2. 查看 MCP服务器安装指南.md 安装 MCP 服务器" -ForegroundColor White
Write-Host "3. 查看 Hooks安装指南.md 配置自动化钩子" -ForegroundColor White
Write-Host "4. 查看 Skills安装指南.md 安装技能" -ForegroundColor White
Write-Host "─────────────────────────────" -ForegroundColor DarkGray

Write-Host "`n部署完成！运行 claude 启动 Claude Code。" -ForegroundColor Cyan
