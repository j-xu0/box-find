import { json, type Handle } from '@sveltejs/kit';
import { DEMO_MODE_ERROR, isDemoMode } from './lib/server/demo-mode';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
	if (
		isDemoMode() &&
		event.url.pathname.startsWith('/api/') &&
		!READ_ONLY_METHODS.has(event.request.method)
	) {
		return json({ error: DEMO_MODE_ERROR }, { status: 403 });
	}

	return resolve(event);
};
