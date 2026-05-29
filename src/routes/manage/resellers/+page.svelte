<script lang="ts">
	import { getContext } from 'svelte';
	import ResellersTab from '$lib/components/admin/manage/tabs/ResellersTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<ResellersTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
