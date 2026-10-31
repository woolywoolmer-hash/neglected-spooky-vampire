#!/usr/bin/env bash
# A private development-workspace launcher, not a public deployment.
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

if [[ ! -f .next/BUILD_ID ]]; then
  echo 'Build the application first with: npm ci && npm run build' >&2
  exit 1
fi

mkdir -p .data
# Empty public Supabase settings explicitly keep this review launcher in demo mode,
# even if the workspace also has unrelated Supabase secrets or a .env.local file.
nohup env \
  NEXT_PUBLIC_SUPABASE_URL='' \
  NEXT_PUBLIC_SUPABASE_ANON_KEY='' \
  ALLOW_DEMO=true \
  DEMO_DATABASE_PATH=".data/browser-demo-${review_port}" \
  npm run start -- --port "$review_port" \
  > ".data/browser-demo-${review_port}.log" 2>&1 < /dev/null &
review_pid=$!

for ((attempt = 0; attempt < 30; attempt++)); do
  if is_demo_ready; then
    echo "Fieldwork demo is ready on port ${review_port}. No application password is required."
    exit 0
  fi
  if ! kill -0 "$review_pid" 2>/dev/null; then
    echo "Demo startup failed. See .data/browser-demo-${review_port}.log." >&2
    exit 1
  fi
  sleep 1
done

echo "Demo did not become ready. See .data/browser-demo-${review_port}.log." >&2
exit 1
