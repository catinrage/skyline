<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ConfigCreatePanel from '$lib/components/admin/shared/ConfigCreatePanel.svelte';
	import {
		createCustomConfigCommand,
		createTemplateCommand,
		deleteTemplateCommand
	} from '../../../../../routes/reseller/page.remote';

	type Template = {
		id: number;
		name: string;
		quotaGb: number;
		durationDays: number;
		priceToman: number;
	};
	type InboundOption = { id: number; remark: string | null; protocol: string | null; port: number | null };

	type Props = {
		data: {
			salesEnabled: boolean;
			stats: { gbBalance: number; totalGbSold: number };
			templates: Template[];
			availableInbounds: InboundOption[];
		};
		resellerState: any;
	};

	let { data, resellerState }: Props = $props();

	function basePath() {
		const m = page.url.pathname.match(/^\/([^/]+)\/reseller(?:\/|$)/);
		return m ? `/${m[1]}/reseller` : '/reseller';
	}

	function handleCreated() {
		void goto(`${basePath()}/configs`);
	}
</script>

<ConfigCreatePanel
	mode="seller"
	{data}
	stateTarget={resellerState}
	createCommand={createCustomConfigCommand}
	createTemplateCommand={createTemplateCommand}
	deleteTemplateCommand={deleteTemplateCommand}
	onCreated={handleCreated}
/>
