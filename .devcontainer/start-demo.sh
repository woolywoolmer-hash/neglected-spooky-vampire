#!/usr/bin/env bash
# Private Codespaces demo launcher.
# The Next.js process is placed in its own session so Codespaces lifecycle hooks
# do not clean it up when this script exits.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

review_port="${FIELDWORK_DEMO_PORT:-3000}"
if [[ ! "$review_port" =~ ^[0-9]{4,5}$ ]] || (( review_port < 1024 || review_port > 65535 )); then
  echo 'FIELDWORK_DEMO_PORT must be a port between 1024 and 65535.' >&2
  exit 1
fi

is_demo_ready() {
  curl --fail --silent --max-time 5 "http://127.0.0.1:${review_port}/api/session" |
    node -e '
      let body = "";
      process.stdin.on("data", chunk => body += chunk);
      process.stdin.on("end", () => {
        try { process.exit(JSON.parse(body).mode === "demo" ? 0 : 1); }
        catch { process.exit(1); }
      });
    '
}

if is_demo_ready; then
  echo "Sport Regis demo is already running on port ${review_port}."
  exit 0
fi

mkdir -p .data
log_file=".data/browser-demo-${review_port}.log"

# Start a fully detached process/session. This is intentionally demo-only and
# forces synthetic local data rather than any hosted Supabase configuration.
setsid -f env \
  NEXT_PUBLIC_SUPABASE_URL='' \
  NEXT_PUBLIC_SUPABASE_ANON_KEY='' \
  ALLOW_DEMO=true \
  DEMO_DATABASE_PATH=".data/browser-demo-${review_port}" \
  npm run dev -- --hostname 0.0.0.0 --port "$review_port" \
  > "$log_file" 2>&1 < /dev/null

for ((attempt = 0; attempt < 60; attempt++)); do
  if is_demo_ready; then
    echo "Sport Regis demo is ready on port ${review_port}. No application password is required."
    exit 0
  fi
  sleep 1
done

echo "Demo did not become ready. Last log lines:" >&2
tail -n 80 "$log_file" >&2 || true
exit 1
