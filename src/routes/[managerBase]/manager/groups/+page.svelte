<script lang="ts">
	import { getContext } from 'svelte';
	import GroupsTab from '$lib/components/admin/manage/tabs/GroupsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<GroupsTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
