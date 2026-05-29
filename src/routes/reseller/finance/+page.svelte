<script lang="ts">
	import { getContext } from 'svelte';
	import FinanceTab from '$lib/components/admin/reseller/tabs/FinanceTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<FinanceTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
