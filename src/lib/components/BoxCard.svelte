<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import type { boxDataLean } from '$lib/types/types';

	export let item: boxDataLean;

	$: contents = item.contents.trim().replace(/\n+/g, ', ');
</script>

<a
	class="group block rounded-lg focus-visible:outline-none"
	href="/box/{encodeURIComponent(item.id)}"
>
	<Card
		class="overflow-hidden transition-colors group-hover:border-primary/40 group-hover:bg-accent/40 group-focus-visible:ring-2 group-focus-visible:ring-ring"
	>
		<CardHeader class="p-5 pb-2">
			<CardTitle class="truncate text-lg leading-6">{item.id}</CardTitle>
		</CardHeader>
		<CardContent class="p-5 pt-0">
			<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
				{contents || 'No contents listed yet.'}
			</p>

			{#if item.images.length > 0}
				<div class="mt-4 border-t border-border pt-4">
					<h4 class="mb-3 text-sm font-semibold">
						Photos <span class="font-normal text-muted-foreground">({item.images.length})</span>
					</h4>
					<MasonryGrid defaultDirection="end" gap={16} align="start" column={0}>
						{#each item.images as photo}
							<img src={photo} alt="Contents of {item.id}" loading="lazy" />
						{/each}
					</MasonryGrid>
				</div>
			{/if}
		</CardContent>
	</Card>
</a>

<style>
	img {
		min-width: 200px;
		width: 10vw;
		max-height: 350px;
		max-width: 100%;
		border-radius: var(--radius);
	}
</style>
