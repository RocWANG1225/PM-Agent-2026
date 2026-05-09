#!/bin/zsh
cd /Users/wangpeng5/Documents/Codex/2026-05-06/agent

NODE_BIN="/Users/wangpeng5/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
APP_URL="http://localhost:4173"

echo "正在启动项目管理 Agent..."
"$NODE_BIN" \
  --watch \
  --watch-preserve-output \
  --watch-path=apps \
  --watch-path=scripts \
  --watch-path=templates \
  apps/api/server.js &
SERVER_PID=$!

sleep 2
open "$APP_URL"

echo "项目管理 Agent 已打开：$APP_URL"
echo "已开启自动刷新服务：代码或模板变更后，服务会自动重启；刷新网页即可看到新版本。"
echo "关闭这个窗口会停止本地服务。"
wait $SERVER_PID
