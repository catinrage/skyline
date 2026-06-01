import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	compilerOptions: {
		experimental: {
			async: true
		}
	},

	kit: {
		adapter: adapter({ bodySize: 256 * 1024 * 1024 }),
		experimental: {
			remoteFunctions: true
		}
	}
};

export default config;
