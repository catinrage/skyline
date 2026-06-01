<script lang="ts">
	/**
	 * Elegant animated SVG icons used in the admin shell sidebar
	 * and stat-card headers. Each icon is hand-tuned to feel "alive":
	 *  - subtle draw-on animation when entering view (`active`)
	 *  - micro motion on hover (rotate/scale via parent .admin-nav-item)
	 * Designed to be crisp at 22-32px and still look intentional at 64px.
	 */

	type IconName =
		| 'dashboard'
		| 'traffic'
		| 'message'
		| 'apps'
		| 'cloud'
		| 'shield'
		| 'store'
		| 'ticket'
		| 'database'
		| 'key'
		| 'toggle'
		| 'flag'
		| 'logout'
		| 'overview'
		| 'plus-network'
		| 'list'
		| 'finance'
		| 'search'
		| 'bell'
		| 'sun'
		| 'moon'
		| 'menu'
		| 'chevron-left'
		| 'sparkle'
		| 'check'
		| 'spark-up'
		| 'spark-down'
		| 'help-circle';

	type Props = {
		name: IconName;
		size?: number;
		active?: boolean;
		strokeWidth?: number;
		class?: string;
		title?: string;
	};

	let {
		name,
		size = 22,
		active = false,
		strokeWidth = 1.7,
		class: className = '',
		title
	}: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={`admin-anim-icon ${active ? 'is-active' : ''} ${className}`}
	role="img"
	aria-label={title ?? name}
>
	{#if title}<title>{title}</title>{/if}

	{#if name === 'dashboard'}
		<rect x="3" y="3" width="7" height="9" rx="1.5" class="ai-stroke" />
		<rect x="14" y="3" width="7" height="5" rx="1.5" class="ai-stroke" />
		<rect x="14" y="12" width="7" height="9" rx="1.5" class="ai-stroke" />
		<rect x="3" y="16" width="7" height="5" rx="1.5" class="ai-stroke" />
	{:else if name === 'traffic'}
		<path d="M12 3a9 9 0 1 0 9 9" class="ai-stroke ai-spin" />
		<path d="M12 3v9l6.36 6.36" class="ai-stroke" />
		<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" class="ai-pulse" />
	{:else if name === 'message'}
		<path d="M21 12a8 8 0 0 1-12.2 6.8L4 20l1.3-4A8 8 0 1 1 21 12z" class="ai-stroke" />
		<circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none" class="ai-dot-1" />
		<circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" class="ai-dot-2" />
		<circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" class="ai-dot-3" />
	{:else if name === 'apps'}
		<rect x="3" y="3" width="7" height="7" rx="1.5" class="ai-stroke" />
		<rect x="14" y="3" width="7" height="7" rx="1.5" class="ai-stroke" />
		<rect x="3" y="14" width="7" height="7" rx="1.5" class="ai-stroke" />
		<path d="M14 17.5h7M17.5 14v7" class="ai-stroke" />
	{:else if name === 'cloud'}
		<path d="M7 18a4 4 0 0 1-.7-7.95 5.5 5.5 0 0 1 10.94.62A4.5 4.5 0 0 1 16 18z" class="ai-stroke" />
		<path d="M9 14l3-3 3 3M12 11v6" class="ai-stroke ai-float" />
	{:else if name === 'shield'}
		<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" class="ai-stroke" />
		<path d="M9.5 12.5l2 2 3.5-4" class="ai-stroke ai-draw" stroke-dasharray="10" stroke-dashoffset="10" />
	{:else if name === 'store'}
		<path d="M4 7l1.5-3h13L20 7" class="ai-stroke" />
		<path d="M4 7v3a3 3 0 0 0 4 2.83A3 3 0 0 0 12 12a3 3 0 0 0 4 0.83A3 3 0 0 0 20 10V7" class="ai-stroke" />
		<path d="M5 12v8h14v-8" class="ai-stroke" />
		<path d="M10 20v-4h4v4" class="ai-stroke" />
	{:else if name === 'ticket'}
		<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" class="ai-stroke" />
		<path d="M9 7v10" class="ai-stroke" stroke-dasharray="2 2" />
	{:else if name === 'database'}
		<ellipse cx="12" cy="5" rx="8" ry="3" class="ai-stroke" />
		<path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" class="ai-stroke" />
		<path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" class="ai-stroke" />
	{:else if name === 'key'}
		<circle cx="8" cy="14" r="4" class="ai-stroke" />
		<path d="M11 12l8-8 2 2-2 2 2 2-2 2-2-2-3 3" class="ai-stroke" />
	{:else if name === 'toggle'}
		<rect x="2" y="7" width="20" height="10" rx="5" class="ai-stroke" />
		<circle cx="16" cy="12" r="3" fill="currentColor" stroke="none" class="ai-toggle-knob" />
	{:else if name === 'flag'}
		<path d="M5 3v18" class="ai-stroke" />
		<path d="M5 4l9 1.5c1.5.25 2.5 1.6 2.5 3.1S15.5 11.7 14 11.95L5 13.5" class="ai-stroke" />
	{:else if name === 'logout'}
		<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" class="ai-stroke" />
		<path d="M10 16l4-4-4-4" class="ai-stroke" />
		<path d="M14 12H4" class="ai-stroke" />
	{:else if name === 'overview'}
		<circle cx="12" cy="12" r="9" class="ai-stroke" />
		<path d="M3.6 8.5h16.8M3.6 15.5h16.8" class="ai-stroke" stroke-dasharray="2 2" />
		<path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" class="ai-stroke" />
	{:else if name === 'plus-network'}
		<circle cx="6" cy="6" r="2.5" class="ai-stroke" />
		<circle cx="18" cy="18" r="2.5" class="ai-stroke" />
		<circle cx="18" cy="6" r="2.5" class="ai-stroke" />
		<path d="M6 8.5v7M8.5 18H15M15.5 8.5L8.5 15.5" class="ai-stroke" stroke-dasharray="2 2" />
		<path d="M11 6h3M12.5 4.5v3" class="ai-stroke" />
	{:else if name === 'list'}
		<rect x="3" y="4" width="18" height="4" rx="1" class="ai-stroke" />
		<rect x="3" y="10" width="18" height="4" rx="1" class="ai-stroke" />
		<rect x="3" y="16" width="18" height="4" rx="1" class="ai-stroke" />
	{:else if name === 'finance'}
		<path d="M3 17l5-5 4 4 8-9" class="ai-stroke ai-draw" stroke-dasharray="40" stroke-dashoffset="40" />
		<path d="M20 7h-4M20 7v4" class="ai-stroke" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6" class="ai-stroke" />
		<path d="M20 20l-4.3-4.3" class="ai-stroke" />
	{:else if name === 'bell'}
		<path d="M6 16V10a6 6 0 1 1 12 0v6" class="ai-stroke" />
		<path d="M4 16h16M10 20a2 2 0 0 0 4 0" class="ai-stroke" />
		<circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none" class="ai-pulse" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" class="ai-stroke" fill="currentColor" stroke="none" />
		<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" class="ai-stroke ai-spin-slow" />
	{:else if name === 'moon'}
		<path d="M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z" class="ai-stroke" fill="currentColor" />
	{:else if name === 'menu'}
		<path d="M4 7h16M4 12h16M4 17h16" class="ai-stroke" />
	{:else if name === 'chevron-left'}
		<path d="M15 6l-6 6 6 6" class="ai-stroke" />
	{:else if name === 'sparkle'}
		<path d="M12 3v4M12 17v4M3 12h4M17 12h4" class="ai-stroke ai-spin-slow" />
		<path d="M12 8l2 2 2 2-2 2-2 2-2-2-2-2 2-2z" class="ai-stroke" fill="currentColor" />
	{:else if name === 'check'}
		<circle cx="12" cy="12" r="9" class="ai-stroke" />
		<path d="M8 12l3 3 5-6" class="ai-stroke ai-draw" stroke-dasharray="14" stroke-dashoffset="14" />
	{:else if name === 'spark-up'}
		<path d="M3 17l6-6 4 4 8-9" class="ai-stroke" />
		<path d="M14 6h7v7" class="ai-stroke" />
	{:else if name === 'spark-down'}
		<path d="M3 7l6 6 4-4 8 9" class="ai-stroke" />
		<path d="M14 18h7v-7" class="ai-stroke" />
	{:else if name === 'help-circle'}
		<circle cx="12" cy="12" r="9" class="ai-stroke" />
		<path d="M9.5 9.5a3 3 0 0 1 5.5 1c0 2-2.5 2.5-2.5 4" class="ai-stroke ai-draw" stroke-dasharray="16" stroke-dashoffset="16" />
		<circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" class="ai-pulse" />
	{/if}
</svg>

<style>
	.admin-anim-icon { display: inline-block; vertical-align: middle; }
	.admin-anim-icon .ai-stroke { stroke: currentColor; fill: none; }
	.admin-anim-icon.is-active .ai-draw,
	.admin-anim-icon:hover .ai-draw {
		animation: admin-draw-stroke 0.6s ease forwards;
	}
	.admin-anim-icon .ai-pulse {
		transform-origin: center;
		animation: ai-pulse-dot 2s ease-in-out infinite;
	}
	@keyframes ai-pulse-dot {
		0%, 100% { opacity: 0.65; transform: scale(0.9); }
		50% { opacity: 1; transform: scale(1.15); }
	}
	.admin-anim-icon .ai-dot-1 { animation: ai-bounce 1.2s ease-in-out infinite; animation-delay: 0s; opacity: 0.55; }
	.admin-anim-icon .ai-dot-2 { animation: ai-bounce 1.2s ease-in-out infinite; animation-delay: 0.15s; opacity: 0.55; }
	.admin-anim-icon .ai-dot-3 { animation: ai-bounce 1.2s ease-in-out infinite; animation-delay: 0.3s; opacity: 0.55; }
	.admin-anim-icon.is-active .ai-dot-1,
	.admin-anim-icon.is-active .ai-dot-2,
	.admin-anim-icon.is-active .ai-dot-3 { opacity: 1; }
	@keyframes ai-bounce {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-1.2px); }
	}
	.admin-anim-icon .ai-float { animation: admin-float 2.4s ease-in-out infinite; transform-origin: center; }
	.admin-anim-icon .ai-spin { animation: admin-spin 6s linear infinite; transform-origin: center; opacity: 0.9; }
	.admin-anim-icon .ai-spin-slow { animation: admin-spin 12s linear infinite; transform-origin: center; }
	.admin-anim-icon .ai-toggle-knob {
		transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.admin-anim-icon.is-active .ai-toggle-knob {
		transform: translateX(-8px);
	}
	@media (prefers-reduced-motion: reduce) {
		.admin-anim-icon .ai-pulse,
		.admin-anim-icon .ai-dot-1,
		.admin-anim-icon .ai-dot-2,
		.admin-anim-icon .ai-dot-3,
		.admin-anim-icon .ai-float,
		.admin-anim-icon .ai-spin,
		.admin-anim-icon .ai-spin-slow { animation: none; }
	}
</style>
