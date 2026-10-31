#!/usr/bin/env bash
# Private Codespaces demo launcher. Uses Next.js dev mode so the preview can
# recover cleanly even when a production build has not been generated yet.
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
  echo "Fieldwork demo is already running on port ${review_port}."
  exit 0
fi

mkdir -p .data

# Keep the review workspace deliberately in demo mode. In development mode the
# demo does not require Supabase or any real credentials/data.
nohup env \
  NEXT_PUBLIC_SUPABASE_URL='' \
  NEXT_PUBLIC_SUPABASE_ANON_KEY='' \
  ALLOW_DEMO=true \
  DEMO_DATABASE_PATH=".data/browser-demo-${review_port}" \
  npm run dev -- --port "$review_port" \
  > ".data/browser-demo-${review_port}.log" 2>&1 < /dev/null &
review_pid=$!

for ((attempt = 0; attempt < 60; attempt++)); do
  if is_demo_ready; then
    echo "Fieldwork demo is ready on port ${review_port}. No application password is required."
    exit 0
  fi
  if ! kill -0 "$review_pid" 2>/dev/null; then
    echo "Demo startup failed. Last log lines:" >&2
    tail -n 60 ".data/browser-demo-${review_port}.log" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "Demo did not become ready. Last log lines:" >&2
tail -n 60 ".data/browser-demo-${review_port}.log" >&2 || true
exit 1
