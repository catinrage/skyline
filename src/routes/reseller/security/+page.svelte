<script lang="ts">
	import { getContext } from 'svelte';
	import SecurityTab from '$lib/components/admin/reseller/tabs/SecurityTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../page.remote').getResellerState
	>;
</script>

{#if resellerState.current?.authenticated}
	<SecurityTab {resellerState} />
{:else}
	<LoadingState />
{/if}
