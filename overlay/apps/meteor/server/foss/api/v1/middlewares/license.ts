import type { MiddlewareHandler } from 'hono';

import { API } from '../../../../api/api';
import type { TypedOptions } from '../../../../api/definition';
import type { HonoContext } from '../../../../api/router';

/**
 * Routes declared with `license: [...]` belong to premium modules. A FOSS build has no license,
 * so such a route is refused the same way an unlicensed workspace refuses it.
 */
export const license =
	(options: TypedOptions, _license?: unknown): MiddlewareHandler =>
	async (c: HonoContext, next) => {
		if (!options.license?.length) {
			return next();
		}

		const failure = API.v1.failure('This is an enterprise feature [error-action-not-allowed]', 'error-action-not-allowed');
		return c.json(failure.body, failure.statusCode);
	};
