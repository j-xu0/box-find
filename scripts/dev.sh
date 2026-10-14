#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

state_dir="$PWD/.dev"
pid_file="$state_dir/bun.pid"
compose=(docker compose -f compose.dev.yaml)

# Keep the lock file in place so every invocation locks the same inode.
mkdir -p "$state_dir"
exec 9> "$state_dir/lifecycle.lock"
flock -x 9

running() {
  [[ -f "$pid_file" ]] || return 1
  read -r dev_pid < "$pid_file"
  [[ "$dev_pid" =~ ^[0-9]+$ ]] || return 1
  # Only signal the process group we created, never a reused unrelated PID.
  [[ "$(ps -p "$dev_pid" -o pgid= | tr -d ' ')" == "$dev_pid" ]] || return 1
  [[ "$(ps -p "$dev_pid" -o args=)" == *'bun node_modules/vite/bin/vite.js'* ]]
}

case "${1:-}" in
  start)
    command -v bun >/dev/null
    command -v setsid >/dev/null
    mkdir -p "$state_dir"
    if running; then
      "${compose[@]}" up -d --wait
      echo 'Dev app is already running at http://127.0.0.1:5173'
      exit 0
    fi
    rm -f "$pid_file"
    bun install --frozen-lockfile
    "${compose[@]}" up -d --wait
    export PHOTO_ENDPOINT=http://127.0.0.1:3900
    export PHOTO_ACCESS_KEY=GK11111111111111111111111111111111
    export PHOTO_SECRET_KEY=2222222222222222222222222222222222222222222222222222222222222222
    # Override any remote MONGO_URI in .env for this process only.
    MONGO_URI=mongodb://127.0.0.1:27018/boxes-dev \
      setsid bun node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort \
      > "$state_dir/bun.log" 2>&1 < /dev/null 9>&- &
    dev_pid=$!
    echo "$dev_pid" > "$pid_file"
    sleep 2
    if ! running; then
      cat "$state_dir/bun.log"
      rm -f "$pid_file"
      "${compose[@]}" down
      exit 1
    fi
    echo 'Dev app started at http://127.0.0.1:5173 (make logs to follow output; make stop to stop)'
    ;;
  stop)
    if running; then
      kill -TERM -- "-$dev_pid"
    fi
    rm -f "$pid_file"
    "${compose[@]}" down
    echo 'Dev app, Mongo and Garage stopped. Data volumes preserved.'
    ;;
  *)
    echo 'Usage: bash scripts/dev.sh {start|stop}' >&2
    exit 2
    ;;
esac
