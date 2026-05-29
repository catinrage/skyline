<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	type Intent = 'danger' | 'warning' | 'info';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		intent?: Intent;
		loading?: boolean;
		confirmDisabled?: boolean;
		children?: Snippet;
		onConfirm: () => void;
		onClose: () => void;
	};

	let {
		open,
		title,
		description,
		confirmLabel = 'تأیید',
		cancelLabel = 'انصراف',
		intent = 'danger',
		loading = false,
		confirmDisabled = false,
		children,
		onConfirm,
		onClose
	}: Props = $props();

	function portal(node: HTMLElement) {
		if (!browser) return;
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	let cancelBtnEl = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (open) {
			// Defer focus so DOM is ready
			requestAnimationFrame(() => cancelBtnEl?.focus());
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !loading) {
			e.stopPropagation();
			onClose();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div use:portal class="cd-overlay" onclick={() => !loading && onClose()} onkeydown={handleKeydown}>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="cd-dialog cd-{intent}"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="cd-title"
			aria-describedby={description ? 'cd-desc' : undefined}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="cd-icon">
				{#if intent === 'danger'}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
						<path d="M10 11v6M14 11v6" />
					</svg>
				{:else if intent === 'warning'}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2.5" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5" />
					</svg>
				{/if}
			</div>

			<p class="cd-title" id="cd-title">{title}</p>
			{#if description}
				<p class="cd-desc" id="cd-desc">{description}</p>
			{/if}
			{#if children}
				<div class="cd-content">{@render children()}</div>
			{/if}

			<div class="cd-actions">
				<button
					type="button"
					class="cd-btn cd-cancel"
					bind:this={cancelBtnEl}
					onclick={onClose}
					disabled={loading || confirmDisabled}
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					class="cd-btn cd-confirm"
					onclick={onConfirm}
					disabled={loading}
				>
					{#if loading}
						<span class="cd-spinner" aria-hidden="true"></span>
					{/if}
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Overlay ───────────────────────────────────────────── */
	.cd-overlay {
		position: fixed;
		inset: 0;
		z-index: 130;
		background: rgba(2, 4, 8, 0.6);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: grid;
		place-items: center;
		padding: 1rem;
		animation: cd-overlay-in 0.18s ease both;
	}

	/* ── Dialog card ───────────────────────────────────────── */
	.cd-dialog {
		width: 100%;
		max-width: 340px;
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border-strong);
		border-radius: 16px;
		padding: 28px 24px 22px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		cursor: default;
		animation: cd-rise 0.26s cubic-bezier(0.34, 1.2, 0.64, 1) both;
	}

	.cd-content {
		width: 100%;
		margin-top: 14px;
	}

	/* ── Intent icon ───────────────────────────────────────── */
	.cd-icon {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		margin-bottom: 16px;
		flex-shrink: 0;
	}

	.cd-icon svg {
		width: 24px;
		height: 24px;
	}

	.cd-danger .cd-icon {
		background: color-mix(in srgb, var(--va-danger) 14%, transparent);
		color: var(--va-danger);
	}

	.cd-warning .cd-icon {
		background: color-mix(in srgb, var(--va-warning) 14%, transparent);
		color: var(--va-warning);
	}

	.cd-info .cd-icon {
		background: color-mix(in srgb, var(--va-info) 14%, transparent);
		color: var(--va-info);
	}

	/* ── Text ──────────────────────────────────────────────── */
	.cd-title {
		margin: 0 0 8px;
		font: 600 15px var(--va-font-mono);
		color: var(--va-text);
		text-align: center;
		line-height: 1.4;
	}

	.cd-desc {
		margin: 0 0 20px;
		font-size: 13px;
		color: var(--va-text-faint);
		text-align: center;
		line-height: 1.65;
	}

	/* when there's no description, title still needs bottom space */
	.cd-title:last-of-type {
		margin-bottom: 20px;
	}

	/* ── Actions ───────────────────────────────────────────── */
	.cd-actions {
		display: flex;
		gap: 8px;
		width: 100%;
	}

	.cd-btn {
		flex: 1;
		padding: 9px 14px;
		border-radius: 8px;
		font: 500 13px var(--va-font-mono);
		cursor: pointer;
		transition:
			background 0.15s ease,
			opacity 0.15s ease;
		border: 1px solid transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}

	.cd-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Cancel button — ghost style */
	.cd-cancel {
		background: transparent;
		border-color: var(--va-border-strong);
		color: var(--va-text-faint);
	}

	.cd-cancel:not(:disabled):hover {
		background: var(--va-bg-hover);
		color: var(--va-text);
	}

	/* Confirm button — intent-colored */
	.cd-danger .cd-confirm {
		background: color-mix(in srgb, var(--va-danger) 16%, transparent);
		border-color: color-mix(in srgb, var(--va-danger) 35%, transparent);
		color: var(--va-danger);
	}

	.cd-danger .cd-confirm:not(:disabled):hover {
		background: color-mix(in srgb, var(--va-danger) 26%, transparent);
	}

	.cd-warning .cd-confirm {
		background: color-mix(in srgb, var(--va-warning) 16%, transparent);
		border-color: color-mix(in srgb, var(--va-warning) 35%, transparent);
		color: var(--va-warning);
	}

	.cd-warning .cd-confirm:not(:disabled):hover {
		background: color-mix(in srgb, var(--va-warning) 26%, transparent);
	}

	.cd-info .cd-confirm {
		background: color-mix(in srgb, var(--va-info) 16%, transparent);
		border-color: color-mix(in srgb, var(--va-info) 35%, transparent);
		color: var(--va-info);
	}

	.cd-info .cd-confirm:not(:disabled):hover {
		background: color-mix(in srgb, var(--va-info) 26%, transparent);
	}

	/* ── Loading spinner ───────────────────────────────────── */
	.cd-spinner {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-top-color: transparent;
		animation: cd-spin 0.65s linear infinite;
	}

	/* ── Animations ────────────────────────────────────────── */
	@keyframes cd-overlay-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes cd-rise {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes cd-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
