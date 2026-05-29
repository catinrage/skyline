<script lang="ts">
	import { getContext } from 'svelte';
	import SettingsTab from '$lib/components/admin/manage/tabs/SettingsTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<SettingsTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
