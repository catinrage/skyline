<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	onMount(() => {
		void goto('/reseller/overview', { replaceState: true });
	});
</script>

<LoadingState label="در حال آماده‌سازی پنل فروشنده..." />
