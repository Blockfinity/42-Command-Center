#!/usr/bin/env bash
# ============================================================================
# 42 — PROJECT RESTORE SCRIPT
# ============================================================================
# This script restores the 42 command interface project from any of the
# backup layers if the working directory is lost or corrupted.
#
# USAGE:
#   chmod +x RESTORE.sh
#   ./RESTORE.sh              # auto-detect best available backup
#   ./RESTORE.sh bundle       # restore from git bundle
#   ./RESTORE.sh bare         # restore from bare repo
#   ./RESTORE.sh tarball      # restore from tarball (non-git fallback)
#
# BACKUP LAYERS (checked in order):
#   1. Git bundle  — upload/42-base.bundle, /home/sync/42-backups/, /tmp/my-project/
#   2. Bare repo   — /home/z/42-backup.git (cloneable)
#   3. Tarball     — 42-base.tar.gz (source-only, non-git fallback)
#
# All backups are on PERSISTENT storage (OSS cloud / PolarFS) and survive
# environment resets.
# ============================================================================

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
BARE_REPO="/home/z/42-backup.git"

# Candidate bundle locations (persistent OSS/PolarFS mounts)
BUNDLE_PATHS=(
  "$PROJECT_DIR/upload/42-base.bundle"
  "/home/sync/42-backups/42-base.bundle"
  "/tmp/my-project/42-base.bundle"
)

# Candidate tarball locations
TARBALL_PATHS=(
  "$PROJECT_DIR/upload/42-base.tar.gz"
  "/home/sync/42-backups/42-base.tar.gz"
  "/tmp/my-project/42-base.tar.gz"
)

log()   { echo -e "\033[1;32m[RESTORE]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()   { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }

find_first_existing() {
  for p in "$@"; do
    if [ -f "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

restore_from_bundle() {
  local bundle
  if ! bundle=$(find_first_existing "${BUNDLE_PATHS[@]}"); then
    err "No git bundle found in any location"
    return 1
  fi
  log "Restoring from bundle: $bundle"

  if [ -d "$PROJECT_DIR/.git" ]; then
    warn "Existing git repo found. Backing up to $PROJECT_DIR/.git.bak.$(date +%s)"
    mv "$PROJECT_DIR/.git" "$PROJECT_DIR/.git.bak.$(date +%s)"
  fi

  cd /home/z
  rm -rf "$PROJECT_DIR.restore-tmp"
  git clone -b main "$bundle" "$PROJECT_DIR.restore-tmp"
  # Copy restored content over the project dir (preserving upload/, node_modules if present)
  rsync -a --exclude='upload' --exclude='node_modules' --exclude='.next' \
    "$PROJECT_DIR.restore-tmp/" "$PROJECT_DIR/"
  rm -rf "$PROJECT_DIR.restore-tmp"

  cd "$PROJECT_DIR"
  log "Verifying restore..."
  git log --oneline --decorate -1
  git tag -l
  log "Bundle restore complete."
}

restore_from_bare() {
  if [ ! -d "$BARE_REPO" ]; then
    err "Bare repo not found at $BARE_REPO"
    return 1
  fi
  log "Restoring from bare repo: $BARE_REPO"

  cd /home/z
  rm -rf "$PROJECT_DIR.restore-tmp"
  git clone "$BARE_REPO" "$PROJECT_DIR.restore-tmp"
  rsync -a --exclude='upload' --exclude='node_modules' --exclude='.next' \
    "$PROJECT_DIR.restore-tmp/" "$PROJECT_DIR/"
  rm -rf "$PROJECT_DIR.restore-tmp"

  cd "$PROJECT_DIR"
  log "Verifying restore..."
  git log --oneline --decorate -1
  git tag -l
  log "Bare repo restore complete."
}

restore_from_tarball() {
  local tarball
  if ! tarball=$(find_first_existing "${TARBALL_PATHS[@]}"); then
    err "No tarball found in any location"
    return 1
  fi
  log "Restoring from tarball: $tarball"
  warn "Tarball restore is a NON-GIT fallback (no git history)."

  cd /home/z
  tar xzf "$tarball" -C /home/z/ --overwrite
  cd "$PROJECT_DIR"
  log "Tarball restore complete. Run 'git init && git add -A && git commit' if you need git history."
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
METHOD="${1:-auto}"

case "$METHOD" in
  bundle)
    restore_from_bundle
    ;;
  bare)
    restore_from_bare
    ;;
  tarball)
    restore_from_tarball
    ;;
  auto)
    log "Auto-detecting best available backup..."
    if find_first_existing "${BUNDLE_PATHS[@]}" >/dev/null 2>&1; then
      restore_from_bundle
    elif [ -d "$BARE_REPO" ]; then
      restore_from_bare
    elif find_first_existing "${TARBALL_PATHS[@]}" >/dev/null 2>&1; then
      restore_from_tarball
    else
      err "NO BACKUP FOUND in any location. Check:"
      err "  Bundles:  ${BUNDLE_PATHS[*]}"
      err "  Bare repo: $BARE_REPO"
      err "  Tarballs: ${TARBALL_PATHS[*]}"
      exit 1
    fi
    ;;
  *)
    err "Unknown method: $METHOD (use: auto, bundle, bare, tarball)"
    exit 1
    ;;
esac

echo ""
log "=========================================="
log "  RESTORE COMPLETE"
log "=========================================="
log "Next steps to get the app running:"
log "  1. cd $PROJECT_DIR"
log "  2. bun install              # install dependencies"
log "  3. bun run db:push          # (re)generate SQLite DB from .env"
log "  4. bun run dev              # start Next.js dev server (:3000)"
log "  5. cd mini-services/game-engine && bun run dev  # start game engine (:3003)"
log ""
log "The base version is tagged 'base'. To verify: git log --oneline"
log "=========================================="
