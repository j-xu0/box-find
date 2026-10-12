<script lang="ts">
	import { pushState } from '$app/navigation';
	import { page } from '$app/stores';
	import * as Dialog from '$lib/components/ui/dialog';

	export let src: string;
	export let alt: string;
	export let previewId: string;
	export let label: string;

	$: previewOpen = $page.state.photoPreview === previewId;

	function openPreview() {
		// SvelteKit shallow routing preserves the page and any unsaved editor changes.
		pushState('', { ...$page.state, photoPreview: previewId });
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen && !previewOpen) openPreview();
		// Close, Escape and Android Back all consume the same history entry.
		if (!nextOpen && $page.state.photoPreview === previewId) window.history.back();
	}
</script>

<Dialog.Root open={previewOpen} onOpenChange={handleOpenChange}>
	<Dialog.Trigger
		type="button"
		class="block w-full overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		aria-label={label}
	>
		<img
			{src}
			{alt}
			loading="lazy"
			class="block h-auto w-full transition-opacity hover:opacity-80"
		/>
	</Dialog.Trigger>
	<Dialog.Content
		overlayClass="bg-black/50 backdrop-blur-sm"
		class="pointer-events-none inset-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 rounded-none border-0 bg-transparent p-6 text-white shadow-none [&>button]:pointer-events-auto [&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:opacity-100"
	>
		<Dialog.Title class="sr-only">{label}</Dialog.Title>
		<Dialog.Description class="sr-only"
			>{alt}. Close to return to the photo tiles.</Dialog.Description
		>
		<img
			{src}
			{alt}
			class="pointer-events-auto block max-h-[min(80dvh,calc(100dvh-8rem))] max-w-full rounded-lg object-contain"
		/>
	</Dialog.Content>
</Dialog.Root>
