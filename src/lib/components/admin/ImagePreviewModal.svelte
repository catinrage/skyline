<script lang="ts">
	import { browser } from '$app/environment';

	type Props = {
		open: boolean;
		src: string | null;
		alt?: string;
		onClose: () => void;
	};

	let { open, src, alt = 'تصویر', onClose }: Props = $props();

	function portal(node: HTMLElement) {
		if (!browser) return;
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

{#if open && src}
	<div use:portal class="preview-overlay" role="presentation" onclick={onClose} onkeydown={handleKeydown}>
		<div class="preview-frame" role="dialog" aria-modal="true" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
			<button type="button" class="preview-close" onclick={onClose} aria-label="بستن">&times;</button>
			<img {src} {alt} />
		</div>
	</div>
{/if}

<style>
	.preview-overlay {
		position: fixed;
		inset: 0;
		z-index: 140;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(2, 4, 8, 0.82);
		backdrop-filter: blur(7px);
	}
	.preview-frame {
		position: relative;
		width: min(1080px, 100%);
		max-height: calc(100vh - 40px);
		overflow-y: auto;
		overflow-x: hidden;
		border-radius: 10px;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 8px;
		background: var(--va-bg-panel);
	}
	.preview-close {
		position: sticky;
		top: 0;
		float: inline-end;
		z-index: 1;
		width: 38px;
		height: 38px;
		border: 1px solid var(--va-border-strong);
		border-radius: 8px;
		background: var(--va-bg-panel);
		color: var(--va-text);
		font-size: 25px;
		cursor: pointer;
	}
</style>
