#!/usr/bin/env bash
# Turns a pristine Rocket.Chat checkout into a buildable FOSS tree.
#
#   cd <Rocket.Chat checkout> && bash <this repo>/scripts/apply-foss.sh <this repo>/overlay
#
# 1. Does what upstream `yarn fossify` does: removes every licensed directory (ee/, apps/meteor/ee/)
#    and the licensed startRocketChat.ts.
# 2. Copies the overlay: MIT replacements for the licensed workspace packages the MIT code still
#    imports, and for the licensed files it imports by relative path.
# 3. Rewrites those relative imports (`…/ee/server/…` -> `…/server/foss/…`, `…/ee/lib/…` -> `…/lib/foss/…`).
# 4. Verifies that no MIT source still reaches into licensed code and every rewritten import resolves.
#    Any upstream change that breaks these assumptions stops the build here, not at runtime.
set -euo pipefail

OVERLAY="$(cd "${1:?usage: apply-foss.sh <overlay dir>}" && pwd)"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

fail() { echo "apply-foss: $*" >&2; exit 1; }

[ -f package.json ] && [ -d apps/meteor ] || fail "run from the root of a Rocket.Chat checkout"
[ -d ee ] && [ -d apps/meteor/ee ] || fail "licensed directories already gone — not a pristine checkout"
[ -f apps/meteor/startRocketChatFOSS.ts ] || fail "upstream no longer ships startRocketChatFOSS.ts — re-check the FOSS entry point"

echo "== 1. remove licensed code"
rm -rf ee apps/meteor/ee
rm -f apps/meteor/startRocketChat.ts apps/meteor/startRocketChatFOSS.ts

echo "== 2. copy overlay"
cp -R "$OVERLAY"/. .

echo "== 3. workspaces and dependencies"
node "$SCRIPTS/edit-manifests.cjs"

echo "== 4. rewrite relative imports into licensed code"
mapfile -t files < <(grep -rlE "['\"](\.\./|\./)+ee/(server|lib)(/|['\"])" apps/meteor \
	--include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
	--exclude-dir=node_modules --exclude-dir=.meteor --exclude-dir=tests || true)
for f in "${files[@]}"; do
	sed -i -E \
		-e "s#(['\"](\.\./|\./)+)ee/server(/|['\"])#\1server/foss\3#g" \
		-e "s#(['\"](\.\./|\./)+)ee/lib/#\1lib/foss/#g" \
		"$f"
	echo "   rewrote $f"
done

echo "== 5. verify"
node "$SCRIPTS/verify-foss.cjs"
echo "apply-foss: done"
