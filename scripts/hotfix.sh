#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# hotfix.sh — apply an urgent production fix to FinTwin.ai
#
# Usage:
#   ./scripts/hotfix.sh start  critical-auth-bypass   # creates hotfix branch
#   ./scripts/hotfix.sh finish                         # merges back + tags
#
# Hotfix flow:
#   main ──→ hotfix/critical-auth-bypass ──→ main  (tagged vX.Y.Z+1)
#                                        ──→ develop (backport)
#
# WHY a separate script: hotfixes bypass develop and go directly to main.
# This ensures a critical fix reaches production without waiting for in-progress
# feature work on develop. The backport to develop keeps branches in sync.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACTION=${1:-}
NAME=${2:-}

usage() {
    echo "Usage:"
    echo "  $0 start  <description>   # e.g: start critical-auth-bypass"
    echo "  $0 finish                  # run from the hotfix branch"
    exit 1
}

[[ -z "$ACTION" ]] && usage

# ── start ─────────────────────────────────────────────────────────────────────

if [[ "$ACTION" == "start" ]]; then
    [[ -z "$NAME" ]] && { echo "ERROR: Provide a hotfix description."; usage; }

    BRANCH="hotfix/$NAME"

    if [[ -n $(git -C "$ROOT" status --porcelain) ]]; then
        echo "ERROR: Working tree has uncommitted changes."
        exit 1
    fi

    git -C "$ROOT" checkout main
    git -C "$ROOT" pull origin main
    git -C "$ROOT" checkout -b "$BRANCH"

    echo ""
    echo "  ✓ Created branch: $BRANCH"
    echo ""
    echo "  Fix the issue, then run:"
    echo "    ./scripts/hotfix.sh finish"
    echo ""
    exit 0
fi

# ── finish ────────────────────────────────────────────────────────────────────

if [[ "$ACTION" == "finish" ]]; then
    BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)

    if [[ "$BRANCH" != hotfix/* ]]; then
        echo "ERROR: Not on a hotfix branch (current: $BRANCH)"
        exit 1
    fi

    if [[ -n $(git -C "$ROOT" status --porcelain) ]]; then
        echo "ERROR: Working tree has uncommitted changes."
        exit 1
    fi

    # Compute new patch version
    CURRENT=$(grep -m1 '<version>0\.' "$ROOT/backend/pom.xml" \
        | sed 's/.*<version>\(.*\)<\/version>.*/\1/' \
        | sed 's/-SNAPSHOT//')
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    PATCH=$((PATCH + 1))
    NEW="$MAJOR.$MINOR.$PATCH"
    TAG="v$NEW"
    DATE=$(date +%Y-%m-%d)

    echo ""
    echo "  Hotfix branch   : $BRANCH"
    echo "  New version     : $NEW  ($TAG)"
    echo ""
    read -r -p "Merge to main and tag $TAG? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

    # Bump versions
    sed -i "0,/<version>${CURRENT}<\/version>/s//<version>${NEW}<\/version>/" \
        "$ROOT/backend/pom.xml"
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW\"/" \
        "$ROOT/frontend/package.json"

    # Add CHANGELOG entry
    CHANGELOG="$ROOT/CHANGELOG.md"
    TEMP=$(mktemp)
    awk -v tag="$TAG" -v date="$DATE" -v branch="$BRANCH" '
        /^## \[Unreleased\]/ {
            print
            print ""
            print "---"
            print ""
            print "## [" substr(tag,2) "] - " date " (hotfix)"
            print ""
            print "### Fixed"
            print "- Hotfix: " branch
            print ""
            next
        }
        { print }
    ' "$CHANGELOG" > "$TEMP"
    mv "$TEMP" "$CHANGELOG"

    git -C "$ROOT" add backend/pom.xml frontend/package.json CHANGELOG.md
    git -C "$ROOT" commit -m "chore: hotfix $TAG"

    # Merge to main
    git -C "$ROOT" checkout main
    git -C "$ROOT" merge --no-ff "$BRANCH" -m "Merge $BRANCH into main"
    git -C "$ROOT" tag -a "$TAG" -m "Hotfix $TAG"

    # Backport to develop
    if git -C "$ROOT" show-ref --quiet refs/heads/develop; then
        git -C "$ROOT" checkout develop
        git -C "$ROOT" merge --no-ff "$BRANCH" -m "Backport $BRANCH to develop"
        git -C "$ROOT" checkout main
        echo "  ✓ Backported to develop"
    else
        echo "  ! No develop branch found — backport manually if you have one"
    fi

    echo ""
    echo "  ✓ Merged to main and tagged $TAG"
    echo ""
    echo "  Next steps:"
    echo "    1. Update CHANGELOG.md with a proper description of the fix"
    echo "    2. git push origin main develop --tags"
    echo "    3. Create a GitHub Release from tag $TAG marked as a hotfix"
    echo "    4. Delete hotfix branch: git branch -d $BRANCH"
    echo ""
    exit 0
fi

usage
