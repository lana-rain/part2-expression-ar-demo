#!/bin/bash
# Run the local AR demo on one fixed loopback address and port.
set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)" || exit 1
app_dir="$(cd "$script_dir/.." && pwd -P)" || exit 1
demo_url='http://localhost:5173/'
vite_entry="$app_dir/node_modules/vite/bin/vite.js"

demo_responds() {
  /usr/bin/curl --noproxy '*' --silent --fail --max-time 2 "$demo_url" 2>/dev/null |
    /usr/bin/grep -Fq '<title>我的直播间</title>'
}

port_is_busy() {
  /usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1
}

find_node() {
  local candidate
  local -a candidates=()
  candidate="$(command -v node 2>/dev/null || true)"
  [[ -n "$candidate" ]] && candidates+=("$candidate")
  candidates+=(
    /opt/homebrew/bin/node
    /usr/local/bin/node
    "$HOME/.volta/bin/node"
    "$HOME/.nvm/current/bin/node"
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]] && "$candidate" -e \
      'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>20||(major===20&&minor>=19)?0:1)' \
      >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

run_vite() {
  local node_bin
  if [[ ! -f "$vite_entry" ]]; then
    echo "缺少网页依赖：请先在 app 目录运行 pnpm install。" >&2
    return 1
  fi
  node_bin="$(find_node)" || {
    echo "未找到 Node.js 20.19 或更高版本。" >&2
    return 1
  }
  cd "$app_dir" || return 1
  echo "本地直播演示已启动：$demo_url"
  "$node_bin" "$vite_entry" --host 127.0.0.1 --port 5173 --strictPort &
  child_pid=$!
  wait "$child_pid"
  local result=$?
  child_pid=''
  return "$result"
}

child_pid=''
on_stop() {
  if [[ -n "$child_pid" ]]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  exit 0
}
trap on_stop TERM INT

case "${1:---manual}" in
  --status)
    demo_responds
    ;;
  --manual)
    if demo_responds; then
      echo "直播演示已在运行：$demo_url"
      exit 0
    fi
    if port_is_busy; then
      echo '5173 端口已被其他程序占用；请关闭该程序后再打开演示。' >&2
      exit 1
    fi
    run_vite
    ;;
  --agent)
    while true; do
      if demo_responds; then
        # A manually launched copy owns the port. Take over if it exits.
        sleep 5
      elif port_is_busy; then
        echo '5173 端口暂被占用，稍后重新检查。' >&2
        sleep 5
      else
        run_vite || true
        sleep 3
      fi
    done
    ;;
  *)
    echo "未知参数：$1" >&2
    exit 2
    ;;
esac
