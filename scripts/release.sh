#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# release.sh — cut a new FinTwin.ai release
#
# Usage:
#   ./scripts/release.sh patch    # 0.1.0 → 0.1.1  (bug fixes)
#   ./scripts/release.sh minor    # 0.1.0 → 0.2.0  (new features)
#   ./scripts/release.sh major    # 0.1.0 → 1.0.0  (breaking changes)
#
# What it does:
#   1. Validates branch (must be main or release/*)
#   2. Validates clean working tree
#   3. Bumps version in pom.xml and package.json
#   4. Prepends a new section to CHANGELOG.md
#   5. Commits and creates an annotated git tag
#   6. Prints the push command — you review before pushing
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BUMP=${1:-patch}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Validation ────────────────────────────────────────────────────────────────

BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" && "$BRANCH" != release/* ]]; then
    echo "ERROR: Releases must be cut from 'main' or 'release/*' branch."
    echo "       Current branch: $BRANCH"
    echo "       Switch with: git checkout main"
    exit 1
fi

if [[ -n $(git -C "$ROOT" status --porcelain) ]]; then
    echo "ERROR: Working tree has uncommitted changes."
    echo "       Commit or stash everything before releasing."
    git -C "$ROOT" status --short
    exit 1
fi

# ── Compute new version ───────────────────────────────────────────────────────

# Read version from pom.xml (strips -SNAPSHOT suffix)
CURRENT=$(grep -m1 '<version>0\.' "$ROOT/backend/pom.xml" \
    | sed 's/.*<version>\(.*\)<\/version>.*/\1/' \
    | sed 's/-SNAPSHOT//')

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
    *)
        echo "ERROR: Unknown bump type '$BUMP'. Use: major | minor | patch"
        exit 1
        ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW"
DATE=$(date +%Y-%m-%d)

echo ""
echo "  Current version : $CURRENT"
echo "  New version     : $NEW  ($TAG)"
echo "  Branch          : $BRANCH"
echo ""
read -r -p "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Bump backend version (pom.xml) ────────────────────────────────────────────

# Replace the first <version> that matches the current app version
sed -i "0,/<version>${CURRENT}-SNAPSHOT<\/version>/s//<version>${NEW}<\/version>/" \
    "$ROOT/backend/pom.xml" 2>/dev/null || \
sed -i "0,/<version>${CURRENT}<\/version>/s//<version>${NEW}<\/version>/" \
    "$ROOT/backend/pom.xml"

echo "  ✓ backend/pom.xml → $NEW"

# ── Bump frontend version (package.json) ─────────────────────────────────────

sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW\"/" \
    "$ROOT/frontend/package.json"

echo "  ✓ frontend/package.json → $NEW"

# ── Prepend CHANGELOG section ─────────────────────────────────────────────────

CHANGELOG="$ROOT/CHANGELOG.md"
TEMP=$(mktemp)

# Split at "## [Unreleased]" — insert new release block after it
awk -v tag="$TAG" -v date="$DATE" '
    /^## \[Unreleased\]/ {
        print
        print ""
        print "---"
        print ""
        print "## [" substr(tag,2) "] - " date
        print ""
        print "### Added"
        print "- "
        print ""
        print "### Fixed"
        print "- "
        print ""
        print "### Security"
        print "- "
        next
    }
    { print }
' "$CHANGELOG" > "$TEMP"

# Update comparison links at the bottom
sed -i "s|compare/v${CURRENT}\.\.\.HEAD|compare/${TAG}...HEAD|g" "$TEMP"

# Add new version link before existing ones
LINK_LINE="[${NEW}]: https://github.com/your-org/fintwin-ai/releases/tag/${TAG}"
sed -i "/^\[${CURRENT}\]/i ${LINK_LINE}" "$TEMP"

mv "$TEMP" "$CHANGELOG"

echo "  ✓ CHANGELOG.md  → added [$NEW] section (fill in details before pushing)"

# ── Git commit and tag ────────────────────────────────────────────────────────

git -C "$ROOT" add backend/pom.xml frontend/package.json CHANGELOG.md
git -C "$ROOT" commit -m "chore: release $TAG"
git -C "$ROOT" tag -a "$TAG" -m "Release $TAG"

echo ""
echo "  ✓ Committed and tagged $TAG"
echo ""
echo "  Next steps:"
echo "    1. Edit CHANGELOG.md — fill in the Added / Fixed / Security sections"
echo "    2. git add CHANGELOG.md && git commit --amend --no-edit"
echo "    3. git push origin $BRANCH --tags"
echo "    4. Create a GitHub Release from tag $TAG"
echo ""
