<script lang="ts">
	import ConfigsTab from '$lib/components/admin/reseller/tabs/ConfigsTab.svelte';
	import {
		adminAddQuotaCommand,
		adminRechargeConfigCommand,
		adminRevokeConfigCommand,
		adminToggleConfigCommand
	} from '../../../../../routes/manage/page.remote';

	type Props = {
		data: any;
		manageState: any;
	};

	let { data, manageState }: Props = $props();

	const configsData = $derived({
		reseller: { username: 'manager' },
		requests: data.managerConfigs,
		charges: [],
		salesEnabled: true
	});
</script>

<ConfigsTab
	data={configsData}
	stateTarget={manageState}
	ownerKey="manager"
	commands={{
		toggle: adminToggleConfigCommand,
		recharge: adminRechargeConfigCommand,
		addQuota: adminAddQuotaCommand,
		revoke: adminRevokeConfigCommand
	}}
/>
