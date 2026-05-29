<script lang="ts">
	import { getContext } from 'svelte';
	import FeaturesTab from '$lib/components/admin/manage/tabs/FeaturesTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<FeaturesTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
