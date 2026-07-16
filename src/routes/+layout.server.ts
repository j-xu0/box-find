import { isDemoMode } from '$lib/server/demo-mode';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	demoMode: isDemoMode()
});
