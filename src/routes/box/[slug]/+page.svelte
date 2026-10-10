<script lang="ts">
	import { afterNavigate, beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { Tooltip } from 'bits-ui';
	import { onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import ArrowLeft from 'svelte-radix/ArrowLeft.svelte';
	import Camera from 'svelte-radix/Camera.svelte';
	import Check from 'svelte-radix/Check.svelte';
	import Home from 'svelte-radix/Home.svelte';
	import Pencil1 from 'svelte-radix/Pencil1.svelte';
	import Plus from 'svelte-radix/Plus.svelte';
	import Reload from 'svelte-radix/Reload.svelte';
	import Trash from 'svelte-radix/Trash.svelte';
	import ToastStack from '$lib/components/ToastStack.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { MAX_PHOTO_BYTES } from '$lib/photos';
	import { saveBoxChanges } from '$lib/save-workflow';
	import { navigationProtection } from '$lib/editor-protection';
	import type { toastData, toastType } from '$lib/types/types';
	import type { PageData } from './$types';

	export let data: PageData;

	let id: string = data.box ?? $page.params.slug ?? '';
	let contents = data.contents;
	let initialContents = data.contents;
	let photos: string[] = data.images;
	let deletedPhotos: string[] = [];
	let newPhotos: string[] = [];
	let fileInput: HTMLInputElement;
	let saving = false;
	let toasts: toastData[] = [];

	let cancelModalOpen = false;
	let deleteModalOpen = false;
	let editingName = false;
	let renaming = false;
	let cameFromInventory = false;
	let discardingChanges = false;

	let deleting = false;
	let photoReaders: FileReader[] = [];
	let pendingExit: { delta: number } | { url: string } | null = null;
	let completingRename = false;

	beforeNavigate((navigation) => {
		const protection = navigationProtection({
			busy: saving || renaming || deleting,
			dirty: hasChanges || hasNameChanges,
			readingPhotos: photoReaders.length > 0,
			discarding: discardingChanges || completingRename,
			willUnload: navigation.willUnload,
			popstate: navigation.type === 'popstate',
			dialogOpen: cancelModalOpen || deleteModalOpen
		});
		if (protection === 'allow') return;
		navigation.cancel();
		// SvelteKit uses cancellation during unload for the browser's native confirmation.
		if (navigation.willUnload) return;
		if (protection === 'busy') {
			addToast('warning', 'Please wait', 'Wait for the current changes to finish saving.');
			return;
		}
		if (protection === 'close-dialog') {
			cancelModalOpen = false;
			deleteModalOpen = false;
			pendingExit = null;
			return;
		}
		pendingExit =
			navigation.type === 'popstate'
				? { delta: navigation.delta }
				: navigation.to
					? { url: navigation.to.url.href }
					: null;
		cancelModalOpen = true;
	});

	onDestroy(() => photoReaders.forEach((reader) => reader.abort()));

	afterNavigate(({ from }) => {
		const nextId = data.box ?? $page.params.slug ?? '';
		if (nextId !== id) {
			// SvelteKit reuses this component when navigating between box slugs.
			photoReaders.forEach((reader) => reader.abort());
			photoReaders = [];
			id = nextId;
			contents = initialContents = data.contents;
			photos = data.images;
			newPhotos = [];
			deletedPhotos = [];
			editingName = false;
			editBoxName = id;
			cameFromInventory = false;
		}
		discardingChanges = false;
		pendingExit = null;
		if (from?.route.id === '/' || from?.route.id === '/page/[slug]') {
			cameFromInventory = true;
		}
	});

	let nameInput: HTMLInputElement;
	let nameButton: HTMLButtonElement;
	let editBoxName: string = id;

	$: busy = saving || renaming || deleting;
	$: hasNameChanges = editingName && editBoxName.trim() !== id;
	$: hasChanges = initialContents !== contents || newPhotos.length > 0 || deletedPhotos.length > 0;

	function addToast(type: toastType, title: string, subtitle: string) {
		toasts = [...toasts, { type, title, subtitle, caption: '', timeout: 5000 }];
	}

	function selectPhoto(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		if (busy) return;
		const image = event.currentTarget.files?.[0];
		if (!image) return;
		if (image.size > MAX_PHOTO_BYTES) {
			addToast('error', 'Photo too large', 'Choose a photo smaller than 10 MiB.');
			fileInput.value = '';
			return;
		}

		const reader = new FileReader();
		photoReaders = [...photoReaders, reader];
		reader.addEventListener('error', () =>
			addToast('error', 'Could not read photo', 'Try selecting the photo again.')
		);
		reader.addEventListener('loadend', () => {
			photoReaders = photoReaders.filter((pending) => pending !== reader);
			if (fileInput) fileInput.value = '';
		});
		reader.addEventListener('load', () => {
			const photo = reader.result;
			if (typeof photo !== 'string' || photos.includes(photo)) return;
			photos = [...photos, photo];
			newPhotos = [...newPhotos, photo];
		});
		reader.readAsDataURL(image);
	}

	function removePhoto(index: number) {
		if (busy) return;
		const photo = photos[index];
		if (newPhotos.includes(photo)) {
			newPhotos = newPhotos.filter((candidate) => candidate !== photo);
		} else {
			deletedPhotos = [...deletedPhotos, photo];
		}
		photos = photos.filter((_, photoIndex) => photoIndex !== index);
	}

	async function save() {
		if (!hasChanges || busy || photoReaders.length > 0) return;
		if (data.demoMode) {
			addToast('error', 'Demo mode', 'Edits are restricted in demo mode.');
			return;
		}

		const submittedContents = contents;
		saving = true;
		try {
			const result = await saveBoxChanges({
				id,
				contents: submittedContents,
				contentsChanged: initialContents !== contents,
				newPhotos: [...newPhotos],
				delPhotos: [...deletedPhotos]
			});

			photos = [
				...new Set(
					photos.map(
						(photo) =>
							result.uploadedPhotos.find(({ original }) => original === photo)?.image ?? photo
					)
				)
			];
			if (result.contentsSaved) initialContents = submittedContents;
			newPhotos = result.remainingUploads;
			deletedPhotos = result.remainingDeletions;

			if (result.outcome === 'success') {
				addToast('success', 'Changes saved', `Box “${id}” is up to date.`);
			} else if (result.outcome === 'partial') {
				addToast(
					'warning',
					'Some changes were not saved',
					`${result.succeeded} of ${result.attempted} changes saved. ${result.failures.map(({ message }) => message).join('; ')}`
				);
			} else if (result.outcome === 'failure') {
				addToast(
					'error',
					'Changes were not saved',
					result.failures.map(({ message }) => message).join('; ')
				);
			}
		} finally {
			saving = false;
		}
	}

	async function deleteBox() {
		if (busy) return;
		if (data.demoMode) {
			deleteModalOpen = false;
			addToast('error', 'Demo mode', 'Edits are restricted in demo mode.');
			return;
		}

		deleting = true;
		try {
			const response = await fetch('/api/deleteBox', {
				method: 'DELETE',
				body: JSON.stringify({ id }),
				headers: { 'content-type': 'application/json' }
			});
			const responseData = await response.json();
			if (response.ok && responseData.status === 'ok') {
				discardingChanges = true;
				await goto('/');
			} else if (response.status === 404) {
				deleteModalOpen = false;
				addToast('error', 'Box not found', `Box “${id}” was not found.`);
			} else {
				deleteModalOpen = false;
				addToast('error', 'Could not delete box', responseData.error || 'Try again in a moment.');
			}
		} catch {
			addToast('error', 'Could not delete box', 'Check your connection and try again.');
		} finally {
			deleting = false;
		}
	}

	async function renameBox() {
		if (!editingName || busy || cancelModalOpen || deleteModalOpen) return;
		if (hasChanges || photoReaders.length > 0) {
			addToast(
				'warning',
				'Save changes first',
				'Save your content and photo changes before renaming.'
			);
			await cancelRenaming();
			return;
		}
		const newID = editBoxName.trim();
		if (!newID || newID === id) {
			await cancelRenaming();
			return;
		}
		if (data.demoMode) {
			addToast('error', 'Demo mode', 'Edits are restricted in demo mode.');
			return;
		}
		renaming = true;
		try {
			const response = await fetch('/api/renameBox', {
				method: 'PATCH',
				body: JSON.stringify({ id, editBoxName: newID }),
				headers: { 'content-type': 'application/json' }
			});
			const responseData = await response.json();
			if (response.ok && responseData?.newID === newID) {
				id = newID;
				completingRename = true;
				await goto(`/box/${encodeURIComponent(newID)}`, { replaceState: true });
				await cancelRenaming();
			} else {
				addToast(
					'error',
					'Could not rename box',
					responseData.error || `The server returned ${response.status}.`
				);
			}
		} catch {
			addToast('error', 'Could not rename box', 'Check your connection and try again.');
		} finally {
			renaming = false;
			completingRename = false;
		}
	}

	async function createBox() {
		if (data.demoMode) {
			addToast('error', 'Demo mode', 'Edits are restricted in demo mode.');
			return;
		}
		const response = await fetch('/api/newBox', {
			method: 'POST',
			body: JSON.stringify({ id }),
			headers: { 'content-type': 'application/json' }
		});
		const responseData = await response.json();
		if (response.ok && responseData.id === id) {
			await invalidateAll();
			initialContents = '';
			contents = '';
		} else {
			addToast('error', 'Could not create box', responseData.error || 'Try again in a moment.');
		}
	}

	function exitBox() {
		if (busy) return;
		discardingChanges = true;
		cancelModalOpen = false;
		deleteModalOpen = false;
		if (pendingExit && 'delta' in pendingExit) window.history.go(pendingExit.delta);
		else if (pendingExit && 'url' in pendingExit) goto(pendingExit.url);
		else if (cameFromInventory) window.history.back();
		else goto('/', { replaceState: true });
	}

	function openCancelDialog() {
		if (busy) return;
		pendingExit = null;
		if (!hasChanges && !hasNameChanges && photoReaders.length === 0) {
			exitBox();
			return;
		}
		cancelModalOpen = true;
	}

	function openDeleteDialog() {
		if (busy) return;
		deleteModalOpen = true;
	}

	async function startRenaming() {
		if (busy) return;
		editBoxName = id;
		editingName = true;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}

	async function cancelRenaming(restoreFocus = false) {
		editingName = false;
		editBoxName = id;
		if (restoreFocus) {
			await tick();
			nameButton?.focus();
		}
	}
</script>

<svelte:head>
	<title>{id} | Box Find</title>
</svelte:head>

<main class="wrapper">
	{#if data.boxExist}
		<header class="header">
			<div class="min-w-0 flex-1">
				<h1 class="text-3xl font-semibold tracking-tight">
					{#if editingName}
						<input
							id="edit-box-name"
							bind:this={nameInput}
							bind:value={editBoxName}
							class="name-input -ml-1 h-11 w-full min-w-0 border-0 bg-transparent px-1 py-1 text-3xl font-semibold leading-9 tracking-tight"
							aria-label="Box name"
							aria-describedby="rename-instructions"
							autocomplete="off"
							readonly={busy}
							on:blur={renameBox}
							on:keydown={(event) => {
								if (event.isComposing) return;
								if (event.key === 'Enter') {
									event.preventDefault();
									renameBox();
								} else if (event.key === 'Escape' && !busy) {
									event.preventDefault();
									cancelRenaming(true);
								}
							}}
						/>
						<span id="rename-instructions" class="sr-only"
							>Press Enter or leave the field to save. Press Escape to cancel.</span
						>
					{:else}
						<button
							type="button"
							class="group -ml-1 inline-flex min-h-11 max-w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							bind:this={nameButton}
							aria-label="Rename box {id}"
							disabled={busy}
							on:click={startRenaming}
						>
							<span class="min-w-0 break-words">{id}</span>
							<Pencil1
								class="name-edit-icon h-5 w-5 shrink-0 text-muted-foreground transition-opacity group-hover:text-primary"
								aria-hidden="true"
							/>
						</button>
					{/if}
				</h1>
			</div>
			<Tooltip.Root>
				<Tooltip.Trigger asChild let:builder>
					<Button
						variant="outline"
						size="icon"
						builders={[builder]}
						class="h-11 w-11 shrink-0 border-red-400/40 text-red-400 hover:bg-red-400/10 hover:text-red-300"
						aria-label="Delete box"
						disabled={busy}
						on:click={openDeleteDialog}
					>
						<Trash class="h-5 w-5" aria-hidden="true" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content
					side="bottom"
					sideOffset={8}
					class="z-50 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
				>
					Delete box
				</Tooltip.Content>
			</Tooltip.Root>
		</header>

		<div class="editables">
			<section class="text-box">
				<Label for="box-contents" class="mb-3 flex h-8 items-center text-base font-semibold"
					>Contents</Label
				>
				<Textarea
					id="box-contents"
					class="min-h-56 resize-y p-4 leading-6"
					placeholder="List box items separated by a new line..."
					rows={8}
					readonly={busy}
					bind:value={contents}
					on:input={(event) => (contents = event.currentTarget.value)}
				/>
			</section>

			<section class="images" aria-labelledby="photos-heading">
				<div class="mb-3 flex h-11 items-center justify-between gap-3 md:h-8">
					<h2 id="photos-heading" class="text-base font-semibold">
						Photos <span class="ml-1 text-sm font-normal text-muted-foreground"
							>({photos.length})</span
						>
					</h2>
					<Button
						variant="outline"
						size="sm"
						class="h-11 gap-2 md:h-8"
						disabled={busy || photoReaders.length > 0}
						on:click={() => fileInput.click()}
					>
						<Camera class="h-5 w-5" />
						Add Photo
					</Button>
				</div>
				<input
					type="file"
					disabled={busy || photoReaders.length > 0}
					accept=".png,.jpeg,.webp,.gif,.tiff,.jpg"
					capture="environment"
					on:change={selectPhoto}
					bind:this={fileInput}
					class="sr-only"
				/>

				{#if photos.length === 0}
					<div
						class="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
					>
						No photos yet
						<button
							type="button"
							class="min-h-11 rounded-sm px-3 text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							disabled={busy || photoReaders.length > 0}
							on:click={() => fileInput.click()}
						>
							Add one
						</button>
					</div>
				{/if}
				<MasonryGrid defaultDirection="end" gap={16} align="start" column={0}>
					{#each photos as photo, index}
						<div class="photo-stack">
							<img src={photo} alt="Contents of {id}" />
							<Button
								variant="destructive"
								size="icon"
								class="absolute right-3 top-3 h-10 w-10 bg-red-600 text-white hover:bg-red-500"
								aria-label="Remove photo {index + 1}"
								disabled={busy}
								on:click={() => removePhoto(index)}
							>
								<Trash class="h-5 w-5" />
							</Button>
						</div>
					{/each}
				</MasonryGrid>
			</section>
		</div>

		<div class="action-buttons">
			<Button variant="outline" class="h-10 gap-2 px-5" disabled={busy} on:click={openCancelDialog}>
				<ArrowLeft class="h-5 w-5" />
				Exit
			</Button>
			<Button
				type="button"
				class="h-10 gap-2 px-4"
				disabled={!hasChanges || busy || photoReaders.length > 0}
				on:click={save}
			>
				{#if saving}
					<Reload class="h-4 w-4 animate-spin" />
					Saving…
				{:else}
					<Check class="h-5 w-5" />
					Save
				{/if}
			</Button>
		</div>
	{:else}
		<h1 class="mb-6 text-3xl font-semibold tracking-tight">
			The box “{id}” does not yet exist. Would you like it to?
		</h1>
		<div class="flex gap-2">
			<Button variant="secondary" class="gap-2" on:click={() => goto('/')}>
				<Home class="h-4 w-4" />
				Go Home
			</Button>
			<Button class="gap-2" on:click={createBox}>
				<Plus class="h-4 w-4" />
				Create Box
			</Button>
		</div>
	{/if}
</main>

<Dialog.Root bind:open={deleteModalOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete “{id}”?</Dialog.Title>
			<Dialog.Description
				>Its contents and photos will be permanently deleted. This cannot be undone.</Dialog.Description
			>
		</Dialog.Header>
		<Dialog.Footer class="mt-3 gap-2 sm:gap-0">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
			<Button variant="destructive" disabled={busy} on:click={deleteBox}>Delete box</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={cancelModalOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Exit without saving?</Dialog.Title>
			<Dialog.Description
				>Your unsaved name, content, and photo changes will be discarded.</Dialog.Description
			>
		</Dialog.Header>
		<Dialog.Footer class="mt-3 gap-2 sm:gap-0">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Keep editing</Dialog.Close>
			<Button variant="destructive" disabled={busy} on:click={exitBox}>Discard and exit</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ToastStack bind:toasts />

<style>
	@media (hover: hover) and (pointer: fine) {
		.header :global(.name-edit-icon) {
			opacity: 0;
		}

		.header button:hover :global(.name-edit-icon),
		.header button:focus-visible :global(.name-edit-icon) {
			opacity: 1;
		}
	}

	.name-input:focus-visible {
		outline: none;
	}

	.wrapper {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.editables {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: 2rem;
	}

	.text-box {
		padding-top: 0;
	}

	.photo-stack {
		position: relative;
		width: 100%;
	}

	.photo-stack img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: var(--radius);
	}

	.action-buttons {
		position: sticky;
		bottom: 0;
		display: flex;
		gap: 0.75rem;
		margin-top: 2rem;
		padding: 1.25rem 0;
		border-top: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		z-index: 10;
	}

	.wrapper :global(svg path) {
		stroke: currentColor;
		stroke-width: 0.3;
	}

	@media (max-width: 768px) {
		.wrapper {
			padding: 1.5rem 1rem;
		}

		.header {
			align-items: center;
			gap: 1rem;
			margin-bottom: 1.5rem;
		}

		.editables {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.5rem;
		}

		.text-box {
			padding-top: 0;
		}
	}
</style>
