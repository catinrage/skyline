<script lang="ts">
	import { getContext, type Snippet } from 'svelte';

	let { content }: { content: Snippet } = $props();

	const inspectorState = getContext<{ content: Snippet | undefined }>('setPageInspector');

	$effect(() => {
		if (!inspectorState) return;
		inspectorState.content = content;
		return () => {
			inspectorState.content = undefined;
		};
	});
</script>
