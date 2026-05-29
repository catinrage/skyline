<script lang="ts">
	import ManageLayout from '../../manage/+layout.svelte';
	let { children } = $props();
</script>

<ManageLayout>
	{@render children()}
</ManageLayout>
