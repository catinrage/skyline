<script lang="ts">
	import LoadingState from '$lib/components/admin/LoadingState.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// /manage is rendered when the user has no specific tab selected.
	// The +layout.svelte handles auth gating; when authenticated, we
	// snap to the default tab. This page is a fallback view that
	// matches the loading state.
	onMount(() => {
		void goto('/manage/traffic', { replaceState: true });
	});
</script>

<LoadingState label="در حال آماده‌سازی داشبورد..." />
