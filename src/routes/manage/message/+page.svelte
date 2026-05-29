<script lang="ts">
	import { getContext } from 'svelte';
	import MessageTab from '$lib/components/admin/manage/tabs/MessageTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<MessageTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
