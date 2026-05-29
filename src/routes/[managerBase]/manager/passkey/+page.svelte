<script lang="ts">
	import { getContext } from 'svelte';
	import PasskeyTab from '$lib/components/admin/manage/tabs/PasskeyTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<PasskeyTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
