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
