<script lang="ts">
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import {
		closeResellerSupportTicket,
		deleteManagerResellerTicket,
		dismissReport,
		replyResellerSupportTicket
	} from '../../../../../routes/manage/page.remote';

	type Report = {
		id: number;
		email: string;
		uuid: string;
		message?: string;
		status?: string;
		created_at: number;
	};

	type ResellerTicket = {
		id: number;
		resellerId: number;
		resellerUsername: string;
		subject: string;
		message: string;
		status: 'open' | 'closed';
		createdAt: number;
		closedAt: number | null;
		messages: Array<{
			id: number;
			senderType: 'reseller' | 'manager' | 'user';
			message: string;
			createdAt: number;
			attachments: Array<{ id: number; fileName: string; dataUrl: string; sizeBytes: number }>;
		}>;
	};

	type Props = {
		data: { configIssueReports?: Report[]; resellerTickets?: ResellerTicket[] };
	};

	let { data }: Props = $props();

	const shellSearch = getContext<{ value: string }>('adminShellSearch') ?? { value: '' };

	// ── view state ────────────────────────────────────────────────────────────
	let section = $state<'tickets' | 'reports'>('tickets');
	const isTicketsSection = $derived(section === 'tickets');
	const isReportsSection = $derived(section === 'reports');
	let ticketFilter = $state<'all' | 'open' | 'closed'>('all');
	let query = $state('');
	let selectedTicketId = $state<number | null>(null);
	let replyText = $state<Record<number, string>>({});
	let previewImage = $state<{ src: string; alt: string } | null>(null);

	// ── close-ticket confirmation ─────────────────────────────────────────────
	let closeConfirmOpen = $state(false);
	let closeConfirmResolve: ((confirmed: boolean) => void) | null = null;
	let deleteConfirmId = $state<number | null>(null);

	function awaitCloseConfirm(): Promise<boolean> {
		return new Promise((resolve) => {
			closeConfirmOpen = true;
			closeConfirmResolve = resolve;
		});
	}

	function resolveCloseConfirm(confirmed: boolean) {
		closeConfirmOpen = false;
		closeConfirmResolve?.(confirmed);
		closeConfirmResolve = null;
	}

	const reports = $derived(data.configIssueReports ?? []);
	const allTickets = $derived(data.resellerTickets ?? []);
	const openTickets = $derived(allTickets.filter((t) => t.status === 'open'));
	const closedTickets = $derived(allTickets.filter((t) => t.status === 'closed'));

	const filteredTickets = $derived.by(() => {
		const q = (query || shellSearch.value).trim().toLowerCase();
		return allTickets.filter((t) => {
			if (ticketFilter === 'open' && t.status !== 'open') return false;
			if (ticketFilter === 'closed' && t.status !== 'closed') return false;
			if (q && ![t.resellerUsername, t.subject, String(t.id)].join(' ').toLowerCase().includes(q))
				return false;
			return true;
		});
	});

	const filteredReports = $derived.by(() => {
		const q = (query || shellSearch.value).trim().toLowerCase();
		return reports.filter((r) => {
			if (!q) return true;
			return [r.email, r.uuid, r.message ?? ''].join(' ').toLowerCase().includes(q);
		});
	});

	const selectedTicket = $derived(allTickets.find((t) => t.id === selectedTicketId) ?? null);

	const pageSize = 10;
	let ticketsPage = $state(1);
	let reportsPage = $state(1);

	const ticketsTotalPages = $derived(Math.max(1, Math.ceil(filteredTickets.length / pageSize)));
	const visibleTickets = $derived(filteredTickets.slice((ticketsPage - 1) * pageSize, ticketsPage * pageSize));

	const reportsTotalPages = $derived(Math.max(1, Math.ceil(filteredReports.length / pageSize)));
	const visibleReports = $derived(filteredReports.slice((reportsPage - 1) * pageSize, reportsPage * pageSize));

	// Reset page to 1 whenever the filter / search changes
	$effect(() => {
		void query;
		void shellSearch.value;
		void ticketFilter;
		ticketsPage = 1;
	});
	$effect(() => {
		void query;
		void shellSearch.value;
		reportsPage = 1;
	});

	const statItems = $derived([
		{
			label: 'تیکت باز',
			value: openTickets.length,
			unit: 'مورد',
			delta: openTickets.length ? 'نیازمند رسیدگی' : 'همه رسیدگی شدند',
			deltaTone: openTickets.length ? ('warning' as const) : ('success' as const)
		},
		{
			label: 'کل تیکت‌ها',
			value: allTickets.length,
			unit: 'تیکت',
			delta: 'از فروشندگان',
			deltaTone: 'muted' as const
		},
		{
			label: 'گزارش کاربران',
			value: reports.length,
			unit: 'مورد',
			delta: reports.length ? 'نیازمند رسیدگی' : 'هیچ گزارشی موجود نیست',
			deltaTone: reports.length ? ('warning' as const) : ('muted' as const)
		},
		{
			label: 'بسته شده',
			value: closedTickets.length,
			unit: 'تیکت',
			delta: 'رسیدگی شده',
			deltaTone: 'muted' as const
		}
	]);

	// ── helpers ───────────────────────────────────────────────────────────────
	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function formatAge(timestamp: number) {
		const diff = Math.max(0, Date.now() / 1000 - timestamp);
		if (diff < 3600) return `${Math.max(1, Math.round(diff / 60)).toLocaleString('fa-IR-u-nu-latn')} دقیقه پیش`;
		if (diff < 86400) return `${Math.round(diff / 3600).toLocaleString('fa-IR-u-nu-latn')} ساعت پیش`;
		if (diff < 86400 * 7) return `${Math.round(diff / 86400).toLocaleString('fa-IR-u-nu-latn')} روز پیش`;
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date(timestamp * 1000));
	}

	function formatBytes(bytes: number) {
		if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	function openAttachment(dataUrl: string, alt = 'پیوست') {
		previewImage = { src: dataUrl, alt };
	}

	// ── actions ───────────────────────────────────────────────────────────────
	async function handleTicketClose(
		form: ReturnType<typeof closeResellerSupportTicket.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.ticketSuccess) {
			toast.success(result.ticketSuccess);
			selectedTicketId = null;
		}
		if (result?.ticketError) toast.error(result.ticketError);
	}

	async function handleTicketReply(
		form: ReturnType<typeof replyResellerSupportTicket.for>,
		submit: () => Promise<void>,
		ticketId: number
	) {
		await submit();
		const result = form.result;
		if (result?.ticketSuccess) {
			toast.success(result.ticketSuccess);
			replyText = { ...replyText, [ticketId]: '' };
		}
		if (result?.ticketError) toast.error(result.ticketError);
	}

	async function handleTicketDelete(
		form: ReturnType<typeof deleteManagerResellerTicket.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.ticketSuccess) {
			toast.success(result.ticketSuccess);
			selectedTicketId = null;
		}
		if (result?.ticketError) toast.error(result.ticketError);
	}

	async function handleDismiss(
		form: ReturnType<typeof dismissReport.for>,
		submit: () => Promise<void>
	) {
		await submit();
		const result = form.result;
		if (result?.reportSuccess) toast.success(result.reportSuccess);
		if (result?.reportError) toast.error(result.reportError);
	}
</script>

<!-- ═══ TICKETS — LIST VIEW ══════════════════════════════════════════════════ -->
{#if section === 'tickets' && selectedTicket === null}
	<div class="reports-va">
		<VaStatRow items={statItems} />

		<!-- Toolbar -->
		<div class="va-toolbar reports-toolbar">
			<button
				type="button"
				class="va-chip"
				class:is-active={isTicketsSection}
				onclick={() => { section = 'tickets'; selectedTicketId = null; query = ''; }}
			>
				<AnimatedIcon name="ticket" size={12} />
				تیکت فروشندگان
				<span class="chip-count">{allTickets.length}</span>
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={isReportsSection}
				onclick={() => { section = 'reports'; selectedTicketId = null; query = ''; }}
			>
				<AnimatedIcon name="flag" size={12} />
				گزارش کاربران
				{#if reports.length}<span class="chip-count chip-warn">{reports.length}</span>{/if}
			</button>

			<span class="va-divider-vertical" aria-hidden="true"></span>

			<button
				type="button"
				class="va-chip"
				class:is-active={ticketFilter === 'all'}
				onclick={() => (ticketFilter = 'all')}
			>
				همه <span class="chip-count">{allTickets.length}</span>
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={ticketFilter === 'open'}
				onclick={() => (ticketFilter = 'open')}
			>
				باز <span class="chip-count">{openTickets.length}</span>
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={ticketFilter === 'closed'}
				onclick={() => (ticketFilter = 'closed')}
			>
				بسته <span class="chip-count">{closedTickets.length}</span>
			</button>

			<span class="toolbar-spacer"></span>

			<label class="va-toolbar-search" aria-label="جستجو">
				<AnimatedIcon name="search" size={13} />
				<input bind:value={query} type="search" placeholder="جستجو در تیکت‌ها یا فروشنده…" />
			</label>
		</div>

		<!-- Table -->
		<div class="va-card tickets-table-card">
			{#if filteredTickets.length === 0}
				<div class="empty-section">
					<EmptyState
						title="تیکتی پیدا نشد"
						description="تیکت‌های فروشندگان بعد از ثبت در این صفحه نمایش داده می‌شوند."
						icon="inbox"
					/>
				</div>
			{:else}
				<div class="ticket-table-header">
					<span class="col-id">#</span>
					<span class="col-subject">عنوان تیکت</span>
					<span class="col-reseller">فروشنده</span>
					<span class="col-status">وضعیت</span>
					<span class="col-msgs">پیام‌ها</span>
					<span class="col-date">تاریخ</span>
					<span class="col-updated">آخرین فعالیت</span>
					<span class="col-action"></span>
				</div>
				{#each visibleTickets as ticket (ticket.id)}
					{@const lastMsg = ticket.messages[ticket.messages.length - 1]}
					{@const isOpen = ticket.status === 'open'}
					{@const waitingForManager = isOpen && (!lastMsg || lastMsg.senderType === 'reseller')}
					<button
						type="button"
						class="ticket-row"
						class:is-open={isOpen}
						class:is-waiting={waitingForManager}
						onclick={() => (selectedTicketId = ticket.id)}
					>
						<span class="col-id ticket-id">#{ticket.id.toLocaleString('fa-IR-u-nu-latn')}</span>
						<span class="col-subject ticket-subject-cell">
							<span class="ticket-subject-line">
								{#if waitingForManager}<span class="waiting-dot" aria-hidden="true"></span>{/if}
								<span class="ticket-subject-text">{ticket.subject}</span>
							</span>
							{#if lastMsg?.message}
								<span class="ticket-preview">
									{lastMsg.senderType === 'manager' ? 'مدیر: ' : `${ticket.resellerUsername}: `}{lastMsg.message.slice(0, 72)}…
								</span>
							{/if}
						</span>
						<span class="col-reseller ticket-reseller">{ticket.resellerUsername}</span>
						<span class="col-status">
							{#if isOpen}
								<span class="status-pill status-open">{waitingForManager ? 'منتظر مدیر' : 'باز'}</span>
							{:else}
								<span class="status-pill status-closed">بسته</span>
							{/if}
						</span>
						<span class="col-msgs ticket-msgs">{ticket.messages.length.toLocaleString('fa-IR-u-nu-latn')}</span>
						<span class="col-date ticket-date">{formatDate(ticket.createdAt)}</span>
						<span class="col-updated ticket-age">
							{lastMsg ? formatAge(lastMsg.createdAt) : formatAge(ticket.createdAt)}
						</span>
						<span class="col-action ticket-chevron" aria-hidden="true">
							<AnimatedIcon name="chevron-left" size={12} />
						</span>
					</button>
				{/each}
			{/if}
		</div>

		{#if filteredTickets.length > 0}
			<div class="list-footer">
				{#if ticketsTotalPages > 1}
					<div class="va-pagination list-pagination">
						<span>{ticketsPage} / {ticketsTotalPages}</span>
						<div class="pagination-controls">
							<button
								type="button"
								class="va-icon-btn"
								disabled={ticketsPage <= 1}
								onclick={() => (ticketsPage = Math.max(1, ticketsPage - 1))}
								aria-label="صفحه قبل"
							>
								<span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span>
							</button>
							<button
								type="button"
								class="va-icon-btn next-page"
								disabled={ticketsPage >= ticketsTotalPages}
								onclick={() => (ticketsPage = Math.min(ticketsTotalPages, ticketsPage + 1))}
								aria-label="صفحه بعد"
							>
								<AnimatedIcon name="chevron-left" size={13} />
							</button>
						</div>
					</div>
				{:else}
					نمایش {filteredTickets.length.toLocaleString('fa-IR-u-nu-latn')} از {allTickets.length.toLocaleString('fa-IR-u-nu-latn')} تیکت
				{/if}
			</div>
		{/if}
	</div>

<!-- ═══ TICKETS — DETAIL VIEW ════════════════════════════════════════════════ -->
{:else if section === 'tickets' && selectedTicket !== null}
	{@const t = selectedTicket}
	{@const lastMsg = t.messages[t.messages.length - 1]}
	{@const waitingForManager = t.status === 'open' && (!lastMsg || lastMsg.senderType === 'reseller')}
	{@const ticketForm = closeResellerSupportTicket.for(t.id)}
	{@const replyForm = replyResellerSupportTicket.for(t.id)}
	{@const deleteForm = deleteManagerResellerTicket.for(t.id)}

	<div class="reports-va detail-va">
		<!-- Topbar -->
		<div class="detail-topbar">
			<button
				type="button"
				class="admin-btn admin-btn-ghost back-btn"
				onclick={() => (selectedTicketId = null)}
			>
				<AnimatedIcon name="chevron-left" size={13} />
				<span>بازگشت به فهرست</span>
			</button>
			<span class="toolbar-spacer"></span>
			{#if t.status === 'open'}
				<form
					{...ticketForm.enhance(async ({ submit }) => {
						const confirmed = await awaitCloseConfirm();
						if (!confirmed) return;
						await handleTicketClose(ticketForm, submit);
					})}
				>
					<input type="hidden" name="id" value={t.id} />
					<button type="submit" class="admin-btn admin-btn-danger-ghost">
						<AnimatedIcon name="check" size={13} />
						<span>بستن تیکت</span>
					</button>
				</form>
			{:else}
				<form {...deleteForm.enhance(async ({ submit }) => { if (deleteConfirmId !== t.id) { deleteConfirmId = t.id; return; } deleteConfirmId = null; await handleTicketDelete(deleteForm, submit); })}>
					<input type="hidden" name="id" value={t.id} />
					<button type="submit" class="admin-btn admin-btn-danger-ghost">
						<AnimatedIcon name="flag" size={13} />
						<span>حذف تیکت</span>
					</button>
				</form>
			{/if}
		</div>

		<!-- Status banner -->
		<div
			class="va-card detail-banner"
			class:banner-open={t.status === 'open'}
			class:banner-closed={t.status === 'closed'}
		>
			<div class="banner-item">
				<span class="va-section-label">فروشنده</span>
				<span class="banner-value mono">{t.resellerUsername}</span>
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">وضعیت</span>
				{#if t.status === 'open'}
					<span class="status-pill status-open">{waitingForManager ? 'منتظر پاسخ مدیر' : 'باز'}</span>
				{:else}
					<span class="status-pill status-closed">بسته شده</span>
				{/if}
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">تاریخ ایجاد</span>
				<span class="banner-value mono">{formatDate(t.createdAt)}</span>
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">پیام‌ها</span>
				<span class="banner-value mono">{t.messages.length.toLocaleString('fa-IR-u-nu-latn')} پیام</span>
			</div>
		</div>

		<div class="detail-layout">
			<!-- Conversation -->
			<div class="detail-main">
				<div class="va-card thread-card">
					<div class="va-section-label">گفتگو</div>
					{#if t.messages.length === 0}
						<div class="empty-thread">هنوز پیامی در این تیکت ثبت نشده است.</div>
					{:else}
						<div class="thread-messages">
							{#each t.messages as msg (msg.id)}
								{@const isManager = msg.senderType === 'manager'}
								<div class="bubble-wrap" class:mine={isManager}>
									<div class="bubble-avatar" class:mine={isManager}>
										{isManager ? 'M' : t.resellerUsername.slice(0, 1).toUpperCase()}
									</div>
									<div class="bubble-body" class:mine={isManager}>
										<div class="bubble-meta">
											<span class="bubble-sender">{isManager ? 'مدیر Skyline' : t.resellerUsername}</span>
											<time class="bubble-time">{formatDate(msg.createdAt)}</time>
										</div>
										<div class="bubble" class:mine={isManager}>
											{#if msg.message}<p>{msg.message}</p>{/if}
											{#if msg.attachments.length}
												<div class="bubble-attachments">
													{#each msg.attachments as att (att.id)}
														<button
															type="button"
															class="att-thumb"
															onclick={() => openAttachment(att.dataUrl, att.fileName)}
														>
															<img src={att.dataUrl} alt={att.fileName} />
															<span>{formatBytes(att.sizeBytes)}</span>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Reply or closed notice -->
				{#if t.status === 'open'}
					<div class="va-card reply-card">
						<div class="va-section-label">پاسخ مدیر</div>
						<form
							class="reply-form"
							{...replyForm.enhance(async ({ submit }) => {
								await handleTicketReply(replyForm, submit, t.id);
							})}
						>
							<input type="hidden" name="id" value={t.id} />
							<textarea
								name="message"
								class="admin-field reply-textarea"
								rows="5"
								placeholder="پاسخ خود را بنویسید…"
								value={replyText[t.id] ?? ''}
								oninput={(e) =>
									(replyText = {
										...replyText,
										[t.id]: (e.currentTarget as HTMLTextAreaElement).value
									})}
							></textarea>
							<div class="reply-actions">
								<div class="toolbar-spacer"></div>
								<button
									type="button"
									class="admin-btn admin-btn-ghost"
									onclick={() => (replyText = { ...replyText, [t.id]: '' })}
								>
									پاک کردن
								</button>
								<button
									type="submit"
									class="admin-btn admin-btn-primary"
									disabled={!(replyText[t.id] ?? '').trim()}
								>
									<AnimatedIcon name="message" size={12} />
									<span>ارسال پاسخ</span>
								</button>
							</div>
						</form>
					</div>
				{:else}
					<div class="va-card closed-notice">
						<AnimatedIcon name="check" size={14} />
						<span>این تیکت بسته شده است.</span>
					</div>
				{/if}
			</div>

			<!-- Sidebar -->
			<aside class="detail-sidebar">
				<div class="va-card sidebar-card">
					<div class="va-section-label">اطلاعات تیکت</div>
					<div class="info-rows">
						<div class="info-row">
							<span class="info-key">شناسه</span>
							<span class="info-val mono">#{t.id.toLocaleString('fa-IR-u-nu-latn')}</span>
						</div>
						<div class="info-row">
							<span class="info-key">فروشنده</span>
							<span class="info-val mono">{t.resellerUsername}</span>
						</div>
						<div class="info-row">
							<span class="info-key">وضعیت</span>
							{#if t.status === 'open'}
								<span class="status-pill status-open">باز</span>
							{:else}
								<span class="status-pill status-closed">بسته</span>
							{/if}
						</div>
						<div class="info-row">
							<span class="info-key">تاریخ ایجاد</span>
							<span class="info-val mono">{formatDate(t.createdAt)}</span>
						</div>
						{#if t.closedAt}
							<div class="info-row">
								<span class="info-key">تاریخ بستن</span>
								<span class="info-val mono">{formatDate(t.closedAt)}</span>
							</div>
						{/if}
						<div class="info-row">
							<span class="info-key">تعداد پیام‌ها</span>
							<span class="info-val mono">{t.messages.length.toLocaleString('fa-IR-u-nu-latn')}</span>
						</div>
						<div class="info-row">
							<span class="info-key">پیوست‌ها</span>
							<span class="info-val mono">
								{t.messages.reduce((sum, m) => sum + m.attachments.length, 0).toLocaleString('fa-IR-u-nu-latn')}
							</span>
						</div>
					</div>
				</div>

				<div class="va-card sidebar-card">
					<div class="va-section-label">طرفین گفتگو</div>
					<div class="participants">
						<div class="participant">
							<div class="p-avatar reseller">
								{t.resellerUsername.slice(0, 1).toUpperCase()}
							</div>
							<div class="p-info">
								<span class="p-name">{t.resellerUsername}</span>
								<span class="p-sub">فروشنده · ارسال‌کننده تیکت</span>
							</div>
						</div>
						<div class="participant">
							<div class="p-avatar admin">M</div>
							<div class="p-info">
								<span class="p-name">مدیر Skyline</span>
								<span class="p-sub">پشتیبانی پنل</span>
							</div>
						</div>
					</div>
				</div>

				{#if t.messages.some((m) => m.attachments.length > 0)}
					<div class="va-card sidebar-card">
						<div class="va-section-label">پیوست‌ها</div>
						<div class="all-attachments">
							{#each t.messages as msg (msg.id)}
								{#each msg.attachments as att (att.id)}
									<button
										type="button"
										class="sidebar-att"
										onclick={() => openAttachment(att.dataUrl, att.fileName)}
									>
										<div class="sidebar-att-icon">
											<AnimatedIcon name="cloud" size={12} />
										</div>
										<div class="sidebar-att-info">
											<span class="sidebar-att-name">{att.fileName}</span>
											<span class="sidebar-att-meta">
												{formatBytes(att.sizeBytes)} · {msg.senderType === 'manager' ? 'مدیر' : t.resellerUsername}
											</span>
										</div>
									</button>
								{/each}
							{/each}
						</div>
					</div>
				{/if}
			</aside>
		</div>
	</div>

<!-- ═══ USER REPORTS ══════════════════════════════════════════════════════════ -->
{:else if section === 'reports'}
	<div class="reports-va">
		<VaStatRow items={statItems} />

		<!-- Toolbar -->
		<div class="va-toolbar reports-toolbar">
			<button
				type="button"
				class="va-chip"
				class:is-active={isTicketsSection}
				onclick={() => { section = 'tickets'; selectedTicketId = null; query = ''; }}
			>
				<AnimatedIcon name="ticket" size={12} />
				تیکت فروشندگان
				<span class="chip-count">{allTickets.length}</span>
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={isReportsSection}
				onclick={() => { section = 'reports'; query = ''; }}
			>
				<AnimatedIcon name="flag" size={12} />
				گزارش کاربران
				{#if reports.length}<span class="chip-count chip-warn">{reports.length}</span>{/if}
			</button>

			<span class="toolbar-spacer"></span>

			<label class="va-toolbar-search" aria-label="جستجو">
				<AnimatedIcon name="search" size={13} />
				<input bind:value={query} type="search" placeholder="جستجو در گزارش‌ها…" />
			</label>
		</div>

		{#if filteredReports.length === 0}
			<div class="va-card empty-section-card">
				<EmptyState
					title="گزارشی ثبت نشده"
					description="گزارش‌های کاربران از صفحه شخصی‌شان در اینجا نمایش داده می‌شوند."
					icon="inbox"
				/>
			</div>
		{:else}
			<div class="reports-list">
				{#each visibleReports as report (report.id)}
					{@const dismissForm = dismissReport.for(report.id)}
					<div class="va-card report-card">
						<div class="report-icon">
							<AnimatedIcon name="flag" size={14} active />
						</div>
						<div class="report-main">
							<div class="report-title-line">
								<span class="p-avatar reseller small">{report.email.slice(0, 1).toUpperCase()}</span>
								<span class="report-email">{report.email}</span>
								<code dir="ltr" class="report-uuid">{report.uuid.slice(0, 18)}…</code>
							</div>
							<div class="report-note">
								{report.message?.trim() ||
									'کاربر از صفحه شخصی خود مشکل اتصال یا قطعی کانفیگ را گزارش کرده است.'}
							</div>
							<div class="report-meta">
								<span>ثبت: {formatDate(report.created_at)}</span>
								<span>·</span>
								<span>{formatAge(report.created_at)}</span>
							</div>
						</div>
						<div class="report-actions">
							<a
								href={resolve('/user/[uuid]', { uuid: report.uuid })}
								target="_blank"
								rel="noreferrer"
								class="admin-btn admin-btn-ghost"
							>
								<AnimatedIcon name="cloud" size={12} />
								<span>صفحه کاربر</span>
							</a>
							<form
								{...dismissForm.enhance(async ({ submit }) => {
									await handleDismiss(dismissForm, submit);
								})}
							>
								<input type="hidden" name="id" value={report.id} />
								<button type="submit" class="admin-btn admin-btn-primary">
									<AnimatedIcon name="check" size={12} />
									<span>رسیدگی شد</span>
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
			{#if reportsTotalPages > 1}
				<div class="list-footer">
					<div class="va-pagination list-pagination">
						<span>{reportsPage} / {reportsTotalPages}</span>
						<div class="pagination-controls">
							<button
								type="button"
								class="va-icon-btn"
								disabled={reportsPage <= 1}
								onclick={() => (reportsPage = Math.max(1, reportsPage - 1))}
								aria-label="صفحه قبل"
							>
								<span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span>
							</button>
							<button
								type="button"
								class="va-icon-btn next-page"
								disabled={reportsPage >= reportsTotalPages}
								onclick={() => (reportsPage = Math.min(reportsTotalPages, reportsPage + 1))}
								aria-label="صفحه بعد"
							>
								<AnimatedIcon name="chevron-left" size={13} />
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<ConfirmDialog
	open={closeConfirmOpen}
	title="بستن تیکت"
	description="آیا مطمئن هستید؟ پس از بستن، تیکت به حالت «بسته» تغییر می‌کند."
	confirmLabel="بله، ببند"
	intent="warning"
	onConfirm={() => resolveCloseConfirm(true)}
	onClose={() => resolveCloseConfirm(false)}
/>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />

<ConfirmDialog
	open={deleteConfirmId !== null}
	title="حذف تیکت بسته"
	description="تیکت و همه پیام‌های آن برای همیشه حذف می‌شود."
	confirmLabel="حذف تیکت"
	intent="danger"
	onConfirm={() => {
		const button = document.querySelector<HTMLButtonElement>('.detail-topbar form .admin-btn-danger-ghost');
		button?.click();
	}}
	onClose={() => (deleteConfirmId = null)}
/>

<style>
	/* ── Layout ────────────────────────────────────────────────────────────── */
	.reports-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.detail-va {
		gap: 14px;
	}

	/* ── Toolbar ───────────────────────────────────────────────────────────── */
	.reports-toolbar {
		flex-wrap: wrap;
	}

	.toolbar-spacer {
		flex: 1;
	}

	.chip-count {
		margin-inline-start: 4px;
		padding-inline: 5px;
		border-radius: 999px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		font-family: var(--va-font-mono);
	}

	.chip-warn {
		background: color-mix(in srgb, var(--va-warning) 18%, var(--va-bg-raised));
		color: var(--va-warning);
	}

	/* ── Table ─────────────────────────────────────────────────────────────── */
	.tickets-table-card {
		padding: 0;
		overflow: hidden;
	}

	.ticket-table-header,
	.ticket-row {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr) 110px 120px 70px 150px 130px 36px;
		align-items: center;
	}

	.ticket-table-header {
		background: var(--va-bg-raised);
		border-bottom: 1px solid var(--va-border);
	}

	.ticket-table-header span {
		padding: 9px 12px;
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.ticket-row {
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--va-border);
		background: transparent;
		color: var(--va-text);
		text-align: right;
		cursor: pointer;
		transition: background 120ms ease;
	}

	.ticket-row:last-child {
		border-bottom: 0;
	}

	.ticket-row:hover {
		background: var(--va-bg-hover, color-mix(in srgb, var(--va-bg) 50%, var(--va-bg-raised)));
	}

	.ticket-id {
		padding: 13px 12px;
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.ticket-subject-cell {
		padding: 11px 12px 11px 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ticket-subject-line {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.waiting-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--va-warning);
		flex-shrink: 0;
	}

	.ticket-subject-text {
		font-size: 13px;
		color: var(--va-text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.is-waiting .ticket-subject-text {
		font-weight: 600;
	}

	.ticket-preview {
		font-size: 11.5px;
		color: var(--va-text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 420px;
	}

	.ticket-reseller {
		padding: 13px 12px;
		font: 500 12px var(--va-font-mono);
		color: var(--va-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ticket-msgs {
		padding: 13px 12px;
		font: 500 12px var(--va-font-mono);
		color: var(--va-text);
	}

	.ticket-date {
		padding: 13px 12px;
		font: 500 11px var(--va-font-mono);
		color: var(--va-text-muted);
	}

	.ticket-age {
		padding: 13px 12px;
		font-size: 12px;
		color: var(--va-text);
	}

	.ticket-chevron {
		padding: 13px;
		display: flex;
		justify-content: center;
		color: var(--va-text-faint);
	}

	/* ── Status pills ──────────────────────────────────────────────────────── */
	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 5px;
		font: 500 11px var(--va-font-mono);
		white-space: nowrap;
	}

	.status-pill::before {
		content: '';
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}

	.status-open {
		background: color-mix(in srgb, var(--va-warning) 12%, transparent);
		color: var(--va-warning);
	}

	.status-open::before {
		background: var(--va-warning);
	}

	.status-closed {
		background: color-mix(in srgb, var(--va-text-faint) 10%, transparent);
		color: var(--va-text-faint);
	}

	.status-closed::before {
		background: var(--va-text-faint);
	}

	/* ── Empty ─────────────────────────────────────────────────────────────── */
	.empty-section {
		padding: 32px;
	}

	.empty-section-card {
		padding: 32px;
	}

	/* ── Footer / Pagination ────────────────────────────────────────────────── */
	.list-footer {
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text-faint);
		padding-inline: 4px;
	}

	.list-pagination {
		padding: 6px 4px;
	}

	.pagination-controls {
		display: flex;
		gap: 4px;
	}

	.next-page {
		transform: rotate(180deg);
	}

	/* ── Detail topbar ─────────────────────────────────────────────────────── */
	.detail-topbar {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.back-btn {
		gap: 6px;
	}

	/* danger ghost */
	:global(.admin-btn-danger-ghost) {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		background: transparent;
		color: var(--va-danger);
		font-size: 12.5px;
		padding: 6px 10px;
		border-radius: 6px;
		border: 1px solid var(--va-border);
		cursor: pointer;
		font-family: var(--va-font-fa, inherit);
		transition: background 120ms ease, border-color 120ms ease;
	}

	:global(.admin-btn-danger-ghost:hover) {
		background: color-mix(in srgb, var(--va-danger) 8%, transparent);
		border-color: color-mix(in srgb, var(--va-danger) 35%, var(--va-border));
	}

	/* ── Detail banner ─────────────────────────────────────────────────────── */
	.detail-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0;
		padding: 12px 16px;
		border-inline-start-width: 3px;
		border-inline-start-style: solid;
	}

	.banner-open {
		border-inline-start-color: var(--va-warning);
	}

	.banner-closed {
		border-inline-start-color: var(--va-text-faint);
	}

	.banner-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 16px 0 0;
	}

	.banner-sep {
		width: 1px;
		height: 32px;
		background: var(--va-border);
		margin: 0 16px 0 0;
	}

	.banner-value {
		font: 500 12.5px/1.4 var(--va-font-mono);
		color: var(--va-text);
	}

	.banner-value.mono {
		font-family: var(--va-font-mono);
	}

	/* ── Detail layout ─────────────────────────────────────────────────────── */
	.detail-layout {
		display: grid;
		grid-template-columns: 1fr 268px;
		gap: 14px;
		align-items: start;
	}

	.detail-main {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* ── Thread ────────────────────────────────────────────────────────────── */
	.thread-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
	}

	.thread-messages {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding-top: 4px;
	}

	.empty-thread {
		padding: 20px 0 6px;
		color: var(--va-text-faint);
		font-size: 12.5px;
		text-align: center;
	}

	.bubble-wrap {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	.bubble-wrap.mine {
		flex-direction: row-reverse;
	}

	.bubble-avatar {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-accent) 12%, var(--va-bg-raised));
		border: 1px solid color-mix(in srgb, var(--va-accent) 25%, var(--va-border));
		color: var(--va-accent);
		display: grid;
		place-items: center;
		font: 600 11px var(--va-font-mono);
		flex-shrink: 0;
	}

	.bubble-avatar:not(.mine) {
		background: color-mix(in srgb, var(--va-success) 12%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-success) 25%, var(--va-border));
		color: var(--va-success);
	}

	.bubble-body {
		max-width: 76%;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}

	.bubble-body.mine {
		align-items: flex-end;
	}

	.bubble-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.bubble-sender {
		font-size: 11.5px;
		color: var(--va-text);
		font-weight: 500;
	}

	.bubble-time {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.bubble {
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border);
		border-radius: 8px;
		border-top-right-radius: 8px;
		border-top-left-radius: 2px;
		padding: 10px 14px;
		font-size: 13px;
		color: var(--va-text);
		line-height: 1.8;
		white-space: pre-line;
	}

	.bubble.mine {
		background: var(--va-accent-soft);
		border-color: color-mix(in srgb, var(--va-accent) 25%, var(--va-border));
		border-top-left-radius: 8px;
		border-top-right-radius: 2px;
	}

	.bubble p {
		margin: 0;
	}

	.bubble-attachments {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
		gap: 6px;
		margin-top: 8px;
	}

	.att-thumb {
		position: relative;
		display: block;
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--va-border);
		border-radius: 7px;
		background: var(--va-bg);
		cursor: pointer;
	}

	.att-thumb img {
		display: block;
		width: 100%;
		height: 80px;
		object-fit: cover;
	}

	.att-thumb span {
		position: absolute;
		inset-inline-end: 5px;
		bottom: 5px;
		padding: 2px 5px;
		border-radius: 999px;
		background: rgb(0 0 0 / 58%);
		color: white;
		font-size: 10px;
	}

	/* ── Reply ─────────────────────────────────────────────────────────────── */
	.reply-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px;
	}

	.reply-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.reply-textarea {
		resize: vertical;
		border-radius: 6px;
	}

	.reply-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.closed-notice {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		color: var(--va-text-muted);
		font-size: 12.5px;
		background: var(--va-bg-raised);
	}

	/* ── Sidebar ───────────────────────────────────────────────────────────── */
	.detail-sidebar {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sidebar-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
	}

	.info-rows {
		display: flex;
		flex-direction: column;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid var(--va-border);
	}

	.info-row:last-child {
		border-bottom: 0;
	}

	.info-key {
		font-size: 12px;
		color: var(--va-text-muted);
	}

	.info-val {
		font-size: 12px;
		color: var(--va-text);
	}

	.info-val.mono {
		font-family: var(--va-font-mono);
	}

	.participants {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.participant {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.p-avatar {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--va-bg-raised);
		border: 1px solid var(--va-border);
		color: var(--va-text-muted);
		display: grid;
		place-items: center;
		font: 600 12px var(--va-font-mono);
		flex-shrink: 0;
	}

	.p-avatar.small {
		width: 22px;
		height: 22px;
		font-size: 10px;
	}

	.p-avatar.reseller {
		background: color-mix(in srgb, var(--va-success) 12%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-success) 22%, var(--va-border));
		color: var(--va-success);
	}

	.p-avatar.admin {
		background: color-mix(in srgb, var(--va-accent) 12%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-accent) 22%, var(--va-border));
		color: var(--va-accent);
	}

	.p-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.p-name {
		font-size: 12.5px;
		color: var(--va-text);
	}

	.p-sub {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.all-attachments {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.sidebar-att {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 0;
		border: 0;
		border-bottom: 1px solid var(--va-border);
		background: transparent;
		cursor: pointer;
		text-align: right;
		color: var(--va-text);
		transition: opacity 120ms ease;
	}

	.sidebar-att:last-child {
		border-bottom: 0;
	}

	.sidebar-att:hover {
		opacity: 0.8;
	}

	.sidebar-att-icon {
		width: 26px;
		height: 26px;
		border-radius: 5px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.sidebar-att-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sidebar-att-name {
		font: 500 11px var(--va-font-mono);
		color: var(--va-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sidebar-att-meta {
		font: 500 10px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	/* ── User reports section ──────────────────────────────────────────────── */
	.reports-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.report-card {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 16px;
	}

	.report-icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		border-radius: 6px;
		background: color-mix(in srgb, var(--va-warning) 12%, transparent);
		color: var(--va-warning);
	}

	.report-main {
		flex: 1;
		min-width: 0;
	}

	.report-title-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.report-email {
		font: 500 13px var(--va-font-mono);
		color: var(--va-text);
	}

	.report-uuid {
		font: 500 11px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.report-note {
		margin-top: 6px;
		color: var(--va-text-muted);
		font-size: 12.5px;
		line-height: 1.6;
	}

	.report-meta {
		display: flex;
		gap: 10px;
		margin-top: 8px;
		font: 500 11px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.report-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 0 0 200px;
	}

	.report-actions .admin-btn {
		justify-content: center;
		width: 100%;
	}

	/* ── Responsive ────────────────────────────────────────────────────────── */
	@media (max-width: 980px) {
		.ticket-table-header,
		.ticket-row {
			grid-template-columns: 44px minmax(0, 1fr) 100px 70px 36px;
		}

		.col-reseller,
		.col-date,
		.col-updated {
			display: none;
		}

		.detail-layout {
			grid-template-columns: 1fr;
		}

		.detail-sidebar {
			order: -1;
		}

		.report-card {
			flex-direction: column;
		}

		.report-actions {
			flex-direction: row;
			flex-wrap: wrap;
			width: 100%;
		}
	}
</style>
