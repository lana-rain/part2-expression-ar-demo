#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo '开机自启只支持 macOS。' >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
app_dir="$(cd "$script_dir/.." && pwd -P)"
support_dir="$HOME/Library/Application Support/Part2ExpressionARDemo"
plist_dir="$HOME/Library/LaunchAgents"
label='com.openai.part2-expression-ar.local-demo'
plist_path="$plist_dir/$label.plist"
runner_path="$support_dir/autostart-runner.sh"
server_path="$support_dir/static-server.mjs"
site_path="$support_dir/site"
installed_node="$support_dir/node"
domain="gui/$(id -u)"

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

xml_escape() {
  local value="$1"
  value="${value//&/\&amp;}"
  value="${value//</\&lt;}"
  value="${value//>/\&gt;}"
  value="${value//\"/\&quot;}"
  value="${value//\'/\&apos;}"
  printf '%s' "$value"
}

write_plist() {
  local destination="$1"
  cat > "$destination" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$runner_path")</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(xml_escape "$support_dir/server.log")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$support_dir/server-error.log")</string>
</dict></plist>
EOF
}

case "${1:-install}" in
  install)
    node_bin="$(find_node)" || {
      echo '未找到 Node.js 20.19 或更高版本，无法生成网页快照。' >&2
      exit 1
    }
    vite_entry="$app_dir/node_modules/vite/bin/vite.js"
    if [[ ! -f "$vite_entry" ]]; then
      echo '缺少网页依赖：请先在 app 目录运行 pnpm install。' >&2
      exit 1
    fi

    # Build while Terminal still has access to the project on the external disk.
    echo '正在生成当前版本的网页快照…'
    # The installed localhost snapshot is a validation preview. Public
    # deployment uses the ordinary build plus prune-dist instead.
    (cd "$app_dir" && VITE_LOCAL_VALIDATION=true "$node_bin" "$vite_entry" build)
    if [[ ! -f "$app_dir/dist/index.html" ]]; then
      echo '构建结果缺少 index.html，保留原有开机服务。' >&2
      exit 1
    fi

    mkdir -p "$support_dir" "$plist_dir"
    staging_site="$support_dir/site-staging.$$"
    staging_node="$support_dir/node-staging.$$"
    backup_site="$support_dir/site-backup.$$"
    mkdir "$staging_site"
    trap 'rm -rf "$staging_site"; rm -f "$staging_node"' EXIT
    cp -R "$app_dir/dist/." "$staging_site/"
    if [[ ! -f "$staging_site/index.html" ]]; then
      echo '网页快照复制失败，保留原有开机服务。' >&2
      exit 1
    fi
    cp -L "$node_bin" "$staging_node"
    chmod 700 "$staging_node"
    "$staging_node" -e 'process.exit(process.versions.node ? 0 : 1)'

    # Only stop the old service after the new snapshot is ready.
    if [[ -f "$plist_path" ]]; then
      /bin/launchctl bootout "$domain" "$plist_path" >/dev/null 2>&1 || true
    fi
    cp "$script_dir/autostart-runner.sh" "$runner_path"
    cp "$script_dir/static-server.mjs" "$server_path"
    chmod 700 "$runner_path"
    mv -f "$staging_node" "$installed_node"
    if [[ -d "$site_path" ]]; then
      mv "$site_path" "$backup_site"
    fi
    mv "$staging_site" "$site_path"
    rm -rf "$backup_site"
    rm -f "$support_dir/project-path"
    write_plist "$plist_path"
    /usr/bin/plutil -lint "$plist_path" >/dev/null
    /bin/launchctl bootstrap "$domain" "$plist_path"
    /bin/launchctl enable "$domain/$label"
    /bin/launchctl kickstart -k "$domain/$label"
    echo '开机自启已安装。网页快照保存在本机家目录，外置磁盘未连接时也可访问 localhost:5173。'
    ;;
  uninstall)
    if [[ -f "$plist_path" ]]; then
      /bin/launchctl bootout "$domain" "$plist_path" >/dev/null 2>&1 || true
      rm -f "$plist_path"
    fi
    rm -f "$runner_path" "$server_path" "$installed_node" "$support_dir/project-path"
    rm -rf "$site_path"
    echo '开机自启已关闭。手动启动的演示网页不受影响。'
    ;;
  check)
    temp_plist="$(/usr/bin/mktemp /tmp/part2-ar-launchagent.XXXXXX.plist)"
    trap 'rm -f "$temp_plist"' EXIT
    write_plist "$temp_plist"
    /usr/bin/plutil -lint "$temp_plist"
    ;;
  *)
    echo '用法：install-autostart.sh [install|uninstall|check]' >&2
    exit 2
    ;;
esac
