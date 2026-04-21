#!/usr/bin/env bash
# SessionStart hook: install Railway + Supabase CLIs into the web sandbox so
# Claude can tail production logs and inspect Supabase state without the human
# pasting output manually. Runs on every new session — fresh VM each time.
#
# Requires (set via the `env` block in .claude/settings.json):
#   RAILWAY_TOKEN or RAILWAY_API_TOKEN — Railway project token (preferred,
#       from Project Settings → Tokens) OR account token (from
#       https://railway.com/account/tokens). Either works for `railway logs`.
#   SUPABASE_ACCESS_TOKEN — Supabase personal access token
#       (https://supabase.com/dashboard/account/tokens).
#   SUPABASE_PROJECT_REF  — the project ref (the xxxx in the dashboard URL).
#
# All output goes to stderr so it appears in the session transcript but does
# not pollute stdout consumers.
set -u
exec 1>&2

log() { printf '[install-clis] %s\n' "$*"; }

RAILWAY_AUTH="${RAILWAY_TOKEN:-${RAILWAY_API_TOKEN:-}}"

# Skip entirely if no tokens are present — lets the hook stay on for people
# who haven't configured tokens yet without failing the session start.
if [ -z "$RAILWAY_AUTH" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  log "no Railway or Supabase token set — skipping CLI install"
  log "paste tokens into the 'env' block of .claude/settings.json to enable"
  exit 0
fi

install_npm_global() {
  local pkg="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    log "$bin already installed ($($bin --version 2>&1 | head -1))"
    return 0
  fi
  log "installing $pkg..."
  if npm install -g --silent "$pkg" >/dev/null 2>&1; then
    log "$bin installed ($($bin --version 2>&1 | head -1))"
  else
    log "WARN: failed to install $pkg — Claude can still work, just without this CLI"
    return 1
  fi
}

# Supabase CLI blocks global npm install by design. Grab the Linux binary from
# the latest GitHub release instead and drop it on PATH.
install_supabase_binary() {
  if command -v supabase >/dev/null 2>&1; then
    log "supabase already installed ($(supabase --version 2>&1 | head -1))"
    return 0
  fi
  local arch=""
  case "$(uname -m)" in
    x86_64)  arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) log "WARN: unsupported arch $(uname -m) — skipping supabase install"; return 1 ;;
  esac
  log "fetching latest supabase CLI release for linux_${arch}..."
  local tmp
  tmp="$(mktemp -d)"
  # GitHub's /releases/latest/download/<asset> redirects to the latest asset
  # without hitting the rate-limited API. Stable path across all repos.
  local asset_url="https://github.com/supabase/cli/releases/latest/download/supabase_linux_${arch}.tar.gz"
  if curl -fsSL -o "$tmp/supabase.tar.gz" "$asset_url" \
     && tar -xzf "$tmp/supabase.tar.gz" -C "$tmp" \
     && install -m 0755 "$tmp/supabase" /usr/local/bin/supabase; then
    log "supabase installed ($(supabase --version 2>&1 | head -1))"
  else
    log "WARN: failed to install supabase CLI"
    return 1
  fi
}

if [ -n "$RAILWAY_AUTH" ]; then
  install_npm_global "@railway/cli" "railway" || true
fi

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  install_supabase_binary || true
  if [ -n "${SUPABASE_PROJECT_REF:-}" ] && command -v supabase >/dev/null 2>&1; then
    log "supabase project ref: $SUPABASE_PROJECT_REF"
  fi
fi

log "done"
exit 0
