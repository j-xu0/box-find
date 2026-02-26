<script lang="ts">
	import { goto, pushState, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { quintIn, quintOut } from 'svelte/easing';
	import 'carbon-components-svelte/css/g80.css';
	import {
		Button,
		Modal,
		TextInput,
		Search,
		ClickableTile,
		Truncate,
		PaginationNav,
		ProgressBar,
		ToastNotification
	} from 'carbon-components-svelte';
	import Add from 'carbon-icons-svelte/lib/Add.svelte';
	import { MasonryGrid } from '@egjs/svelte-grid';
	import type { FuzzyFilterResult } from 'fuzzbunny';
	import type { boxDataLean, progressBarStatus, toastData, toastType } from '$lib/types/types';

	const align = 'start';
	const column = 0;
	const gap = 16;
	const defaultDirection = 'end';

	/** @type {import('./$types').PageData} */
	export let data;
	let pageNum = 1;
	let lastPage = data.lastPage;

	let searchQuery = '';
	let searchedQuery = '';
	let results: FuzzyFilterResult<boxDataLean>[] = [];
	let fromEmptySearch = true;
	let searching = false;
	let status: progressBarStatus = 'finished';

	//search stuff

	let oldSearchQuery = searchQuery;

	let toasts: toastData[] = [];

	$: {
		if (searchQuery !== oldSearchQuery) {
			if (searchQuery != '') {
				searching = true;
				status = 'active';
				(async () => {
					$page.url.searchParams.set('query', searchQuery);
					replaceState($page.url, {});
					const res = await fetch(`/api/search/2?query=${encodeURIComponent(searchQuery)}`);
					results = await res.json();
					searching = false;
					fromEmptySearch = false;
					status = 'finished';
					searchedQuery = searchQuery;
				})();
			} else {
				//results = [];
				$page.url.searchParams.delete('query');
				replaceState($page.url, {});
				fromEmptySearch = true;
			}
			oldSearchQuery = searchQuery;
		}
	}

	//if query is in url, set searchQuery to it on mount
	onMount(() => {
		if ($page.url.searchParams.has('query')) {
			searchQuery = $page.url.searchParams.get('query') || '';
			searching = true;
			status = 'active';
			(async () => {
				const res = await fetch(`/api/search/2?query=${encodeURIComponent(searchQuery)}`);
				results = await res.json();
				searching = false;
				status = 'finished';
				fromEmptySearch = false;
				searchedQuery = searchQuery;
			})();
		}
	});

	//pagination stuff
	$: {
		if (browser) {
			if (pageNum != 1) {
				goto(`/page/${pageNum}`);
			}
		}
	}

	const newBox = async (id: string) => {
		const res = await fetch('/api/newBox', {
			method: 'POST',
			body: JSON.stringify({ id }),
			headers: {
				'content-type': 'application/json'
			}
		});
		const resJson = await res.json();
		//console.log(resJson);
		if (res.status != 409 && resJson.id == id) {
			goto(`/box/${encodeURIComponent(id)}`);
		} else if (res.status == 409) {
			modalShow = false;
			addToast('error', 'Error creating a new box', `A box with id: "${id}" already exists.`);
		} else {
			modalShow = false;
			addToast('error', 'Error creating a new box', `An unknown error occurred.`);
		}
	};

	const addToast = (type: toastType, title: string, subtitle: string) => {
		toasts = [
			...toasts,
			{ type, title, subtitle, caption: new Date().toLocaleString(), timeout: 5000 }
		];
	};

	const composeImageAltText = (id: string) => {
		return `Picture of "${id}'s" contents`;
	};

	// modal handling

	let modalShow = false;
	let newBoxID = '';

	function showModal() {
		modalShow = true;
		pushState('', {
			showModal: true
		});
	}
	function hideModal() {
		history.back();
	}

	$: {
		//handle when modal changes state of modalShow
		if (!modalShow && browser && $page.state?.showModal) {
			hideModal();
		}
	}
	$: {
		//handles user browser back action
		if (!$page.state?.showModal) {
			modalShow = false;
		}
	}
</script>

<svelte:head>
	<title>Home | Box Find</title>
</svelte:head>

<div class="wrapper">
	<div class="searchBar sticky">
		<span>
			<Search bind:value={searchQuery} />
			<ProgressBar size="sm" kind="inline" {status} hideLabel={true} />
		</span>

		<span class="newBox">
			<Button on:click={showModal} iconDescription="New Box" icon={Add} />
		</span>
	</div>

	{#if searchQuery == '' || (searching && fromEmptySearch)}
		<!-- default home page -->
		<!-- likely will change searching behavior -->
		{#each data.contents as item}
			<ClickableTile href="/box/{encodeURIComponent(item.id)}" style="margin-bottom: 1em;">
				<h2>{item.id}</h2>
				<Truncate>
					{item.contents.replace(/\n/g, ', ')}
				</Truncate>
				{#if item.images.length > 0}
					<div class="content" style="border-bottom:1px solid; margin:.75em 0 .75em 0;" />

					<h4>Pictures</h4>
					<MasonryGrid {defaultDirection} {gap} {align} {column}>
						{#each item.images as photo}
							<img
								src={photo}
								alt={composeImageAltText(item.id)}
								style="min-width: 200px; width: 10vw; max-height: 350px;"
							/>
						{/each}
					</MasonryGrid>
				{/if}
			</ClickableTile>
		{/each}
		<div style="display:flex; justify-content:center; align-items:center;">
			<PaginationNav total={lastPage} tooltipPosition="top" bind:page={pageNum} />
		</div>
	{:else if results.length > 0 || (searching && results.length > 0)}
		<!-- search results -->
		{#each results as item}
			<ClickableTile href="/box/{encodeURIComponent(item.item.id)}" style="margin-bottom: 1em;">
				<h2>{item.item.id}</h2>
				<Truncate>
					{item.item.contents.replace(/\n/g, ', ')}
				</Truncate>
				{#if item.item.images.length > 0}
					<div class="content" style="border-bottom:1px solid; margin:.75em 0 .75em 0;" />

					<h4>Pictures</h4>
					<MasonryGrid {defaultDirection} {gap} {align} {column}>
						{#each item.item.images as photo}
							<img
								src={photo}
								alt={composeImageAltText(item.item.id)}
								style="min-width: 200px; width: 10vw; max-height: 350px;"
							/>
						{/each}
					</MasonryGrid>
				{/if}
			</ClickableTile>
		{/each}
		{#if searchQuery == ''}
			<!-- only show paginationnav when not searching -->
			<div style="display:flex; justify-content:center; align-items:center;">
				<PaginationNav total={lastPage} tooltipPosition="top" bind:page={pageNum} />
			</div>
		{/if}
	{:else}
		<h3>No results found for "{searchedQuery}"</h3>
		<p>But here's a cookie! 🍪</p>
	{/if}
</div>

<Modal
	bind:open={modalShow}
	modalHeading="Create a new Box"
	primaryButtonText="Create Box"
	selectorPrimaryFocus="#box-name"
	secondaryButtonText="Cancel"
	on:click:button--secondary={() => {
		modalShow = false;
		newBoxID = '';
	}}
	on:click:button--primary={() => {
		if (newBoxID != '') {
			newBox(newBoxID);
			newBoxID = '';
		}
	}}
>
	<TextInput id="box-name" labelText="Box ID" placeholder="Enter box ID..." bind:value={newBoxID} />
</Modal>

<div class="toasts">
	{#each toasts as toast}
		<div
			class="toast"
			in:fade={{ duration: 250, easing: quintIn }}
			out:fade={{ duration: 500, easing: quintOut }}
		>
			<ToastNotification
				kind={toast.type}
				title={toast.title}
				subtitle={toast.subtitle}
				caption={toast.caption}
				lowContrast
			/>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		z-index: 1;
		bottom: 15px;
		right: 15px;
	}
	.wrapper {
		margin: 0 1.5em 1.5em 1.5em;
	}
	.searchBar {
		display: flex;
		padding-bottom: 1em;
		padding-top: 1.5em;
	}
	.searchBar > :first-child {
		flex-grow: 1;
	}
	.newBox {
		padding-left: 1em;
	}
	.sticky {
		position: sticky;
		top: 0;
		background-color: #393939;
		z-index: 1;
	}
</style>
