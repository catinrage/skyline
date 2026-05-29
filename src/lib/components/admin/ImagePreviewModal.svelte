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
		display: grid;
		place-items: center;
		width: min(1080px, 100%);
		height: min(88vh, 900px);
	}
	img {
		max-width: 100%;
		max-height: 100%;
		border-radius: 8px;
		object-fit: contain;
		background: var(--va-bg-panel);
	}
	.preview-close {
		position: absolute;
		top: 0;
		inset-inline-end: 0;
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
