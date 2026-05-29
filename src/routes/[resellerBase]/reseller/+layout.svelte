<script lang="ts">
	import ResellerLayout from '../../reseller/+layout.svelte';
	let { children } = $props();
</script>

<ResellerLayout>
	{@render children()}
</ResellerLayout>
