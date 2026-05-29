<script lang="ts">
	import { getContext } from 'svelte';
	import CreditRequestsTab from '$lib/components/admin/manage/tabs/CreditRequestsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<CreditRequestsTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
