type CurlOptions = {
	url: string;
	method: string;
	params?: Record<string, string>;
	query?: Record<string, string>;
	content?: unknown;
	headers?: Record<string, string>;
	auth?: string;
};

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export const Utilities = {
	/** App strings live in the i18next namespace `app-<appId>` (see client/hooks/useTranslationsForApps.ts). */
	getI18nKeyForApp(key: string | undefined, appId: string): string {
		return key ? `app-${appId}:${key}` : '';
	},

	/** A copy-pasteable curl command for an app's API endpoint, one argument per line. */
	curl({ url, method, params, query, content, headers, auth }: CurlOptions): string {
		let target = url;
		for (const [name, value] of Object.entries(params ?? {})) {
			target = target.replace(`:${name}`, encodeURIComponent(value));
		}
		const search = new URLSearchParams(query ?? {}).toString();
		if (search) {
			target += `${target.includes('?') ? '&' : '?'}${search}`;
		}

		const lines = [`curl -X ${method.toUpperCase()} ${quote(target)}`];
		for (const [name, value] of Object.entries(headers ?? {})) {
			lines.push(`  -H ${quote(`${name}: ${value}`)}`);
		}
		if (auth) {
			lines.push(`  -u ${quote(auth)}`);
		}
		if (content !== undefined) {
			lines.push(`  -d ${quote(typeof content === 'string' ? content : JSON.stringify(content))}`);
		}
		return lines.join(' \\\n');
	},
};
