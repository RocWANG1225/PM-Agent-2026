#!/bin/zsh
cd /Users/wangpeng5/Documents/GitHub/PM-Agent-2026

if [ -f .env.local ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
  done < .env.local
fi

NODE_BIN="/Users/wangpeng5/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
PORT="${PORT:-4173}"
APP_URL="http://localhost:$PORT"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用。请先关闭之前打开的项目管理 Agent 终端窗口，或执行："
  echo "lsof -nP -iTCP:$PORT -sTCP:LISTEN"
  echo "确认旧服务后再停止它，然后重新运行 ./start-local.command。"
  exit 1
fi

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
