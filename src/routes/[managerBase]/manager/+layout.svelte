<script lang="ts">
	import ManageLayout from '../../manage/+layout.svelte';
	let { children } = $props();
</script>

<!--
	Hidden-base manager mirrors the public /manage tree. We render the same
	AdminShell+auth gate by re-using the manage layout via a regular Svelte
	component import (not via route nesting, which would double-wrap).
-->
<ManageLayout>
	{@render children()}
</ManageLayout>
