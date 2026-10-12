<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import ChevronLeft from 'svelte-radix/ChevronLeft.svelte';
	import Cube from 'svelte-radix/Cube.svelte';
	import ChevronRight from 'svelte-radix/ChevronRight.svelte';
	import MagnifyingGlass from 'svelte-radix/MagnifyingGlass.svelte';
	import Plus from 'svelte-radix/Plus.svelte';
	import BoxCard from './BoxCard.svelte';
	import ToastStack from './ToastStack.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import type { FuzzyFilterResult } from 'fuzzbunny';
	import type { boxDataLean, toastData, toastType } from '$lib/types/types';

	export let data: {
		contents: boxDataLean[];
		lastPage: number;
		demoMode: boolean;
	};
	export let currentPage = 1;

	let searchQuery = $page.url.searchParams.get('query') ?? '';
	let pageUrl = $page.url.href;
	let searchedQuery = '';
	let results: FuzzyFilterResult<boxDataLean>[] = [];
	let searching = false;
	let searchTimer: number | undefined;
	let searchRequest: AbortController | undefined;
	let searchGeneration = 0;
	let modalShow = false;
	let newBoxID = '';
	let creating = false;
	let toasts: toastData[] = [];
	let initialized = false;

	// Shallow history updates change page state without changing $page.url.
	$: if ($page.url.href !== pageUrl) {
		pageUrl = $page.url.href;
		searchQuery = $page.url.searchParams.get('query') ?? '';
	}

	$: displayedBoxes = searchQuery.trim() ? results.map((result) => result.item) : data.contents;
	$: visiblePages = getVisiblePages(data.lastPage, currentPage);

	$: if (browser && initialized) {
		queueSearch(searchQuery);
	}

	function getVisiblePages(total: number, active: number) {
		if (total <= 1) return total === 1 ? [1] : [];
		const pages = new Set([1, total]);
		for (let offset = -2; offset <= 2; offset += 1) {
			const candidate = active + offset;
			if (candidate > 1 && candidate < total) pages.add(candidate);
		}
		return [...pages].toSorted((a, b) => a - b);
	}

	function updateSearch(query: string) {
		const url = new URL(window.location.href);
		if (query.trim()) url.searchParams.set('query', query);
		else url.searchParams.delete('query');
		if (url.href !== window.location.href) replaceState(url, $page.state);
	}

	function queueSearch(query: string) {
		const generation = ++searchGeneration;
		window.clearTimeout(searchTimer);
		searchRequest?.abort();
		const trimmed = query.trim();

		if (!trimmed) {
			results = [];
			searchedQuery = '';
			searching = false;
			return;
		}

		searching = true;
		searchTimer = window.setTimeout(() => runSearch(query, generation), 180);
	}

	async function runSearch(query: string, generation: number) {
		searchRequest = new AbortController();
		try {
			const response = await fetch(`/api/search/2?query=${encodeURIComponent(query)}`, {
				signal: searchRequest.signal
			});
			if (!response.ok) throw new Error(`Search returned ${response.status}`);
			const nextResults = await response.json();
			if (generation !== searchGeneration) return;
			results = nextResults;
			searchedQuery = query;
		} catch (error) {
			if (generation !== searchGeneration || searchRequest?.signal.aborted) return;
			addToast('error', 'Search failed', 'Try the search again in a moment.');
		} finally {
			if (generation === searchGeneration) searching = false;
		}
	}

	async function createBox() {
		const id = newBoxID.trim();
		if (!id || creating) return;

		if (data.demoMode) {
			modalShow = false;
			addToast('error', 'Demo mode', 'Edits are restricted in demo mode.');
			return;
		}

		creating = true;
		try {
			const response = await fetch('/api/newBox', {
				method: 'POST',
				body: JSON.stringify({ id }),
				headers: { 'content-type': 'application/json' }
			});
			const responseData = await response.json();
			if (response.status !== 409 && responseData.id === id) {
				await goto(`/box/${encodeURIComponent(id)}`);
			} else if (response.status === 409) {
				modalShow = false;
				addToast('error', 'Box already exists', `A box named “${id}” already exists.`);
			} else {
				modalShow = false;
				addToast('error', 'Could not create box', responseData.error || 'Try again in a moment.');
			}
		} finally {
			creating = false;
			newBoxID = '';
		}
	}

	function addToast(type: toastType, title: string, subtitle: string) {
		toasts = [...toasts, { type, title, subtitle, caption: '', timeout: 5000 }];
	}

	onMount(() => {
		initialized = true;
	});

	onDestroy(() => {
		searchGeneration += 1;
		if (searchTimer) clearTimeout(searchTimer);
		searchRequest?.abort();
	});
</script>

<svelte:head>
	<title>Home | Box Find</title>
	<meta name="description" content="Find and manage the things stored in your boxes." />
</svelte:head>

<Dialog.Root bind:open={modalShow}>
	<main class="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
		<header class="mb-6 flex items-center justify-between gap-4">
			<div class="flex h-10 min-w-0 items-center gap-2.5">
				<Cube class="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
				<h1 class="text-2xl font-semibold leading-none tracking-tight">Box Find</h1>
			</div>
			<Dialog.Trigger class={buttonVariants({ class: 'h-10 shrink-0 gap-2' })} aria-label="New box">
				<Plus class="h-5 w-5" />
				New box
			</Dialog.Trigger>
		</header>
		<div class="sticky top-0 z-30 flex bg-background pb-6">
			<div class="relative min-w-0 flex-1">
				<MagnifyingGlass
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Label for="box-search" class="sr-only">Search boxes</Label>
				<Input
					id="box-search"
					type="search"
					placeholder="Search box names and contents…"
					class="h-10 pl-10 pr-4 text-sm"
					bind:value={searchQuery}
					on:input={(event) => updateSearch(event.currentTarget.value)}
				/>
				{#if searching}
					<Progress
						value={65}
						class="absolute bottom-0 left-1 h-0.5 w-[calc(100%-0.5rem)] bg-transparent [&>div]:animate-pulse"
					/>
				{/if}
			</div>
		</div>

		{#if displayedBoxes.length > 0}
			<div class="space-y-4">
				{#each displayedBoxes as item (item.id)}
					<BoxCard {item} />
				{/each}
			</div>
		{:else if !searching && searchQuery.trim()}
			<h3 class="pt-2 text-lg font-semibold">No results found for “{searchedQuery}”</h3>
			<p class="mt-2 text-sm text-muted-foreground">Try a different box name or item.</p>
		{:else if !searching}
			<h3 class="pt-2 text-lg font-semibold">No boxes yet</h3>
			<p class="mt-2 text-muted-foreground">Create a new box to get started.</p>
		{/if}

		{#if !searchQuery.trim() && data.lastPage > 1}
			<nav class="mt-8 flex items-center justify-center gap-1" aria-label="Box pages">
				<Button
					variant="outline"
					size="icon"
					aria-label="Previous page"
					disabled={currentPage <= 1}
					on:click={() => goto(currentPage - 1 === 1 ? '/' : `/page/${currentPage - 1}`)}
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				{#each visiblePages as pageNumber, index}
					{#if index > 0 && pageNumber - visiblePages[index - 1] > 1}
						<span class="px-1 text-muted-foreground" aria-hidden="true">…</span>
					{/if}
					<Button
						variant={pageNumber === currentPage ? 'default' : 'outline'}
						size="icon"
						aria-label="Page {pageNumber}"
						aria-current={pageNumber === currentPage ? 'page' : undefined}
						on:click={() => goto(pageNumber === 1 ? '/' : `/page/${pageNumber}`)}
					>
						{pageNumber}
					</Button>
				{/each}
				<Button
					variant="outline"
					size="icon"
					aria-label="Next page"
					disabled={currentPage >= data.lastPage}
					on:click={() => goto(`/page/${currentPage + 1}`)}
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</nav>
		{/if}
	</main>

	<Dialog.Content class="sm:max-w-md">
		<form on:submit|preventDefault={createBox}>
			<Dialog.Header>
				<Dialog.Title>Create a new box</Dialog.Title>
				<Dialog.Description>Give the box a short, recognizable name.</Dialog.Description>
			</Dialog.Header>
			<div class="py-5">
				<Label for="box-name">Box name</Label>
				<Input
					id="box-name"
					class="mt-2"
					placeholder="e.g. Camping gear"
					bind:value={newBoxID}
					on:input={(event) => (newBoxID = event.currentTarget.value)}
					autocomplete="off"
				/>
			</div>
			<Dialog.Footer class="gap-2 sm:gap-0">
				<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={!newBoxID.trim() || creating}>
					{creating ? 'Creating…' : 'Create box'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ToastStack bind:toasts />
