#!/usr/bin/env bash
# Vercel setup, diagnose & production deploy (idempotent — safe to re-run).
# All output is mirrored to .deploy/run.log (plain text, no spinners) for review.
#
#   0. diagnose previous deployments (build logs → .deploy/)
#   1. Neon Postgres   2. Vercel Blob   3. secrets / flags
#   4. migrate + seed   5. git push → Vercel Git deployment (fallback: CLI deploy)
#   6. wait, collect build logs, smoke-test production
#
# Usage: bash scripts/deploy-vercel.sh [scope]
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .deploy
exec > >(tee .deploy/run.log) 2>&1

SCOPE="${1:-brightbroom-projects}"
PROJECT="awaji-marche"
REGION="iad1" # must match vercel.json regions and the Neon region (us-east-1)
BIN="./node_modules/.bin/vercel"
[ -x "$BIN" ] || npm i -D vercel@latest
export FORCE_COLOR=0 CI=1
V() { echo "  \$ vercel $*"; "$BIN" --scope "$SCOPE" --no-color "$@" </dev/null; }
step() { printf '\n==== %s ====\n' "$*"; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s.slice(s.indexOf('{')));console.log(($1)(j)??'')})"; }
# run a command with a timeout (macOS has no `timeout`)
with_timeout() { local t=$1; shift; "$@" & local pid=$!; ( sleep "$t"; kill "$pid" 2>/dev/null ) & local w=$!; wait "$pid" 2>/dev/null; kill "$w" 2>/dev/null; }
latest_url() { V list "$PROJECT" --json --limit 1 2>/dev/null | json 'j=>j.deployments?.[0]?.url'; }

step "0/6 Diagnose previous deployments"
V list "$PROJECT" --json --limit 5 > .deploy/list.json 2>/dev/null
node -e 'const s=require("fs").readFileSync(".deploy/list.json","utf8");const j=JSON.parse(s.slice(s.indexOf("{")));for(const d of j.deployments||[])console.log(`  ${d.state?.padEnd(9)} ${d.target??"preview"} ${d.url} ${new Date(d.createdAt).toISOString()}`)' || true
PREV="$(node -e 'const s=require("fs").readFileSync(".deploy/list.json","utf8");const j=JSON.parse(s.slice(s.indexOf("{")));console.log(j.deployments?.[0]?.url??"")' 2>/dev/null)"
if [ -n "$PREV" ]; then with_timeout 60 V inspect "$PREV" --logs > .deploy/prev-build.log 2>&1; echo "  → .deploy/prev-build.log ($(wc -l < .deploy/prev-build.log) lines)"; tail -25 .deploy/prev-build.log; fi

step "1/6 Environment"
ENV_LIST="$(V env ls production 2>&1)"; echo "$ENV_LIST" | grep -E '^\s+[A-Z_]+' | awk '{print "  "$1}' | sort -u
has_env() { grep -q "$1" <<<"$ENV_LIST"; }
if has_env DATABASE_URL; then echo "  ✓ DATABASE_URL"; else V integration add neon --name awaji-marche-db -m region="$REGION"; fi

step "2/6 Image storage (Vercel Blob)"
if has_env BLOB_READ_WRITE_TOKEN; then echo "  ✓ BLOB_READ_WRITE_TOKEN"
else V blob create-store awaji-marche-images --access public --region "$REGION" --yes || echo "!! Blob create failed"; fi

step "3/6 Secrets & flags"
add_env() { if has_env "$1"; then echo "  ✓ $1"; return; fi
  for e in production preview development; do printf '%s' "$2" | "$BIN" --scope "$SCOPE" env add "$1" "$e" >/dev/null 2>&1 && echo "  + $1 → $e"; done; }
add_env BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
add_env CRON_SECRET "$(openssl rand -hex 24)"
add_env DEMO_MODE "true"

step "4/6 Migrate + seed (no-op when data exists)"
V env pull .deploy/.env.production --environment=production --yes >/dev/null 2>&1
set -a; . ./.deploy/.env.production; set +a
[ -n "${DATABASE_URL:-}" ] && npm run -s db:seed || echo "!! DATABASE_URL missing"
rm -f .deploy/.env.production

step "5/6 Ship: git push (Vercel Git integration deploys main)"
BEFORE="$(latest_url)"
MSG="${DEPLOY_MESSAGE:-chore: deploy $(date +%Y-%m-%d)}"
git add -A && git commit -q -m "$MSG" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && echo "  committed $(git log --oneline -1)"
git push -q origin main && echo "  pushed"
URL=""
for i in $(seq 1 12); do sleep 10; URL="$(latest_url)"; [ -n "$URL" ] && [ "$URL" != "$BEFORE" ] && break; URL=""; done
if [ -z "$URL" ]; then
  echo "  no Git deployment detected → CLI deploy"
  V deploy --prod --yes --no-wait > .deploy/cli-deploy.log 2>&1; cat .deploy/cli-deploy.log
  URL="$(latest_url)"
fi
echo "  deployment: https://$URL"

step "6/6 Wait, collect logs, smoke test"
V inspect "$URL" --wait --timeout 20m > .deploy/inspect.log 2>&1; tail -20 .deploy/inspect.log
V inspect "$URL" --logs > .deploy/build.log 2>&1; echo "  build log: $(wc -l < .deploy/build.log) lines"; tail -30 .deploy/build.log
PROD="$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' .deploy/inspect.log | grep -v "$URL" | head -1)"
echo "  production alias: ${PROD:-unknown}"
if [ -n "$PROD" ]; then
  for p in / /products /farms /products/awa-tsurigoya-tarzan /login /sitemap.xml /api/cron/ship-reminders; do
    printf '  %-36s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{time_total}s' "$PROD$p")"
  done
fi
echo; echo "=== DEPLOY SCRIPT DONE ==="
