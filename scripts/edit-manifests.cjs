// Drops the licensed workspaces from the root manifest and the licensed packages that have no
// FOSS replacement (and no MIT importer) from apps/meteor's dependencies.
'use strict';

const fs = require('fs');

const LICENSED_WITHOUT_REPLACEMENT = [
	'@rocket.chat/abac',
	'@rocket.chat/network-broker',
	'@rocket.chat/omni-core-ee',
	'@rocket.chat/pdf-worker',
];

const edit = (path, fn) => {
	const raw = fs.readFileSync(path, 'utf8');
	const indent = raw.match(/^[ \t]+/m)?.[0] ?? '\t';
	const json = JSON.parse(raw);
	fn(json);
	fs.writeFileSync(path, `${JSON.stringify(json, null, indent)}\n`);
};

edit('package.json', (pkg) => {
	const before = pkg.workspaces.length;
	pkg.workspaces = pkg.workspaces.filter((w) => !w.startsWith('ee/'));
	if (pkg.workspaces.length === before) {
		throw new Error('root workspaces no longer list ee/* — re-check the FOSS assumptions');
	}
	console.log(`   root workspaces: ${pkg.workspaces.join(', ')}`);
});

// apps/meteor does not hoist its dependencies (installConfig.hoistingLimits: workspaces), so the
// root copy of some packages existed only because a licensed workspace depended on them. Packages
// that import such a package without declaring it lose it with the ee workspaces; declare it.
// Found by comparing the root hoisting closure of yarn.lock with and without ee/* (8.9.0).
const meteorPkg = JSON.parse(fs.readFileSync('apps/meteor/package.json', 'utf8'));
const UNDECLARED = [['packages/core-services/package.json', 'sharp']]; // `import type { FitEnum } from 'sharp'`
for (const [manifest, dep] of UNDECLARED) {
	const range = meteorPkg.dependencies?.[dep] ?? meteorPkg.devDependencies?.[dep];
	if (!range) throw new Error(`apps/meteor no longer depends on ${dep} — re-check ${manifest}`);
	edit(manifest, (pkg) => {
		if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) return;
		pkg.devDependencies = { ...pkg.devDependencies, [dep]: range };
		console.log(`   ${manifest}: declared devDependencies.${dep} ${range}`);
	});
}

edit('apps/meteor/package.json', (pkg) => {
	for (const name of LICENSED_WITHOUT_REPLACEMENT) {
		for (const field of ['dependencies', 'devDependencies']) {
			if (pkg[field]?.[name]) {
				delete pkg[field][name];
				console.log(`   apps/meteor: dropped ${field}.${name}`);
			}
		}
	}
});
