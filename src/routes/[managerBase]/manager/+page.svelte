<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	onMount(() => {
		// Snap to default tab while preserving the hidden base.
		const segments = page.url.pathname.split('/').filter(Boolean);
		const base = segments[0];
		if (base) {
			void goto(`/${base}/manager/traffic`, { replaceState: true });
		}
	});
</script>

<LoadingState label="در حال آماده‌سازی داشبورد..." />
