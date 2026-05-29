<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';
	import OverviewTab from '$lib/components/admin/reseller/tabs/OverviewTab.svelte';
	import CreateConfigTab from '$lib/components/admin/reseller/tabs/CreateConfigTab.svelte';
	import ConfigsTab from '$lib/components/admin/reseller/tabs/ConfigsTab.svelte';
	import FinanceTab from '$lib/components/admin/reseller/tabs/FinanceTab.svelte';
	import TicketsTab from '$lib/components/admin/reseller/tabs/TicketsTab.svelte';
	import MessageTab from '$lib/components/admin/reseller/tabs/MessageTab.svelte';
	import SecurityTab from '$lib/components/admin/reseller/tabs/SecurityTab.svelte';

	const resellerState = getContext('resellerState') as ReturnType<
		typeof import('../../../reseller/page.remote').getResellerState
	>;
	const tab = $derived(page.params.tab);
</script>

{#if resellerState.current?.authenticated}
	{#if tab === 'overview'}
		<OverviewTab data={resellerState.current} />
	{:else if tab === 'create'}
		<CreateConfigTab data={resellerState.current} {resellerState} />
	{:else if tab === 'configs'}
		<ConfigsTab data={resellerState.current} {resellerState} />
	{:else if tab === 'finance'}
		<FinanceTab data={resellerState.current} {resellerState} />
	{:else if tab === 'tickets'}
		<TicketsTab data={resellerState.current} {resellerState} />
	{:else if tab === 'message'}
		<MessageTab data={resellerState.current} {resellerState} />
	{:else if tab === 'security'}
		<SecurityTab {resellerState} />
	{:else}
		<OverviewTab data={resellerState.current} />
	{/if}
{:else}
	<LoadingState />
{/if}
