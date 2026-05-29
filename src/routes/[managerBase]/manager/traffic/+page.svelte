<script lang="ts">
	import { getContext } from 'svelte';
	import TrafficTab from '$lib/components/admin/manage/tabs/TrafficTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<TrafficTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
