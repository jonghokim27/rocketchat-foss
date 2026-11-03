// Browser smoke test: the FOSS web client must load, log in, open a room and send a message
// without an uncaught exception. Removed licensed client code would surface here, not in REST.
//
//   node scripts/smoke-browser.mjs <base url> <user> <password> <screenshot dir>
import { chromium } from 'playwright';

const [base, user, pass, shots = '.'] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));

let failed = false;
try {
	await page.goto(`${base}/home`, { waitUntil: 'domcontentloaded' });
	await page.locator('input[name="usernameOrEmail"]').fill(user, { timeout: 120000 });
	await page.locator('input[name="password"]').fill(pass);
	await page.locator('input[name="password"]').press('Enter');
	// Navigating before the login round trip finishes would drop it.
	await page.waitForFunction(() => Boolean(localStorage.getItem('Meteor.loginToken')), undefined, { timeout: 60000 });

	await page.goto(`${base}/channel/foss-smoke`, { waitUntil: 'domcontentloaded' });
	const composer = page.locator('textarea[name="msg"], [name="msg"]').first();
	await composer.waitFor({ timeout: 120000 });
	const text = `browser smoke ${Date.now()}`;
	await composer.click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
	await page.getByText(text).first().waitFor({ timeout: 30000 });
	// The composer shows the message optimistically; confirm the server stored it.
	await page.waitForFunction(
		async (expected) => {
			const headers = { 'X-User-Id': localStorage.getItem('Meteor.userId'), 'X-Auth-Token': localStorage.getItem('Meteor.loginToken') };
			const res = await fetch('/api/v1/channels.messages?roomName=foss-smoke&count=20', { headers });
			const { messages = [] } = await res.json();
			return messages.some((m) => m.msg === expected);
		},
		text,
		{ timeout: 30000, polling: 1000 },
	);
	await page.screenshot({ path: `${shots}/room.png` });
	console.log('• browser: logged in, opened #foss-smoke, sent a message … ok');
} catch (err) {
	failed = true;
	console.error('• browser … FAILED', err);
	await page.screenshot({ path: `${shots}/failure.png` }).catch(() => undefined);
}

if (consoleErrors.length) {
	console.log(`console errors (${consoleErrors.length}, informational):`);
	for (const e of consoleErrors.slice(0, 30)) console.log(`  - ${e.slice(0, 300)}`);
}
if (pageErrors.length) {
	failed = true;
	console.error(`uncaught page errors (${pageErrors.length}):`);
	for (const e of pageErrors) console.error(`  - ${e.slice(0, 1000)}`);
}

await browser.close();
process.exit(failed ? 1 : 0);
