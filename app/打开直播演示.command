#!/bin/bash
set -u
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)" || exit 1
url='http://localhost:5173/'

if /bin/bash "$app_dir/scripts/local-server.sh" --status >/dev/null 2>&1; then
  /usr/bin/open "$url"
  echo "已打开直播演示：$url"
  exit 0
fi

/bin/bash "$app_dir/scripts/local-server.sh" --manual &
server_pid=$!
stop_server() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap stop_server EXIT INT TERM

for ((attempt=0; attempt<60; attempt++)); do
  if /bin/bash "$app_dir/scripts/local-server.sh" --status >/dev/null 2>&1; then
    /usr/bin/open "$url"
    echo '演示正在运行。关闭这个终端会停止手动启动的本地服务。'
    wait "$server_pid"
    exit $?
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  sleep 0.5
done

echo '本地服务未能在 30 秒内启动，请检查上方提示。' >&2
exit 1
