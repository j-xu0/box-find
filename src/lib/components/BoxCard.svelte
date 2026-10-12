<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import PhotoPreview from '$lib/components/PhotoPreview.svelte';
	import type { boxDataLean } from '$lib/types/types';

	export let item: boxDataLean;

	$: contents = item.contents.trim().replace(/\n+/g, ', ');
</script>

<Card class="overflow-hidden">
	<a
		class="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent/40"
		href="/box/{encodeURIComponent(item.id)}"
	>
		<CardHeader class="p-5 pb-2">
			<CardTitle class="truncate text-lg leading-6">{item.id}</CardTitle>
		</CardHeader>
		<CardContent class="p-5 pt-0">
			<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
				{contents || 'No contents listed yet.'}
			</p>
		</CardContent>
	</a>
	{#if item.images.length > 0}
		<div class="mx-5 mb-5 border-t border-border pt-4">
			<h4 class="mb-3 text-sm font-semibold">
				Photos <span class="font-normal text-muted-foreground">({item.images.length})</span>
			</h4>
			<div class="columns-2 gap-2 sm:columns-3 md:columns-4 lg:columns-5">
				{#each item.images as photo, index}
					<div class="mb-2 break-inside-avoid">
						<PhotoPreview
							src={photo}
							alt="Contents of {item.id}"
							previewId={JSON.stringify(['inventory', item.id, index])}
							label="View photo {index + 1} of {item.id}"
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</Card>
