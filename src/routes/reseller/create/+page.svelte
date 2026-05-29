<script lang="ts">
	import { getContext } from 'svelte';
	import CreateConfigTab from '$lib/components/admin/reseller/tabs/CreateConfigTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<CreateConfigTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
