<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import LoadingState from '$lib/components/admin/LoadingState.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import BackupsTab from '$lib/components/admin/manage/tabs/BackupsTab.svelte';
	import ClientAppsTab from '$lib/components/admin/manage/tabs/ClientAppsTab.svelte';
	import CreditRequestsTab from '$lib/components/admin/manage/tabs/CreditRequestsTab.svelte';
	import FeaturesTab from '$lib/components/admin/manage/tabs/FeaturesTab.svelte';
	import MessageTab from '$lib/components/admin/manage/tabs/MessageTab.svelte';
	import PasskeyTab from '$lib/components/admin/manage/tabs/PasskeyTab.svelte';
	import PlansTab from '$lib/components/admin/manage/tabs/PlansTab.svelte';
	import ReportsTab from '$lib/components/admin/manage/tabs/ReportsTab.svelte';
	import ResellersTab from '$lib/components/admin/manage/tabs/ResellersTab.svelte';
	import GroupsTab from '$lib/components/admin/manage/tabs/GroupsTab.svelte';
	import SecurityTab from '$lib/components/admin/manage/tabs/SecurityTab.svelte';
	import SettingsTab from '$lib/components/admin/manage/tabs/SettingsTab.svelte';
	import TrafficTab from '$lib/components/admin/manage/tabs/TrafficTab.svelte';
	import VlessRewriteTab from '$lib/components/admin/manage/tabs/VlessRewriteTab.svelte';
	import AdminCreateConfigTab from '$lib/components/admin/manage/tabs/AdminCreateConfigTab.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../../../manage/page.remote').getManageState
	>;
	const tab = $derived(String(page.params.tab));
</script>

{#if manageState.current?.authenticated}
	{#if tab === 'traffic'}
		<TrafficTab data={manageState.current} />
	{:else if tab === 'create'}
		<AdminCreateConfigTab data={manageState.current} {manageState} />
	{:else if tab === 'message'}
		<MessageTab data={manageState.current} />
	{:else if tab === 'client-apps'}
		<ClientAppsTab data={manageState.current} />
	{:else if tab === 'vless-rewrite'}
		<VlessRewriteTab data={manageState.current} />
	{:else if tab === 'security'}
		<SecurityTab data={manageState.current} />
	{:else if tab === 'resellers'}
		<ResellersTab data={manageState.current} />
	{:else if tab === 'groups'}
		<GroupsTab data={manageState.current} />
	{:else if tab === 'plans'}
		<PlansTab data={manageState.current} />
	{:else if tab === 'credit-requests'}
		<CreditRequestsTab data={manageState.current} />
	{:else if tab === 'templates'}
		<div class="templates-placeholder">
			<EmptyState
				title="قالب‌های پیام"
				description="این بخش به زودی اضافه می‌شود."
				icon="inbox"
			/>
		</div>
	{:else if tab === 'backups'}
		<BackupsTab data={manageState.current} {manageState} />
	{:else if tab === 'passkey'}
		<PasskeyTab data={manageState.current} />
	{:else if tab === 'features'}
		<FeaturesTab data={manageState.current} />
	{:else if tab === 'settings'}
		<SettingsTab data={manageState.current} />
	{:else if tab === 'reports'}
		<ReportsTab data={manageState.current} />
	{:else}
		<TrafficTab data={manageState.current} />
	{/if}
{:else}
	<LoadingState />
{/if}
