<script lang="ts">
	import { getContext } from 'svelte';
	import TelegramTab from '$lib/components/admin/reseller/tabs/TelegramTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<TelegramTab data={resellerState.current} {resellerState} />
{:else}
	<LoadingState />
{/if}
