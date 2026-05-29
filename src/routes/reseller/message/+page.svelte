<script lang="ts">
	import { getContext } from 'svelte';
	import MessageTab from '$lib/components/admin/reseller/tabs/MessageTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<MessageTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
