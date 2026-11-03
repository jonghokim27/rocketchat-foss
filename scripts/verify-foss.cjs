// After apply-foss: no MIT source may still import licensed code, and every import we rewrote
// must resolve to a file the overlay provides. Test files are not bundled and are skipped.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOTS = ['apps', 'packages'];
const SKIP_DIR = new Set(['node_modules', '.meteor', 'dist', '.turbo', 'tests', 'test', '__tests__', 'mocks', '__mocks__', 'storybook-static']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_FILE = /\.(spec|test|stories)\.(ts|tsx|js|jsx)$/;

// Licensed packages that have no FOSS replacement. Packages the overlay replaces are fine to import.
const REMOVED_PACKAGES = [
	'@rocket.chat/abac',
	'@rocket.chat/network-broker',
	'@rocket.chat/omni-core-ee',
	'@rocket.chat/pdf-worker',
	'@rocket.chat/account-service',
	'@rocket.chat/authorization-service',
	'@rocket.chat/ddp-streamer',
	'@rocket.chat/omnichannel-transcript',
	'@rocket.chat/presence-service',
	'@rocket.chat/queue-worker',
];

// The repository LICENSE puts exactly these two directories under the Enterprise license.
const LICENSED_DIRS = [path.resolve('ee'), path.resolve('apps/meteor/ee')];
const isLicensed = (abs) => LICENSED_DIRS.some((dir) => abs === dir || abs.startsWith(dir + path.sep));

const SPECIFIER =/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)(['"])([^'"]+)\1/g;

const walk = (dir, out) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIR.has(entry.name)) walk(path.join(dir, entry.name), out);
		} else if (SOURCE.test(entry.name) && !SKIP_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
			out.push(path.join(dir, entry.name));
		}
	}
	return out;
};

const resolves = (from, spec) => {
	const base = path.resolve(path.dirname(from), spec);
	return ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'].some(
		(ext) => fs.existsSync(base + ext) && fs.statSync(base + ext).isFile(),
	);
};

const problems = [];
let rewritten = 0;
for (const file of ROOTS.flatMap((r) => walk(r, []))) {
	const text = fs.readFileSync(file, 'utf8');
	for (const [, , spec] of text.matchAll(SPECIFIER)) {
		if (/^\.{1,2}\//.test(spec) && isLicensed(path.resolve(path.dirname(file), spec))) {
			problems.push(`${file}: still imports licensed path ${spec}`);
		}
		if (REMOVED_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) {
			problems.push(`${file}: imports removed licensed package ${spec}`);
		}
		if (/^\.{1,2}\/.*(server|lib)\/foss(\/|$)/.test(spec)) {
			rewritten += 1;
			if (!resolves(file, spec)) problems.push(`${file}: rewritten import does not resolve: ${spec}`);
		}
	}
}

for (const required of [
	'apps/meteor/startRocketChat.ts',
	'packages/foss-license/index.js',
	'packages/foss-presence/index.js',
	'packages/foss-media-calls/index.js',
	'packages/foss-federation-matrix/index.js',
	'packages/foss-omnichannel-services/index.js',
]) {
	if (!fs.existsSync(required)) problems.push(`missing overlay file ${required}`);
}

console.log(`   rewritten imports resolved: ${rewritten}`);
if (rewritten === 0) problems.push('no import was rewritten — upstream layout changed, re-check the FOSS assumptions');
if (problems.length) {
	console.error(problems.map((p) => `   ✗ ${p}`).join('\n'));
	process.exit(1);
}
console.log('   no MIT source reaches into licensed code');
