<script lang="ts">
	import { getContext } from 'svelte';
	import AdminCreateConfigTab from '$lib/components/admin/manage/tabs/AdminCreateConfigTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<AdminCreateConfigTab data={manageState.current} {manageState} />
{:else}
	<LoadingState />
{/if}
