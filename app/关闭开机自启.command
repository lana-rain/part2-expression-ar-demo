#!/bin/bash
set -e
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
/bin/bash "$app_dir/scripts/install-autostart.sh" uninstall
