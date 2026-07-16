import adapter from 'svelte-adapter-bun';
import { optimizeImports } from 'carbon-preprocess-svelte';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess(), optimizeImports()],
	vitePlugin: {
		experimental: {
			// @egjs/svelte-grid still publishes only the legacy `svelte` field. The plugin
			// resolves it correctly, but the package has no release with an exports condition.
			disableSvelteResolveWarnings: true
		}
	},
	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter()
	}
};

export default config;
