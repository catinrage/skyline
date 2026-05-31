<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';

	type Props = {
		open: boolean;
		title: string;
		eyebrow?: string;
		onClose: () => void;
		children: Snippet;
		footer?: Snippet;
		size?: 'sm' | 'md' | 'lg' | 'xl';
	};

	let { open, title, eyebrow, onClose, children, footer, size = 'md' }: Props = $props();

	function portal(node: HTMLElement) {
		if (!browser) return;
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	const maxWidth = $derived(
		{ sm: '420px', md: '560px', lg: '720px', xl: '1120px' }[size]
	);
</script>

{#if open}
	<div
		use:portal
		class="modal-overlay"
		role="presentation"
		onclick={onClose}
	>
		<div
			class="modal-card admin-card"
			style="max-width: {maxWidth};"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
			tabindex="-1"
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<div class="modal-head">
				<div>
					{#if eyebrow}<p class="modal-eyebrow">{eyebrow}</p>{/if}
					<h3 class="modal-title">{title}</h3>
				</div>
				<button
					type="button"
					class="modal-close"
					onclick={onClose}
					aria-label="بستن"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				{@render children()}
			</div>

			{#if footer}
				<div class="modal-footer">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 120;
		background: rgba(2, 4, 8, 0.65);
		backdrop-filter: blur(6px);
		display: grid;
		place-items: center;
		padding: 1rem;
		animation: modal-overlay-in 0.18s ease both;
	}

	.modal-card {
		width: 100%;
		max-height: calc(100dvh - 2rem);
		padding: 0;
		text-align: right;
		direction: rtl;
		overflow: hidden;
		border: 1px solid var(--va-border-strong);
		border-radius: 12px;
		background: var(--va-bg-panel);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		display: flex;
		flex-direction: column;
		cursor: default;
		animation: modal-rise 0.26s cubic-bezier(0.34, 1.2, 0.64, 1) both;
	}

	@keyframes modal-overlay-in {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}

	@keyframes modal-rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.97);
		}

		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		padding: 18px 20px 14px;
		border-bottom: 1px solid var(--va-border);
	}

	.modal-eyebrow {
		margin: 0 0 4px;
		color: var(--va-text-faint);
		font: 500 10px var(--va-font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.modal-title {
		margin: 0;
		color: var(--va-text);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.01em;
		font-family: var(--va-font-fa);
	}

	.modal-close {
		width: 28px;
		height: 28px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--va-border);
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		transition:
			color 0.2s ease,
			background-color 0.2s ease,
			border-color 0.2s ease;
	}

	.modal-close:hover {
		border-color: var(--va-border-strong);
		background: var(--va-bg-hover);
		color: var(--va-text);
	}

	.modal-body {
		min-height: 0;
		overflow-y: auto;
		padding: 14px 20px 18px;
		color: var(--va-text);
		font-size: 13px;
		line-height: 1.7;
	}

	.modal-footer {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		flex-wrap: wrap;
		padding: 12px 20px;
		border-top: 1px solid var(--va-border);
		background: var(--va-bg);
	}
</style>
