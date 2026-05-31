<script lang="ts">
	import LoginPage from '../../login/+page@.svelte';
	let { data } = $props();
</script>

<LoginPage {data} />
