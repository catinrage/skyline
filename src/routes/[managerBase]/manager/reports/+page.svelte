<script lang="ts">
	import { getContext } from 'svelte';
	import ReportsTab from '$lib/components/admin/manage/tabs/ReportsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<ReportsTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
