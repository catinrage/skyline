<script lang="ts">
	import { getContext } from 'svelte';
	import VlessRewriteTab from '$lib/components/admin/manage/tabs/VlessRewriteTab.svelte';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<VlessRewriteTab data={manageState.current} />
{:else}
	<LoadingState />
{/if}
