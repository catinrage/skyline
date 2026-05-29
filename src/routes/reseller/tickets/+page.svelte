<script lang="ts">
	import { getContext } from 'svelte';
	import TicketsTab from '$lib/components/admin/reseller/tabs/TicketsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<TicketsTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
