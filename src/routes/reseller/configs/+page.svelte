<script lang="ts">
	import { getContext } from 'svelte';
	import ConfigsTab from '$lib/components/admin/reseller/tabs/ConfigsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<ConfigsTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
