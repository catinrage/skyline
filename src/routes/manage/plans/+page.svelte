<script lang="ts">
	import { getContext } from 'svelte';
	import PlansTab from '$lib/components/admin/manage/tabs/PlansTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<PlansTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
