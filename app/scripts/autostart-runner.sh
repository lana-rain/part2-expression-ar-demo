#!/bin/bash
# This copy runs from ~/Library/Application Support, never from the external disk.
set -u
runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)" || exit 1
site_dir="$runner_dir/site"
server_entry="$runner_dir/static-server.mjs"
node_bin="$runner_dir/node"
demo_url='http://localhost:5173/'
child_pid=''

demo_responds() {
  /usr/bin/curl --noproxy '*' --silent --fail --max-time 2 "$demo_url" 2>/dev/null |
    /usr/bin/grep -Fq '<title>我的直播间</title>'
}

port_is_busy() {
  /usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1
}

on_stop() {
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  exit 0
}
trap on_stop TERM INT HUP

while true; do
  if [[ ! -f "$site_dir/index.html" || ! -f "$server_entry" || ! -x "$node_bin" ]]; then
    echo '本机网页快照尚未准备好，稍后重试。' >&2
    sleep 5
    continue
  fi
  if demo_responds; then
    # A manual dev server has precedence. Use the snapshot when it exits.
    sleep 5
    continue
  fi
  if port_is_busy; then
    echo '5173 端口暂被占用，稍后重新检查。' >&2
    sleep 5
    continue
  fi
  "$node_bin" "$server_entry" "$site_dir" &
  child_pid=$!
  wait "$child_pid" || true
  child_pid=''
  sleep 3
done
