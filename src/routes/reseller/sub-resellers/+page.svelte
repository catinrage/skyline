<script lang="ts">
	import { getContext } from 'svelte';
	import SubResellersTab from '$lib/components/admin/reseller/tabs/SubResellersTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<SubResellersTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
