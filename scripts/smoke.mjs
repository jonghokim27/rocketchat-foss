// End-to-end smoke test against a running FOSS image. Node 24: global fetch, FormData, Blob, WebSocket.
//
//   node scripts/smoke.mjs <base url> <admin username> <admin password> <expected version>
//
// Covers what a FOSS build must still do: serve the web client, REST login, channels, messages,
// file upload, and — the part rebuilt from scratch — presence driven by a real DDP session.

const [base, adminUser, adminPass, expectedVersion] = process.argv.slice(2);
if (!base || !adminUser || !adminPass) {
	console.error('usage: smoke.mjs <base url> <admin user> <admin pass> [expected version]');
	process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let auth = {};

const step = async (name, fn) => {
	process.stdout.write(`• ${name} … `);
	try {
		const out = await fn();
		console.log('ok');
		return out;
	} catch (err) {
		console.log('FAILED');
		console.error(err);
		process.exit(1);
	}
};

const call = async (method, path, body, { raw = false, headers = {} } = {}) => {
	const res = await fetch(`${base}/api/v1/${path}`, {
		method,
		headers: {
			...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
			...auth,
			...headers,
		},
		body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
	});
	if (raw) return res;
	const json = await res.json().catch(() => ({}));
	if (!res.ok || json.success === false) {
		throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
	}
	return json;
};

const waitFor = async (what, check, timeoutMs = 20000) => {
	const deadline = Date.now() + timeoutMs;
	let last;
	while (Date.now() < deadline) {
		last = await check();
		if (last.ok) return last;
		await sleep(500);
	}
	throw new Error(`timed out waiting for ${what}; last: ${JSON.stringify(last)}`);
};

const presenceOf = async (userId) => (await call('GET', `users.getPresence?userId=${userId}`)).presence;

const ddp = (url) =>
	new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		let id = 0;
		const pending = new Map();
		ws.addEventListener('message', (event) => {
			const msg = JSON.parse(event.data);
			if (msg.msg === 'ping') ws.send(JSON.stringify({ msg: 'pong', id: msg.id }));
			if (msg.msg === 'connected') resolve(client);
			if (msg.msg === 'result' && pending.has(msg.id)) {
				const { ok, ko } = pending.get(msg.id);
				pending.delete(msg.id);
				msg.error ? ko(new Error(JSON.stringify(msg.error))) : ok(msg.result);
			}
		});
		ws.addEventListener('open', () => ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
		ws.addEventListener('error', (e) => reject(e.error ?? new Error('websocket error')));
		const client = {
			method: (method, ...params) =>
				new Promise((ok, ko) => {
					const mid = String(++id);
					pending.set(mid, { ok, ko });
					ws.send(JSON.stringify({ msg: 'method', id: mid, method, params }));
				}),
			close: () => ws.close(),
		};
	});

await step('web client is served', async () => {
	const res = await fetch(`${base}/`);
	const html = await res.text();
	if (!res.ok || !html.includes('__meteor_runtime_config__')) throw new Error(`GET / -> ${res.status}`);
});

await step('server info', async () => {
	const res = await fetch(`${base}/api/info`);
	const info = await res.json();
	if (expectedVersion && info.version !== expectedVersion) throw new Error(`version ${info.version} != ${expectedVersion}`);
	console.log(`(version ${info.version}) `);
});

const me = await step('REST login', async () => {
	const res = await fetch(`${base}/api/v1/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ user: adminUser, password: adminPass }),
	});
	const json = await res.json();
	if (json.status !== 'success') throw new Error(JSON.stringify(json));
	auth = { 'X-Auth-Token': json.data.authToken, 'X-User-Id': json.data.userId };
	return { userId: json.data.userId, token: json.data.authToken };
});

await step('REST login alone does not mark the user online', async () => {
	await sleep(1500);
	const p = await presenceOf(me.userId);
	if (p !== 'offline') throw new Error(`presence ${p}`);
});

const alice = await step('create a second user', async () =>
	(
		await call('POST', 'users.create', {
			name: 'Alice Smoke',
			username: 'alice.smoke',
			email: 'alice.smoke@example.invalid',
			password: 'Smoke-test-pass-1!',
			verified: true,
		})
	).user,
);

const channel = await step('create a channel', async () =>
	(await call('POST', 'channels.create', { name: 'foss-smoke', members: [alice.username] })).channel,
);

await step('post and read back a message', async () => {
	const text = `hello from the FOSS smoke test ${Date.now()}`;
	await call('POST', 'chat.postMessage', { roomId: channel._id, text });
	const { messages } = await call('GET', `channels.messages?roomId=${channel._id}&count=10`);
	if (!messages.some((m) => m.msg === text)) throw new Error('message not found');
});

await step('upload a file and download it', async () => {
	const form = new FormData();
	const content = `foss smoke ${Date.now()}\n`;
	form.append('file', new Blob([content], { type: 'text/plain' }), 'smoke.txt');
	const { file } = await call('POST', `rooms.media/${channel._id}`, form);
	await call('POST', `rooms.mediaConfirm/${channel._id}/${file._id}`, { msg: 'smoke upload' });
	const res = await fetch(`${base}${file.url}`, { headers: auth });
	const body = await res.text();
	if (!res.ok || body !== content) throw new Error(`download ${res.status}: ${body.slice(0, 80)}`);
});

const session = await step('DDP connect and resume login', async () => {
	const client = await ddp(`${base.replace(/^http/, 'ws')}/websocket`);
	await client.method('login', { resume: me.token });
	return client;
});

await step('presence: online while the DDP session is open', () =>
	waitFor('online', async () => ({ ok: (await presenceOf(me.userId)) === 'online', presence: await presenceOf(me.userId) })),
);

await step('presence: away when the client reports idle', async () => {
	await session.method('UserPresence:away');
	await waitFor('away', async () => ({ ok: (await presenceOf(me.userId)) === 'away' }));
	await session.method('UserPresence:online');
	await waitFor('online again', async () => ({ ok: (await presenceOf(me.userId)) === 'online' }));
});

await step('presence: a chosen status wins over the connection', async () => {
	await call('POST', 'users.setStatus', { status: 'busy', message: 'smoke testing' });
	await waitFor('busy', async () => ({ ok: (await presenceOf(me.userId)) === 'busy' }));
	await call('POST', 'users.setStatus', { status: 'online' });
	await waitFor('online after reset', async () => ({ ok: (await presenceOf(me.userId)) === 'online' }));
});

await step('presence: offline once the DDP session closes', async () => {
	session.close();
	await waitFor('offline', async () => ({ ok: (await presenceOf(me.userId)) === 'offline' }));
});

await step('premium endpoints are refused, not crashing', async () => {
	const res = await call('GET', 'licenses.info', undefined, { raw: true });
	if (res.status >= 500) throw new Error(`licenses.info -> ${res.status}`);
	console.log(`(licenses.info -> ${res.status}) `);
});

console.log('smoke: all checks passed');
