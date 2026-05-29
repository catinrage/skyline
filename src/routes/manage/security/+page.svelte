<script lang="ts">
	import { getContext } from 'svelte';
	import SecurityTab from '$lib/components/admin/manage/tabs/SecurityTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<SecurityTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
