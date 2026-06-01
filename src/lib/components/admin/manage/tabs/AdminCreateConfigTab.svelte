<script lang="ts">
	import ConfigCreatePanel from '$lib/components/admin/shared/ConfigCreatePanel.svelte';
	import {
		createAdminConfigCommand,
		createManagerTemplateCommand,
		deleteManagerTemplateCommand
	} from '../../../../../routes/manage/page.remote';

	type InboundOption = {
		id: number;
		remark: string | null;
		protocol?: string | null;
		port?: number | null;
		enable?: boolean;
	};
	type Template = {
		id: number;
		name: string;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
	};
	type Props = {
		data: { inboundOptions: InboundOption[]; managerConfigTemplates: Template[] };
		manageState: any;
	};

	let { data, manageState }: Props = $props();

	const availableInbounds = $derived(data.inboundOptions.filter((inbound) => inbound.enable !== false));
	const createData = $derived({
		salesEnabled: true,
		stats: { gbBalance: Number.MAX_SAFE_INTEGER, totalGbSold: 0 },
		templates: data.managerConfigTemplates,
		availableInbounds
	});
</script>

<ConfigCreatePanel
	mode="manager"
	data={createData}
	stateTarget={manageState}
	createCommand={createAdminConfigCommand}
	createTemplateCommand={createManagerTemplateCommand}
	deleteTemplateCommand={deleteManagerTemplateCommand}
/>
