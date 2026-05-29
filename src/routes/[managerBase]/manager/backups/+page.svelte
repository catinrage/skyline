<script lang="ts">
	import { getContext } from 'svelte';
	import BackupsTab from '$lib/components/admin/manage/tabs/BackupsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<BackupsTab data={manageState.current} {manageState} />
{:else}
	<LoadingState />
{/if}
