<script lang="ts">
	import { getContext } from 'svelte';
	import ClientAppsTab from '$lib/components/admin/manage/tabs/ClientAppsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<ClientAppsTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
