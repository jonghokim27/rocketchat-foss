#!/usr/bin/env bash
# Fails if any copy of a security-patched package under /app is older than its fixed version.
#
#   scripts/check-image-deps.sh <image>
set -euo pipefail

IMAGE="${1:?image}"

docker run --rm --entrypoint node "$IMAGE" -e '
const fs = require("fs");
const path = require("path");

// package -> minimum version (the release that fixes the critical advisory)
const MIN = { tar: "7.5.19", dompurify: "3.4.17", "proxy-addr": "2.0.8" };

const cmp = (a, b) => {
	const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
	for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
	return 0;
};

const found = [];
const walk = (dir) => {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const p = path.join(dir, e.name);
		if (path.basename(dir) === "node_modules" && MIN[e.name]) {
			try {
				const { name, version } = JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8"));
				if (name === e.name) found.push({ name, version, p });
			} catch {}
		}
		walk(p);
	}
};
walk("/app");

let bad = 0;
for (const { name, version, p } of found) {
	const ok = cmp(version, MIN[name]) >= 0;
	if (!ok) bad++;
	console.log(`${ok ? "ok  " : "OLD "} ${name}@${version}  ${p}`);
}
for (const name of Object.keys(MIN)) if (!found.some((f) => f.name === name)) console.log(`--   ${name} not present`);
process.exit(bad ? 1 : 0);
'
