<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	onMount(() => {
		void goto(`/${page.params.resellerBase}/reseller/overview`, { replaceState: true });
	});
</script>

<LoadingState label="در حال آماده‌سازی پنل فروشنده..." />
