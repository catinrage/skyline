<script lang="ts">
	import { getContext } from 'svelte';
	import OverviewTab from '$lib/components/admin/reseller/tabs/OverviewTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<OverviewTab data={resellerState.current} />
{:else}
	<LoadingState />
{/if}
