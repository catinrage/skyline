<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- AdminShell receives dynamic, already-normalized internal routes from nav config. */
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { applyStoredTheme, readStoredTheme, type ThemeMode } from '$lib/theme';
	import { appVersionLabel } from '$lib/version';
	import AnimatedIcon from './AnimatedIcon.svelte';
	import Brand from './Brand.svelte';
	import { tick, type Snippet } from 'svelte';

	type IconName = 'dashboard' | 'traffic' | 'message' | 'apps' | 'cloud' | 'shield' | 'store' |
		'ticket' | 'database' | 'key' | 'toggle' | 'flag' | 'logout' | 'overview' | 'plus-network' |
		'list' | 'finance' | 'search' | 'bell' | 'sun' | 'moon' | 'menu' | 'chevron-left' | 'sparkle' |
		'check' | 'spark-up' | 'spark-down' | 'help-circle';

	export type NavItem = {
		id: string;
		label: string;
		href: string;
		icon: IconName;
		badge?: string | number;
		group?: string;
	};


	export type CommandSearchItem = {
		id: string;
		label: string;
		subtitle?: string;
		href?: string;
		icon?: IconName;
		searchText?: string;
		action?: () => void;
	};

	type Props = {
		panelTitle: string;
		panelSubtitle?: string;
		userName?: string;
		userMeta?: string;
		navItems: NavItem[];
		activeId: string;
		commandSearchItems?: CommandSearchItem[];
		breadcrumbs?: Array<{ label: string; href?: string }>;
		searchPlaceholder?: string;
		onSearch?: (value: string) => void;
		onLogout?: () => void;
		actions?: Snippet;
		pageActions?: Snippet;
		children: Snippet;
		pageHeader?: Snippet;
		inspector?: Snippet;
	};

	let {
		panelTitle,
		panelSubtitle,
		userName,
		userMeta,
		navItems,
		activeId,
		commandSearchItems = [],
		breadcrumbs = [],
		searchPlaceholder = 'جستجو در پنل...',
		onSearch,
		onLogout,
		actions,
		pageActions,
		pageHeader,
		children,
		inspector
	}: Props = $props();

	let collapsedGroups = $state<Set<string>>(new Set());

	let theme = $state<ThemeMode>('dark');
	let sidebarOpen = $state(false);
	let commandOpen = $state(false);
	let profileMenuOpen = $state(false);
	let searchValue = $state('');
	let selectedCommandIndex = $state(0);
	let commandInput = $state<HTMLInputElement | null>(null);

	const grouped = $derived.by(() => {
		const groups: Array<[string, NavItem[]]> = [];
		for (const item of navItems) {
			const key = item.group ?? '';
			const existing = groups.find(([group]) => group === key);
			if (existing) {
				existing[1].push(item);
			} else {
				groups.push([key, [item]]);
			}
		}
		return groups;
	});

	const COMMAND_SEARCH_LIMIT = 10;

	const commandSections = $derived.by(() => {
		const q = searchValue.trim().toLowerCase();

		const matches = (item: CommandSearchItem) =>
			[item.label, item.subtitle ?? '', item.id, item.searchText ?? '']
				.join(' ')
				.toLowerCase()
				.includes(q);

		const navCommands: CommandSearchItem[] = navItems.map((item) => ({
			id: `nav:${item.id}`,
			label: item.label,
			subtitle: item.group ?? 'رفتن به بخش',
			href: item.href,
			icon: item.icon
		}));
		const logoutCommand: CommandSearchItem[] = onLogout
			? [{ id: 'action:logout', label: 'خروج از حساب', subtitle: 'پایان نشست فعلی', icon: 'logout' as const, action: onLogout }]
			: [];

		const filteredNav = navCommands.filter(matches);
		const filteredLogout = logoutCommand.filter(matches);
		const allSearchMatches = commandSearchItems.filter(matches);
		// When user is actively searching show up to 20, otherwise cap at COMMAND_SEARCH_LIMIT
		const limit = q ? 20 : COMMAND_SEARCH_LIMIT;
		const filteredSearch = allSearchMatches.slice(0, limit);
		const overflowCount = Math.max(0, allSearchMatches.length - limit);

		return { nav: filteredNav, search: filteredSearch, logout: filteredLogout, overflowCount };
	});

	// Flat list for keyboard navigation
	const commandItems = $derived([
		...commandSections.nav,
		...commandSections.search,
		...commandSections.logout
	]);

	const commandShortcut = $derived(browser && navigator.platform.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K');

	function applyTheme(next: ThemeMode) {
		theme = next;
		if (!browser) return;
		applyStoredTheme(next);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	function updateSearchValue(value: string) {
		searchValue = value;
		onSearch?.(value);
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		updateSearchValue(value);
		selectedCommandIndex = 0;
	}

	function handleNavClick(event: MouseEvent, href: string) {
		// Soft-close mobile sidebar then let SvelteKit handle the navigation.
		sidebarOpen = false;
		if (event.metaKey || event.ctrlKey || event.button !== 0) return;
		event.preventDefault();
		void goto(href);
	}

	function openCommandPalette() {
		commandOpen = true;
		selectedCommandIndex = 0;
		void tick().then(() => commandInput?.focus());
	}

	function closeCommandPalette() {
		commandOpen = false;
	}

	function clearSearch() {
		updateSearchValue('');
		selectedCommandIndex = 0;
		void tick().then(() => commandInput?.focus());
	}

	function goToCommand(item: CommandSearchItem) {
		commandOpen = false;
		sidebarOpen = false;
		if (item.searchText !== undefined) {
			updateSearchValue(item.searchText);
		}
		item.action?.();
		if (item.href) {
			void goto(item.href);
		}
	}

	function handleCommandKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeCommandPalette();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedCommandIndex = Math.min(commandItems.length - 1, selectedCommandIndex + 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedCommandIndex = Math.max(0, selectedCommandIndex - 1);
			return;
		}

		if (event.key === 'Enter' && commandItems[selectedCommandIndex]) {
			event.preventDefault();
			goToCommand(commandItems[selectedCommandIndex]);
		}
	}

	function toggleGroup(group: string) {
		const next = new Set(collapsedGroups);
		if (next.has(group)) next.delete(group);
		else next.add(group);
		collapsedGroups = next;
		if (browser) localStorage.setItem('admin-nav-groups', JSON.stringify([...next]));
	}

	$effect(() => {
		if (!browser) return;
		applyTheme(readStoredTheme());
		const stored = localStorage.getItem('admin-nav-groups');
		if (stored) {
			try { collapsedGroups = new Set(JSON.parse(stored) as string[]); } catch { /* ignore */ }
		}
	});

	$effect(() => {
		if (!browser) return;

		function handleGlobalKeydown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable;

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				openCommandPalette();
				return;
			}

			if (event.key === '/' && !isTyping) {
				event.preventDefault();
				openCommandPalette();
			}
		}

		window.addEventListener('keydown', handleGlobalKeydown);
		return () => window.removeEventListener('keydown', handleGlobalKeydown);
	});

	$effect(() => {
		// Close sidebar on route change (mobile)
		void page.url.pathname;
		sidebarOpen = false;
		commandOpen = false;
	});
</script>

<div class="admin-shell" dir="rtl">
	<div class="admin-container">
		<!-- ===================== SIDEBAR (right side) ===================== -->
		<aside
			class="admin-sidebar admin-scroll"
			class:is-open={sidebarOpen}
			aria-label="ناوبری اصلی"
		>
			<div class="sidebar-inner">
				<div class="sidebar-brand">
					<Brand size={42} title="Skyline" />
					<span class="sidebar-version">{appVersionLabel}</span>
					<button
						type="button"
						class="sidebar-collapse"
						aria-label="بستن نوار کناری"
						onclick={() => (sidebarOpen = false)}
					>
						<AnimatedIcon name="chevron-left" size={18} />
					</button>
				</div>

				<nav class="sidebar-nav">
					{#each grouped as [group, items] (group)}
						{#if group}
							<button
								type="button"
								class="sidebar-group-btn"
								onclick={() => toggleGroup(group)}
								aria-expanded={!collapsedGroups.has(group)}
							>
								<span class="sidebar-group-label">{group}</span>
								<span class="sidebar-group-chevron" class:is-collapsed={collapsedGroups.has(group)}>
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
										<polyline points="2,3 5,7 8,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</span>
							</button>
						{/if}
						{#if !group || !collapsedGroups.has(group)}
							<ul class="sidebar-list">
								{#each items as item (item.id)}
									{@const isActive = item.id === activeId}
									<li>
										<a
											href={item.href}
											class="admin-nav-item"
											class:is-active={isActive}
											aria-current={isActive ? 'page' : undefined}
											onclick={(event) => handleNavClick(event, item.href)}
										>
											<span class="admin-nav-icon">
												<AnimatedIcon name={item.icon} size={22} active={isActive} />
											</span>
											<span class="admin-nav-label">{item.label}</span>
											{#if item.badge}
												<span class="admin-nav-badge">{item.badge}</span>
											{/if}
									</a>
								</li>
							{/each}
						</ul>
						{/if}
					{/each}
				</nav>

			</div>
		</aside>

		{#if sidebarOpen}
			<button
				type="button"
				aria-label="بستن منو"
				class="sidebar-backdrop"
				onclick={() => (sidebarOpen = false)}
			></button>
		{/if}

		<!-- ===================== CONTENT ===================== -->
		<div class="admin-main admin-scroll">
			<header class="admin-header">
				<div class="admin-header-inner">
					<div class="header-left">
						<button
							type="button"
							class="header-menu"
							aria-label="باز کردن منو"
							onclick={() => (sidebarOpen = true)}
						>
							<AnimatedIcon name="menu" size={20} />
						</button>

						<button
							type="button"
							class="header-search command-search-trigger"
							onclick={openCommandPalette}
							aria-label="باز کردن جستجو و فرمان‌ها"
						>
							<span class="header-search-icon" aria-hidden="true">
								<AnimatedIcon name="search" size={16} />
							</span>
							<span class="header-search-input command-search-copy">
								{searchValue || searchPlaceholder}
							</span>
							<kbd>{commandShortcut}</kbd>
						</button>
					</div>

					<div class="header-right">
						{#if actions}
							{@render actions()}
						{/if}

						<button
							type="button"
							class="header-icon-btn mobile-command-button"
							aria-label="باز کردن جستجو"
							onclick={openCommandPalette}
						>
							<AnimatedIcon name="search" size={20} />
						</button>

						<button
							type="button"
							class="header-icon-btn"
							onclick={toggleTheme}
							aria-label={theme === 'dark' ? 'تم روشن' : 'تم تیره'}
						>
							{#if theme === 'dark'}
								<AnimatedIcon name="sun" size={20} />
							{:else}
								<AnimatedIcon name="moon" size={20} />
							{/if}
						</button>

						{#if userName}
							<div class="header-user">
								<button
									type="button"
									class="sidebar-avatar header-avatar header-avatar-btn"
									aria-label="منوی کاربر"
									aria-expanded={profileMenuOpen}
									onclick={() => (profileMenuOpen = !profileMenuOpen)}
								>
									{userName.slice(0, 1).toUpperCase()}
								</button>
								{#if profileMenuOpen}
									<div class="profile-menu" role="menu">
										<div class="profile-menu-user">
											<div class="sidebar-avatar profile-menu-avatar" aria-hidden="true">
												{userName.slice(0, 1).toUpperCase()}
											</div>
											<div class="profile-menu-meta">
												<span class="profile-menu-name">{userName}</span>
												{#if userMeta}<span class="profile-menu-sub">{userMeta}</span>{/if}
											</div>
										</div>
										{#if onLogout}
											<div class="profile-menu-divider"></div>
											<button
												type="button"
												class="profile-menu-logout"
												onclick={() => { profileMenuOpen = false; onLogout?.(); }}
											>
												<AnimatedIcon name="logout" size={15} />
												<span>خروج از حساب</span>
											</button>
										{/if}
									</div>
									<button
										type="button"
										class="profile-menu-backdrop"
										aria-label="بستن منوی کاربر"
										onclick={() => (profileMenuOpen = false)}
									></button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</header>

			<div class="admin-body">
				<section class="admin-content admin-fade-in">
				{#if pageHeader || breadcrumbs.length || pageActions || panelTitle}
					<div class="page-header">
						<div class="page-header-text">
							{#if breadcrumbs.length}
								<div class="admin-breadcrumb">
									{#each breadcrumbs as crumb, i (i)}
										{#if i > 0}
											<span aria-hidden="true" class="breadcrumb-sep">/</span>
										{/if}
										{#if crumb.href && i < breadcrumbs.length - 1}
											<a href={crumb.href} class="breadcrumb-link">{crumb.label}</a>
										{:else}
											<span class="admin-breadcrumb-current">{crumb.label}</span>
										{/if}
									{/each}
								</div>
							{/if}

							{#if pageHeader}
								{@render pageHeader()}
							{:else}
								<h1 class="page-title">{panelTitle}</h1>
								{#if panelSubtitle}
									<p class="page-subtitle">{panelSubtitle}</p>
								{/if}
							{/if}
						</div>

						{#if pageActions}
							<div class="page-header-actions">
								{@render pageActions()}
							</div>
						{/if}
					</div>
				{/if}

					{@render children()}
				</section>
				{#if inspector}
					<div class="admin-page-inspector">
						{@render inspector()}
					</div>
				{/if}
			</div>
		</div>

	</div>

	{#if commandOpen}
		<div class="command-backdrop" role="presentation" onclick={closeCommandPalette}>
			<div
				class="command-palette"
				role="dialog"
				aria-modal="true"
				aria-label="جستجو و فرمان‌ها"
				tabindex="-1"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => event.stopPropagation()}
			>
				<div class="command-search-row">
					<AnimatedIcon name="search" size={18} />
					<input
						bind:this={commandInput}
						type="search"
						value={searchValue}
						oninput={handleSearchInput}
						onkeydown={handleCommandKeydown}
						placeholder={searchPlaceholder}
						aria-label="جستجو در پنل و فرمان‌ها"
					/>
					{#if searchValue}
						<button type="button" class="command-clear" onclick={clearSearch}>پاک کردن</button>
					{/if}
					<kbd>Esc</kbd>
				</div>

				<div class="command-hint">
					<span>جستجو همزمان فیلتر تب فعلی را اعمال می‌کند.</span>
					<span>برای حرکت بین فرمان‌ها از ↑ ↓ و Enter استفاده کنید.</span>
				</div>

				{#if commandItems.length === 0}
					<div class="command-empty">فرمانی با این عبارت پیدا نشد.</div>
				{:else}
					{@const navOffset = 0}
					{@const searchOffset = commandSections.nav.length}
					{@const logoutOffset = searchOffset + commandSections.search.length}

					{#if commandSections.nav.length > 0}
						<div class="command-section-label">بخش‌های پنل</div>
						<div class="command-list" role="listbox" aria-label="بخش‌های پنل">
							{#each commandSections.nav as item, i (item.id)}
								{@const index = navOffset + i}
								<button
									type="button"
									class="command-item"
									class:is-selected={index === selectedCommandIndex}
									role="option"
									aria-selected={index === selectedCommandIndex}
									onmouseenter={() => (selectedCommandIndex = index)}
									onclick={() => goToCommand(item)}
								>
									<span class="command-item-icon">
										<AnimatedIcon name={item.icon ?? 'search'} size={18} active={index === selectedCommandIndex} />
									</span>
									<span class="command-item-text">
										<strong>{item.label}</strong>
										<small>{item.subtitle ?? 'رفتن به بخش'}</small>
									</span>
									<span class="command-item-shortcut">Enter</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if commandSections.search.length > 0}
						<div class="command-section-label">نتایج</div>
						<div class="command-list" role="listbox" aria-label="نتایج جستجو">
							{#each commandSections.search as item, i (item.id)}
								{@const index = searchOffset + i}
								<button
									type="button"
									class="command-item"
									class:is-selected={index === selectedCommandIndex}
									role="option"
									aria-selected={index === selectedCommandIndex}
									onmouseenter={() => (selectedCommandIndex = index)}
									onclick={() => goToCommand(item)}
								>
									<span class="command-item-icon">
										<AnimatedIcon name={item.icon ?? 'search'} size={18} active={index === selectedCommandIndex} />
									</span>
									<span class="command-item-text">
										<strong>{item.label}</strong>
										{#if item.subtitle}<small>{item.subtitle}</small>{/if}
									</span>
									<span class="command-item-shortcut">Enter</span>
								</button>
							{/each}
						</div>
						{#if commandSections.overflowCount > 0}
							<div class="command-overflow">
								<span>+{commandSections.overflowCount} نتیجه دیگر — برای مشاهده جستجو کنید</span>
							</div>
						{/if}
					{/if}

					{#if commandSections.logout.length > 0}
						<div class="command-list" role="listbox" aria-label="اقدامات">
							{#each commandSections.logout as item, i (item.id)}
								{@const index = logoutOffset + i}
								<button
									type="button"
									class="command-item command-item-danger"
									class:is-selected={index === selectedCommandIndex}
									role="option"
									aria-selected={index === selectedCommandIndex}
									onmouseenter={() => (selectedCommandIndex = index)}
									onclick={() => goToCommand(item)}
								>
									<span class="command-item-icon">
										<AnimatedIcon name={item.icon ?? 'logout'} size={18} active={index === selectedCommandIndex} />
									</span>
									<span class="command-item-text">
										<strong>{item.label}</strong>
										{#if item.subtitle}<small>{item.subtitle}</small>{/if}
									</span>
									<span class="command-item-shortcut">Enter</span>
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-main {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100vh;
		max-height: 100vh;
		overflow: hidden;
	}

	.admin-body {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		overflow: hidden;
	}

	.admin-page-inspector {
		width: 380px;
		flex: 0 0 380px;
		background: var(--va-bg-panel);
		border-inline-start: 1px solid var(--va-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-inner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 100%;
		padding: 0.85rem 0.75rem;
	}

	.sidebar-brand {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		padding: 0.35rem 0.55rem 0.85rem;
		border-bottom: 1px solid var(--admin-border);
	}

	.sidebar-version {
		margin-inline-start: auto;
		font: 500 0.62rem var(--va-font-mono);
		color: var(--admin-text-faint);
		border: 1px solid var(--admin-border);
		border-radius: 0.25rem;
		padding: 0.08rem 0.35rem;
	}

	.sidebar-collapse {
		display: none;
		width: 30px; height: 30px;
		align-items: center; justify-content: center;
		border-radius: 0.4rem;
		background: var(--admin-surface-soft);
		border: 1px solid var(--admin-border);
		color: var(--admin-text-muted);
	}

	.sidebar-nav {
		flex: 1 1 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding-inline: 0;
	}

	.sidebar-group-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0 0.55rem;
		background: transparent;
		border: 0;
		cursor: pointer;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	.sidebar-group-label {
		font-size: 0.66rem;
		font-weight: 500;
		color: var(--admin-text-faint);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-family: var(--va-font-mono);
	}

	.sidebar-group-chevron {
		color: var(--admin-text-faint);
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.sidebar-group-chevron.is-collapsed {
		transform: rotate(-90deg);
	}

	.sidebar-list {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.admin-nav-label { flex: 1 1 0; min-width: 0; }

	.admin-nav-badge {
		min-width: 20px;
		height: 18px;
		padding: 0 0.4rem;
		border-radius: 0.25rem;
		font-size: 0.65rem;
		font-weight: 600;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--admin-surface-soft);
		color: var(--admin-text-faint);
		border: 1px solid var(--admin-border);
	}

	.admin-nav-item.is-active .admin-nav-badge {
		background: transparent;
		color: var(--admin-text);
		border-color: transparent;
	}

	.sidebar-avatar {
		width: 30px; height: 30px;
		border-radius: 0.35rem;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--admin-surface-soft);
		border: 1px solid var(--admin-border);
		color: var(--admin-text);
		font-weight: 600;
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	/* ============= HEADER ============= */

	.admin-header {
		position: sticky;
		top: 0;
		z-index: 30;
	}

	.admin-header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0 1.25rem;
		min-height: var(--admin-header-height);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex: 1 1 0;
		min-width: 0;
	}

	.header-menu {
		display: none;
		width: 32px; height: 32px;
		align-items: center; justify-content: center;
		border-radius: 0.4rem;
		background: var(--admin-surface-soft);
		border: 1px solid var(--admin-border);
		color: var(--admin-text);
	}

	.header-search {
		position: relative;
		flex: 1 1 0;
		max-width: 360px;
	}

	.command-search-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 34px;
		border: 1px solid var(--admin-border);
		border-radius: 0.45rem;
		background: var(--admin-surface-soft);
		color: var(--admin-text-muted);
		cursor: pointer;
		transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
	}

	.command-search-trigger:hover {
		border-color: var(--admin-border-strong);
		background: var(--admin-card-hover);
		color: var(--admin-text);
		transform: translateY(-1px);
	}

	.header-search-icon {
		position: absolute;
		top: 50%;
		inset-inline-start: 0.85rem;
		transform: translateY(-50%);
		color: var(--admin-text-faint);
		pointer-events: none;
	}

	.header-search-input {
		width: 100%;
		padding-block: 0.48rem;
		padding-inline-start: 2.25rem;
		padding-inline-end: 0.85rem;
		font-size: 0.78rem;
	}

	.command-search-copy {
		display: block;
		overflow: hidden;
		color: inherit;
		text-align: start;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.command-search-trigger kbd,
	.command-search-row kbd,
	.command-item-shortcut {
		flex: 0 0 auto;
		border: 1px solid var(--admin-border);
		border-radius: 0.3rem;
		background: var(--admin-surface);
		color: var(--admin-text-faint);
		font: 600 0.62rem var(--va-font-mono);
		padding: 0.12rem 0.35rem;
		margin-left: 4px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-icon-btn {
		width: 32px; height: 32px;
		border-radius: 0.4rem;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--admin-surface-soft);
		border: 1px solid var(--admin-border);
		color: var(--admin-text);
		transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
	}

	.header-icon-btn:hover {
		background: var(--admin-card-hover);
		color: var(--admin-accent);
		transform: translateY(-1px);
	}

	.mobile-command-button {
		display: none;
	}

	.header-user { display: flex; align-items: center; position: relative; }
	.header-avatar { width: 32px; height: 32px; font-size: 0.82rem; }
	.header-avatar-btn {
		cursor: pointer;
		transition: opacity 0.2s ease, transform 0.2s ease;
	}
	.header-avatar-btn:hover { opacity: 0.85; transform: translateY(-1px); }

	.profile-menu {
		position: absolute;
		top: calc(100% + 8px);
		inset-inline-end: 0;
		min-width: 200px;
		background: var(--admin-card);
		border: 1px solid var(--admin-border-strong);
		border-radius: 0.65rem;
		box-shadow: var(--admin-shadow-pop);
		z-index: 60;
		overflow: hidden;
		animation: command-pop 120ms ease-out both;
	}

	.profile-menu-user {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 0.85rem;
	}

	.profile-menu-avatar { width: 30px; height: 30px; font-size: 0.8rem; }

	.profile-menu-meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.profile-menu-name {
		font-size: 0.84rem;
		font-weight: 650;
		color: var(--admin-text-strong);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-menu-sub {
		font-size: 0.7rem;
		color: var(--admin-text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-menu-divider {
		height: 1px;
		background: var(--admin-border);
		margin: 0;
	}

	.profile-menu-logout {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.65rem 0.85rem;
		background: transparent;
		border: 0;
		color: var(--va-danger);
		font-size: 0.82rem;
		font-weight: 550;
		cursor: pointer;
		font-family: inherit;
		text-align: start;
		transition: background-color 0.15s ease;
	}

	.profile-menu-logout:hover {
		background: color-mix(in srgb, var(--va-danger) 8%, transparent);
	}

	.profile-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 59;
		background: transparent;
		border: 0;
		cursor: default;
	}

	/* ============= CONTENT ============= */

	.admin-content {
		flex: 1 1 0;
		min-height: 0;
		overflow-y: auto;
		padding: 1.25rem 1.5rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.page-header-text { display: flex; flex-direction: column; gap: 0.45rem; }
	.page-header-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

	.page-title {
		font-size: 1.18rem;
		font-weight: 600;
		color: var(--admin-text-strong);
		margin: 0;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}

	.page-subtitle {
		color: var(--admin-text-muted);
		font-size: 0.78rem;
		margin: 0;
	}

	.breadcrumb-sep { color: var(--admin-text-faint); }
	.breadcrumb-link {
		color: var(--admin-text-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}
	.breadcrumb-link:hover { color: var(--admin-accent); }

	.sidebar-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 3, 16, 0.55);
		backdrop-filter: blur(6px);
		z-index: 35;
		display: none;
		border: 0;
	}

	.command-backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: start center;
		padding: min(14vh, 7rem) 1rem 1rem;
		background: color-mix(in srgb, var(--admin-bg) 62%, transparent);
		backdrop-filter: blur(12px);
	}

	.command-palette {
		width: min(680px, 100%);
		overflow: hidden;
		border: 1px solid var(--admin-border-strong);
		border-radius: 0.75rem;
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--admin-card) 96%, transparent), var(--admin-surface-strong)),
			var(--admin-card);
		box-shadow: var(--admin-shadow-pop);
		direction: rtl;
		transform-origin: top center;
		animation: command-pop 150ms ease-out both;
	}

	@keyframes command-pop {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.command-search-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--admin-border);
		color: var(--admin-text-muted);
	}

	.command-search-row input {
		flex: 1 1 0;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--admin-text-strong);
		font: 500 0.95rem var(--va-font);
	}

	.command-search-row input::placeholder {
		color: var(--admin-text-faint);
	}

	.command-clear {
		border: 1px solid var(--admin-border);
		border-radius: 0.35rem;
		background: var(--admin-surface-soft);
		color: var(--admin-text-muted);
		cursor: pointer;
		font-size: 0.72rem;
		padding: 0.28rem 0.55rem;
		transition: background-color 0.2s ease, color 0.2s ease;
	}

	.command-clear:hover {
		background: var(--admin-card-hover);
		color: var(--admin-text);
	}

	.command-hint {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--admin-border);
		color: var(--admin-text-faint);
		font-size: 0.72rem;
		line-height: 1.7;
	}

	.command-section-label {
		padding: 0.75rem 1rem 0.4rem;
		color: var(--admin-text-faint);
		font: 600 0.68rem var(--va-font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.command-list {
		max-height: min(48vh, 420px);
		overflow-y: auto;
		padding: 0 0.55rem 0.65rem;
	}

	.command-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		border: 1px solid transparent;
		border-radius: 0.55rem;
		background: transparent;
		color: var(--admin-text);
		cursor: pointer;
		text-align: start;
		transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
	}

	.command-item:hover,
	.command-item.is-selected {
		border-color: var(--admin-border-strong);
		background: var(--admin-surface-soft);
		transform: translateY(-1px);
	}

	.command-item-icon {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 0.45rem;
		background: var(--admin-surface);
		color: var(--admin-accent);
		border: 1px solid var(--admin-border);
	}

	.command-item-text {
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		flex-direction: column;
		gap: 0.12rem;
	}

	.command-item-text strong {
		color: var(--admin-text-strong);
		font-size: 0.86rem;
		font-weight: 650;
	}

	.command-item-text small {
		color: var(--admin-text-faint);
		font-size: 0.7rem;
	}

	.command-overflow {
		margin: 0 0.65rem 0.35rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.4rem;
		color: var(--admin-text-faint);
		font: 500 0.72rem var(--va-font-mono);
		text-align: center;
		background: var(--admin-surface-soft);
		border: 1px dashed var(--admin-border);
	}

	.command-item-danger strong {
		color: var(--va-danger);
	}

	.command-item-danger .command-item-icon {
		color: var(--va-danger);
		border-color: color-mix(in srgb, var(--va-danger) 25%, transparent);
		background: color-mix(in srgb, var(--va-danger) 8%, transparent);
	}

	.command-empty {
		margin: 0 0.65rem 0.75rem;
		padding: 1.4rem;
		border: 1px dashed var(--admin-border);
		border-radius: 0.55rem;
		color: var(--admin-text-muted);
		text-align: center;
		font-size: 0.82rem;
	}

	/* ============= RESPONSIVE ============= */

	@media (max-width: 1180px) {
		.admin-page-inspector {
			display: none;
		}
	}

	@media (max-width: 1023px) {
		.admin-container { display: block; }
		.admin-main {
			height: 100vh;
			max-height: 100vh;
		}
		.admin-sidebar {
			position: fixed;
			top: 0;
			bottom: 0;
			right: 0;
			left: auto;
			width: 280px;
			transform: translateX(100%);
			transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
			z-index: 40;
			border-left: 1px solid var(--admin-border);
			border-right: 0;
			border-bottom: 0;
		}
		.admin-sidebar.is-open { transform: translateX(0); }
		.sidebar-backdrop { display: block; }
		.sidebar-collapse { display: inline-flex; }
		.header-menu { display: inline-flex; }
		.admin-content { padding: 1rem 1rem 2rem; gap: 1rem; }
		.admin-header-inner { padding: 0 1rem; }
		.page-title { font-size: 1.15rem; }
		.header-search { display: none; }
		.mobile-command-button { display: inline-flex; }
	}

	@media (max-width: 767px) {
		.header-right {
			gap: 0.35rem;
		}

		.admin-header-inner {
			min-height: 52px;
			padding-inline: 0.85rem;
		}

		.admin-content {
			padding: 0.9rem 0.8rem 2rem;
		}

		.command-backdrop {
			place-items: start center;
			padding: 10vh 0.75rem 10vh;
		}

		.command-palette {
			border-radius: 0.8rem;
			max-height: 80vh;
			overflow-y: auto;
		}

		.command-hint {
			flex-direction: column;
			gap: 0.15rem;
		}

		.command-search-row {
			gap: 0.55rem;
			padding: 0.75rem;
		}

		.command-list {
			max-height: none;
		}
	}
</style>
