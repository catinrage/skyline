<script lang="ts">
	import { getContext } from 'svelte';
	import ManagerConfigsTab from '$lib/components/admin/manage/tabs/ManagerConfigsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<ManagerConfigsTab data={manageState.current} {manageState} />
{:else}
	<LoadingState />
{/if}
