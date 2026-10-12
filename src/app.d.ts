// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			photoPreview?: string;
			cancelModal?: boolean;
			editModal?: boolean;
			deleteModal?: boolean;
			showModal?: boolean;
		}
		// interface Platform {}
	}
}

export {};
