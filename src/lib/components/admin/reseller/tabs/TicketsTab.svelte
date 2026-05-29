<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import ImagePreviewModal from '$lib/components/admin/ImagePreviewModal.svelte';
	import VaStatRow from '$lib/components/admin/va/VaStatRow.svelte';
	import {
		closeSupportTicketCommand,
		createSupportTicketCommand,
		replySupportTicketCommand,
		closeSubResellerTicketCommand,
		createSubResellerTicketCommand,
		replySubResellerTicketCommand,
		toggleOwnClientTicketsCommand,
		closeClientTicketCommand,
		replyClientTicketCommand
	} from '../../../../../routes/reseller/page.remote';

	type AttachmentInput = {
		fileName: string;
		mimeType: string;
		dataBase64: string;
		sizeBytes: number;
	};

	type TicketAttachment = {
		id: number;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		dataUrl: string;
	};

	type TicketMessage = {
		id: number;
		senderType: 'reseller' | 'manager' | 'user' | 'client' | 'seller' | 'sub_reseller' | 'parent_reseller';
		message?: string;
		createdAt: number;
		attachments: TicketAttachment[];
	};

	type Ticket = {
		id: number;
		subResellerId?: number;
		subResellerUsername?: string;
		parentResellerId?: number;
		parentResellerUsername?: string;
		clientUuid?: string;
		clientEmail?: string;
		clientLabel?: string;
		subject: string;
		message?: string;
		status: 'open' | 'closed';
		createdAt: number;
		closedAt: number | null;
		messages: TicketMessage[];
	};

	type Props = {
		data: {
			isSubReseller?: boolean;
			canManageSubResellers?: boolean;
			tickets?: Ticket[];
			subResellerTickets?: Ticket[];
			clientTickets?: Ticket[];
			reseller?: { clientTicketsEnabled?: boolean };
		};
		resellerState: any;
	};

	let { data, resellerState }: Props = $props();

	// ── form state ───────────────────────────────────────────────────────────
	let subject = $state('');
	let message = $state('');
	let attachments = $state<AttachmentInput[]>([]);
	let attachmentNames = $state<string[]>([]);
	let attachmentPreviews = $state<string[]>([]);
	let attachmentInputKey = $state(0);
	let createModalOpen = $state(false);
	let previewImage = $state<{ src: string; alt: string } | null>(null);
	const replies = new SvelteMap<number, string>();
	const replyAttachments = new SvelteMap<number, AttachmentInput[]>();
	const replyAttachmentNames = new SvelteMap<number, string[]>();
	const replyAttachmentPreviews = new SvelteMap<number, string[]>();

	// ── view state ────────────────────────────────────────────────────────────
	let selectedTicketId = $state<number | null>(null);
	let closeConfirmId = $state<number | null>(null);
	let filter = $state<'all' | 'awaiting' | 'answered' | 'closed'>('all');
	let query = $state('');
	let ticketScope = $state<'support' | 'children' | 'clients'>('support');
	let scopeChosen = $state(false);
	let ticketPage = $state(1);
	const pageSize = 10;
	const isSubReseller = $derived(data.isSubReseller ?? false);
	const isChildScope = $derived(ticketScope === 'children' || (isSubReseller && ticketScope === 'support'));
	const isClientScope = $derived(ticketScope === 'clients');
	const supportTickets = $derived(data.tickets ?? []);
	const childTickets = $derived(data.subResellerTickets ?? []);
	const clientTickets = $derived(data.clientTickets ?? []);

	const tickets = $derived(isClientScope ? clientTickets : isChildScope ? childTickets : supportTickets);

	$effect(() => {
		if (scopeChosen) return;
		if (data.canManageSubResellers && childTickets.length > 0) {
			ticketScope = 'children';
		}
		scopeChosen = true;
	});

	/** Derive a richer status from the raw open/closed + last message sender */
	function effectiveStatus(ticket: Ticket): 'awaiting' | 'answered' | 'closed' {
		if (ticket.status === 'closed') return 'closed';
		const last = ticket.messages[ticket.messages.length - 1];
		if (!last || (isClientScope ? last.senderType === 'client' : isChildScope ? last.senderType === 'sub_reseller' : last.senderType === 'reseller')) return 'awaiting';
		return 'answered';
	}

	const counts = $derived({
		all: tickets.length,
		awaiting: tickets.filter((t) => effectiveStatus(t) === 'awaiting').length,
		answered: tickets.filter((t) => effectiveStatus(t) === 'answered').length,
		closed: tickets.filter((t) => effectiveStatus(t) === 'closed').length
	});

	const filtered = $derived(
		tickets.filter((t) => {
			const eff = effectiveStatus(t);
			if (filter !== 'all' && eff !== filter) return false;
			const q = query.trim().toLowerCase();
			if (q && !t.subject.toLowerCase().includes(q) && !String(t.id).includes(q) &&
				!t.subResellerUsername?.toLowerCase().includes(q) && !t.parentResellerUsername?.toLowerCase().includes(q) &&
				!t.clientEmail?.toLowerCase().includes(q) && !t.clientUuid?.toLowerCase().includes(q)) return false;
			return true;
		})
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const visibleTickets = $derived(filtered.slice((ticketPage - 1) * pageSize, ticketPage * pageSize));

	const selectedTicket = $derived(tickets.find((t) => t.id === selectedTicketId) ?? null);
	const clientAwaitingCount = $derived(clientTickets.filter((ticket) =>
		ticket.status === 'open' && ticket.messages[ticket.messages.length - 1]?.senderType === 'client'
	).length);

	const statItems = $derived([
		{
			label: 'کل تیکت‌ها',
			value: tickets.length.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'مورد',
			delta: 'از ابتدای ثبت‌نام',
			deltaTone: 'muted' as const
		},
		{
			label: isClientScope || (!isSubReseller && isChildScope) ? 'منتظر پاسخ شما' : isSubReseller ? 'منتظر پاسخ والد' : 'منتظر پاسخ مدیر',
			value: counts.awaiting.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'مورد',
			delta: counts.awaiting ? 'میانگین پاسخ ۲ ساعت' : 'همه پاسخ داده شدند',
			deltaTone: counts.awaiting ? ('warning' as const) : ('success' as const)
		},
		{
			label: 'پاسخ داده شده',
			value: counts.answered.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'مورد',
			delta: 'نیاز به بررسی شما',
			deltaTone: counts.answered ? ('success' as const) : ('muted' as const)
		},
		{
			label: 'بسته شده',
			value: counts.closed.toLocaleString('fa-IR-u-nu-latn'),
			unit: 'مورد',
			delta: 'تاریخچه پشتیبانی',
			deltaTone: 'muted' as const
		}
	]);

	// ── helpers ───────────────────────────────────────────────────────────────
	function readFileAsBase64(file: File) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
			reader.onerror = () => reject(new Error('خواندن فایل انجام نشد.'));
			reader.readAsDataURL(file);
		});
	}

	async function readAttachments(files: FileList | null) {
		const selected = Array.from(files ?? []);
		if (selected.length > 3) throw new Error('حداکثر ۳ تصویر می‌توانید پیوست کنید.');
		const payload: AttachmentInput[] = [];
		for (const file of selected) {
			if (!file.type.startsWith('image/')) throw new Error('فقط فایل تصویر قابل ارسال است.');
			if (file.size > 5 * 1024 * 1024) throw new Error('حجم هر تصویر باید حداکثر ۵ مگابایت باشد.');
			payload.push({
				fileName: file.name,
				mimeType: file.type,
				sizeBytes: file.size,
				dataBase64: await readFileAsBase64(file)
			});
		}
		return payload;
	}

	async function handleAttachmentChange(event: Event) {
		try {
			attachments = await readAttachments((event.currentTarget as HTMLInputElement).files);
			attachmentNames = attachments.map((a) => a.fileName);
			attachmentPreviews = attachments.map((a) => `data:${a.mimeType};base64,${a.dataBase64}`);
		} catch (error) {
			attachments = [];
			attachmentNames = [];
			attachmentPreviews = [];
			toast.error(error instanceof Error ? error.message : 'پیوست معتبر نیست.');
		}
	}

	function removeAttachment(index: number) {
		attachments = attachments.filter((_, i) => i !== index);
		attachmentNames = attachmentNames.filter((_, i) => i !== index);
		attachmentPreviews = attachmentPreviews.filter((_, i) => i !== index);
		if (attachments.length === 0) attachmentInputKey += 1;
	}

	function removeReplyAttachment(ticketId: number, index: number) {
		const current = replyAttachments.get(ticketId) ?? [];
		const currentNames = replyAttachmentNames.get(ticketId) ?? [];
		const currentPreviews = replyAttachmentPreviews.get(ticketId) ?? [];
		const next = current.filter((_, i) => i !== index);
		replyAttachments.set(ticketId, next);
		replyAttachmentNames.set(ticketId, currentNames.filter((_, i) => i !== index));
		replyAttachmentPreviews.set(ticketId, currentPreviews.filter((_, i) => i !== index));
	}

	async function handleReplyAttachmentChange(ticketId: number, event: Event) {
		try {
			const payload = await readAttachments((event.currentTarget as HTMLInputElement).files);
			replyAttachments.set(ticketId, payload);
			replyAttachmentNames.set(ticketId, payload.map((a) => a.fileName));
			replyAttachmentPreviews.set(ticketId, payload.map((a) => `data:${a.mimeType};base64,${a.dataBase64}`));
		} catch (error) {
			replyAttachments.delete(ticketId);
			replyAttachmentNames.delete(ticketId);
			replyAttachmentPreviews.delete(ticketId);
			toast.error(error instanceof Error ? error.message : 'پیوست معتبر نیست.');
		}
	}

	async function submitTicket() {
		try {
			const result = (await (isSubReseller
				? createSubResellerTicketCommand({ subject, message }).updates(resellerState)
				: createSupportTicketCommand({ subject, message, attachments }).updates(resellerState))) as Record<string, unknown> | null;
			if (result?.ticketSuccess) {
				toast.success(result.ticketSuccess as string);
				subject = '';
				message = '';
				attachments = [];
				attachmentNames = [];
				attachmentPreviews = [];
				attachmentInputKey += 1;
				createModalOpen = false;
				selectedTicketId = null;
			}
			if (result?.ticketError) toast.error(result.ticketError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ثبت تیکت انجام نشد.');
		}
	}

	async function submitReply(ticketId: number) {
		try {
			const result = (await (isClientScope
				? replyClientTicketCommand({
						ticketId,
						message: replies.get(ticketId) ?? '',
						attachments: replyAttachments.get(ticketId) ?? []
					}).updates(resellerState)
				: isChildScope
				? replySubResellerTicketCommand({
						ticketId,
						message: replies.get(ticketId) ?? '',
						attachments: replyAttachments.get(ticketId) ?? []
					}).updates(resellerState)
				: replySupportTicketCommand({
						ticketId,
						message: replies.get(ticketId) ?? '',
						attachments: replyAttachments.get(ticketId) ?? []
					}).updates(resellerState))) as Record<string, unknown> | null;
			if (result?.ticketSuccess) {
				toast.success(result.ticketSuccess as string);
				replies.set(ticketId, '');
				replyAttachments.delete(ticketId);
				replyAttachmentNames.delete(ticketId);
				replyAttachmentPreviews.delete(ticketId);
			}
			if (result?.ticketError) toast.error(result.ticketError as string);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'ارسال پاسخ انجام نشد.');
		}
	}

	async function closeTicket(ticketId: number) {
		const result = (await (isClientScope
			? closeClientTicketCommand({ ticketId }).updates(resellerState)
			: isChildScope
			? closeSubResellerTicketCommand({ ticketId }).updates(resellerState)
			: closeSupportTicketCommand({ ticketId }).updates(resellerState))) as
			| Record<string, unknown>
			| null;
		if (result?.ticketSuccess) toast.success(result.ticketSuccess as string);
		if (result?.ticketError) toast.error(result.ticketError as string);
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function formatDateShort(timestamp: number) {
		return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(
			new Date(timestamp * 1000)
		);
	}

	function formatAge(timestamp: number) {
		const diff = Math.max(0, Date.now() / 1000 - timestamp);
		if (diff < 3600) return `${Math.max(1, Math.round(diff / 60)).toLocaleString('fa-IR-u-nu-latn')} دقیقه پیش`;
		if (diff < 86400) return `${Math.round(diff / 3600).toLocaleString('fa-IR-u-nu-latn')} ساعت پیش`;
		if (diff < 86400 * 7) return `${Math.round(diff / 86400).toLocaleString('fa-IR-u-nu-latn')} روز پیش`;
		return formatDateShort(timestamp);
	}

	function formatBytes(bytes: number) {
		if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	function openAttachment(dataUrl: string, alt = 'پیوست') {
		previewImage = { src: dataUrl, alt };
	}

	function statusLabel(eff: 'awaiting' | 'answered' | 'closed'): string {
		if (eff === 'awaiting') return isClientScope || (!isSubReseller && isChildScope) ? 'منتظر پاسخ شما' : isSubReseller ? 'منتظر فروشنده والد' : 'منتظر مدیر';
		if (eff === 'answered') return 'پاسخ داده شد';
		return 'بسته شده';
	}

	function setScope(scope: 'support' | 'children' | 'clients') {
		ticketScope = scope;
		selectedTicketId = null;
		ticketPage = 1;
		filter = 'all';
		scopeChosen = true;
	}

	function isMyMessage(senderType: TicketMessage['senderType']) {
		if (isClientScope) return senderType === 'seller';
		if (isChildScope) return isSubReseller ? senderType === 'sub_reseller' : senderType === 'parent_reseller';
		return senderType === 'reseller';
	}

	function otherPartyLabel(ticket?: Ticket) {
		if (isClientScope && ticket) return clientIdentity(ticket);
		if (isChildScope) {
			if (isSubReseller) {
				return ticket?.parentResellerUsername
					? `${ticket.parentResellerUsername} (#${ticket.parentResellerId?.toLocaleString('fa-IR-u-nu-latn')})`
					: 'فروشنده والد';
			}
			return ticket?.subResellerUsername
				? `${ticket.subResellerUsername} (#${ticket.subResellerId?.toLocaleString('fa-IR-u-nu-latn')})`
				: 'زیرفروشنده';
		}
		return 'مدیر Skyline';
	}

	function clientIdentity(ticket: Ticket) {
		return ticket.clientEmail || ticket.clientLabel || ticket.clientUuid || 'مشتری';
	}

	async function toggleClientTickets() {
		const result = (await toggleOwnClientTicketsCommand({ enabled: !(data.reseller?.clientTicketsEnabled ?? false) }).updates(resellerState)) as unknown as Record<string, string> | null;
		if (result?.clientTicketsSuccess) toast.success(result.clientTicketsSuccess);
		if (result?.clientTicketsError) toast.error(result.clientTicketsError);
	}
</script>

<!-- ═══ LIST VIEW ═══════════════════════════════════════════════════════════ -->
{#if selectedTicket === null}
	<div class="tickets-va">
		<div class="tickets-header">
			<VaStatRow items={statItems} />
		</div>
		<div class="scope-tabs">
			<button class="va-chip" class:is-active={ticketScope === 'support'} onclick={() => setScope('support')}>
				{isSubReseller ? 'پشتیبانی والد' : 'پشتیبانی مدیر'}
				<span class="chip-count">{isSubReseller ? childTickets.length : supportTickets.length}</span>
			</button>
			{#if data.canManageSubResellers}
				<button class="va-chip" class:is-active={ticketScope === 'children'} onclick={() => setScope('children')}>
					زیرفروشندگان
					<span class="chip-count">{childTickets.length}</span>
				</button>
			{/if}
			<button type="button" class="va-chip client-inbox-launch" class:is-active={ticketScope === 'clients'} onclick={() => setScope('clients')}>
				<AnimatedIcon name="message" size={13} />
				<span>تیکت مشتریان</span>
				<span class="chip-count">{clientTickets.length}</span>
				{#if clientAwaitingCount > 0}<span class="client-awaiting">{clientAwaitingCount.toLocaleString('fa-IR-u-nu-latn')} جدید</span>{/if}
			</button>
		</div>

		{#if isClientScope}
			<div class="client-ticket-setting">
				<div>
					<strong>دریافت تیکت از مشتریان</strong>
					<span>مشتریان کانفیگ‌های شما فقط در حالت فعال می‌توانند تیکت ثبت کنند.</span>
				</div>
				<button
					type="button"
					class="admin-btn"
					class:admin-btn-primary={data.reseller?.clientTicketsEnabled}
					class:admin-btn-ghost={!data.reseller?.clientTicketsEnabled}
					onclick={toggleClientTickets}
				>
					{data.reseller?.clientTicketsEnabled ? 'فعال' : 'غیرفعال'}
				</button>
			</div>
		{/if}

		<!-- Toolbar -->
		<div class="va-toolbar tickets-toolbar">
			<button
				type="button"
				class="va-chip"
				class:is-active={filter === 'all'}
				onclick={() => (filter = 'all')}
			>
				همه <span class="chip-count">{counts.all}</span>
			</button>
			<button
				type="button"
				class="va-chip"
				class:is-active={filter === 'awaiting'}
				onclick={() => (filter = 'awaiting')}
			>
				{isClientScope || isChildScope && !isSubReseller ? 'منتظر شما' : isSubReseller ? 'منتظر والد' : 'منتظر مدیر'} <span class="chip-count">{counts.awaiting}</span>
			</button>
			{#if !isChildScope || isSubReseller}<button
				type="button"
				class="va-chip"
				class:is-active={filter === 'answered'}
				onclick={() => (filter = 'answered')}
			>
				پاسخ داده <span class="chip-count">{counts.answered}</span>
			</button>{/if}
			<button
				type="button"
				class="va-chip"
				class:is-active={filter === 'closed'}
				onclick={() => (filter = 'closed')}
			>
				بسته شده <span class="chip-count">{counts.closed}</span>
			</button>

			<span class="toolbar-spacer"></span>

			<label class="va-toolbar-search" aria-label="جستجو">
				<AnimatedIcon name="search" size={13} />
				<input
					bind:value={query}
					type="search"
					placeholder="جستجو در عنوان یا شماره تیکت…"
				/>
			</label>

			<button
				class:hidden={isClientScope || (!isSubReseller && ticketScope === 'children')}
				type="button"
				class="admin-btn admin-btn-primary new-ticket-btn"
				onclick={() => (createModalOpen = true)}
			>
				<AnimatedIcon name="ticket" size={13} />
				<span>تیکت جدید</span>
			</button>
		</div>

		<!-- Table -->
		<div class="va-card tickets-table-card">
			{#if filtered.length === 0}
				<div class="empty-tickets">
					{#if tickets.length === 0}
						<AnimatedIcon name="ticket" size={22} />
						<p>هنوز هیچ تیکتی ثبت نشده است.</p>
						{#if !isClientScope && (isSubReseller || ticketScope === 'support')}
							<button
								type="button"
								class="admin-btn admin-btn-primary"
								onclick={() => (createModalOpen = true)}
							>
								<AnimatedIcon name="ticket" size={13} />
								<span>اولین تیکت را باز کنید</span>
							</button>
						{/if}
					{:else}
						<AnimatedIcon name="search" size={22} />
						<p>تیکتی با این فیلتر پیدا نشد.</p>
					{/if}
				</div>
			{:else}
				<div class="ticket-table-header">
					<span class="col-id">#</span>
					<span class="col-subject">عنوان تیکت</span>
					<span class="col-status">وضعیت</span>
					<span class="col-msgs">پیام‌ها</span>
					<span class="col-date">تاریخ ایجاد</span>
					<span class="col-updated">آخرین به‌روزرسانی</span>
					<span class="col-action"></span>
				</div>
				{#each visibleTickets as ticket (ticket.id)}
					{@const eff = effectiveStatus(ticket)}
					{@const lastMsg = ticket.messages[ticket.messages.length - 1]}
					{@const isAwaiting = eff === 'awaiting'}
					<button
						type="button"
						class="ticket-row"
						class:is-awaiting={isAwaiting}
						onclick={() => (selectedTicketId = ticket.id)}
					>
						<span class="col-id ticket-id">#{ticket.id.toLocaleString('fa-IR-u-nu-latn')}</span>
						<span class="col-subject ticket-subject-cell">
							<span class="ticket-subject-line">
								{#if isAwaiting}<span class="awaiting-dot" aria-hidden="true"></span>{/if}
								<span class="ticket-subject-text">{ticket.subject}</span>
							</span>
							{#if isChildScope || isClientScope}
								<span class="ticket-counterpart">
									{isClientScope ? 'مشتری' : isSubReseller ? 'والد' : 'زیرفروشنده'}: {otherPartyLabel(ticket)}
									{#if isClientScope && ticket.clientUuid}<span dir="ltr">({ticket.clientUuid})</span>{/if}
								</span>
							{/if}
							{#if lastMsg}
								<span class="ticket-preview">
									{lastMsg.senderType === 'manager' || (isSubReseller && lastMsg.senderType === 'parent_reseller') ? `${isSubReseller ? 'والد' : 'مدیر'}: ` : lastMsg.senderType === 'sub_reseller' ? 'زیرفروشنده: ' : lastMsg.senderType === 'user' || lastMsg.senderType === 'client' ? 'مشتری: ' : 'شما: '}{lastMsg.message?.slice(0, 80)}…
								</span>
							{/if}
						</span>
						<span class="col-status">
							<span class="status-pill status-{eff}">{statusLabel(eff)}</span>
						</span>
						<span class="col-msgs ticket-msg-count">
							{ticket.messages.length.toLocaleString('fa-IR-u-nu-latn')}
						</span>
						<span class="col-date ticket-date">{formatDate(ticket.createdAt)}</span>
						<span class="col-updated ticket-age">
							{ticket.messages.length > 0
								? formatAge(ticket.messages[ticket.messages.length - 1].createdAt)
								: formatAge(ticket.createdAt)}
						</span>
						<span class="col-action ticket-chevron" aria-hidden="true">
							<AnimatedIcon name="chevron-left" size={12} />
						</span>
					</button>
				{/each}
				<div class="tickets-pagination">
					<span>{ticketPage} / {totalPages}</span>
					<div>
						<button type="button" class="va-icon-btn" disabled={ticketPage <= 1} onclick={() => ticketPage--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={12} /></span></button>
						<button type="button" class="va-icon-btn" disabled={ticketPage >= totalPages} onclick={() => ticketPage++}><AnimatedIcon name="chevron-left" size={12} /></button>
					</div>
				</div>
			{/if}
		</div>

		{#if filtered.length > 0}
			<div class="tickets-footer">
				<span>نمایش {filtered.length.toLocaleString('fa-IR-u-nu-latn')} از {tickets.length.toLocaleString('fa-IR-u-nu-latn')} تیکت</span>
			</div>
		{/if}
	</div>

<!-- ═══ DETAIL VIEW ══════════════════════════════════════════════════════════ -->
{:else}
	{@const t = selectedTicket}
	{@const eff = effectiveStatus(t)}
	{@const isClosed = t.status === 'closed'}

	<div class="tickets-va detail-va">
		<!-- Back + page actions -->
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
			{#if !isClosed}
				<button
					type="button"
					class="admin-btn admin-btn-danger-ghost"
					onclick={() => {
						closeConfirmId = t.id;
					}}
				>
					<AnimatedIcon name="check" size={13} />
					<span>بستن تیکت</span>
				</button>
			{/if}
		</div>

		<!-- Status banner -->
		<div class="va-card detail-banner status-border-{eff}">
			<div class="banner-item">
				<span class="va-section-label">وضعیت</span>
				<span class="status-pill status-{eff}">{statusLabel(eff)}</span>
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">ایجاد</span>
				<span class="banner-value">{formatDate(t.createdAt)}</span>
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">آخرین فعالیت</span>
				<span class="banner-value">
					{t.messages.length > 0
						? formatDate(t.messages[t.messages.length - 1].createdAt)
						: formatDate(t.createdAt)}
				</span>
			</div>
			<div class="banner-sep" aria-hidden="true"></div>
			<div class="banner-item">
				<span class="va-section-label">پیام‌ها</span>
				<span class="banner-value">{t.messages.length.toLocaleString('fa-IR-u-nu-latn')} پیام</span>
			</div>
		</div>

		<div class="detail-layout">
			<!-- Main conversation column -->
			<div class="detail-main">
				<!-- Thread -->
				<div class="va-card thread-card">
					<div class="va-section-label">گفتگو</div>
					{#if t.messages.length === 0}
						<div class="empty-thread">هنوز پیامی در این تیکت ثبت نشده است.</div>
					{:else}
						<div class="thread-messages">
							{#each t.messages as msg (msg.id)}
								{@const mine = isMyMessage(msg.senderType)}
								<div class="bubble-wrap" class:mine>
									<div class="bubble-avatar" class:mine>
										{mine ? 'م' : 'S'}
									</div>
									<div class="bubble-body" class:mine>
										<div class="bubble-meta">
											<span class="bubble-sender">{mine ? 'شما' : otherPartyLabel(t)}</span>
											<time class="bubble-time">{formatDate(msg.createdAt)}</time>
										</div>
										<div class="bubble" class:mine>
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

				<!-- Reply composer or closed notice -->
				{#if !isClosed}
					<div class="va-card reply-card">
						<div class="va-section-label">پاسخ شما</div>
						<textarea
							class="admin-field reply-textarea"
							rows="5"
							placeholder="پاسخ خود را بنویسید…"
							value={replies.get(t.id) ?? ''}
							oninput={(e) => replies.set(t.id, (e.currentTarget as HTMLTextAreaElement).value)}
						></textarea>
						<div class="reply-actions">
							{#if replyAttachmentPreviews.get(t.id)?.length}
								<div class="attach-preview-row">
									{#each replyAttachmentPreviews.get(t.id)! as url, i}
										<div class="attach-thumb-wrap">
											<img src={url} alt={replyAttachmentNames.get(t.id)?.[i] ?? 'پیوست'} class="attach-thumb" />
											<button type="button" class="attach-remove-btn" onclick={() => removeReplyAttachment(t.id, i)} aria-label="حذف">
												<svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
													<line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
													<line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
												</svg>
											</button>
										</div>
									{/each}
									{#if (replyAttachmentPreviews.get(t.id)?.length ?? 0) < 3}
										<label class="attach-add-btn" for={`reply-file-${t.id}`} title="افزودن تصویر">
											<AnimatedIcon name="cloud" size={13} />
											<input id={`reply-file-${t.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onchange={(e) => handleReplyAttachmentChange(t.id, e)} />
										</label>
									{/if}
								</div>
							{:else}
								<label class="mini-attach">
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp,image/gif"
										multiple
										onchange={(e) => handleReplyAttachmentChange(t.id, e)}
									/>
									<AnimatedIcon name="cloud" size={12} />
									<span>پیوست تصویر</span>
								</label>
							{/if}
							<span class="attach-hint">حداکثر ۳ فایل · هر کدام ۵MB</span>
							<div class="reply-submit-group">
								<button
									type="button"
									class="admin-btn admin-btn-ghost"
									onclick={() => {
										replies.set(t.id, '');
										replyAttachments.delete(t.id);
										replyAttachmentNames.delete(t.id);
										replyAttachmentPreviews.delete(t.id);
									}}
								>
									پاک کردن
								</button>
								<button
									type="button"
									class="admin-btn admin-btn-primary"
									disabled={!(replies.get(t.id) ?? '').trim() &&
										!(replyAttachments.get(t.id)?.length)}
									onclick={() => submitReply(t.id)}
								>
									<AnimatedIcon name="check" size={12} />
									<span>ارسال پاسخ</span>
								</button>
							</div>
						</div>
					</div>
				{:else}
					<div class="va-card closed-notice">
						<AnimatedIcon name="check" size={14} />
						<span>این تیکت بسته شده است. در صورت نیاز تیکت جدیدی باز کنید.</span>
						{#if !isClientScope}<button
							type="button"
							class="admin-btn admin-btn-ghost"
							onclick={() => {
								selectedTicketId = null;
								createModalOpen = true;
							}}
						>
							<AnimatedIcon name="ticket" size={12} />
							<span>تیکت جدید</span>
						</button>{/if}
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
							<span class="info-key">وضعیت</span>
							<span class="status-pill status-{eff}">{statusLabel(eff)}</span>
						</div>
						<div class="info-row">
							<span class="info-key">تاریخ ایجاد</span>
							<span class="info-val mono">{formatDate(t.createdAt)}</span>
						</div>
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
							<div class="p-avatar mine">م</div>
							<div class="p-info">
								<span class="p-name">شما <span class="p-role">({isSubReseller ? 'زیرفروشنده' : 'فروشنده'})</span></span>
								<span class="p-sub">{isClientScope || (!isSubReseller && isChildScope) ? 'پاسخ‌گو' : 'ارسال‌کننده تیکت'}</span>
							</div>
						</div>
						<div class="participant">
							<div class="p-avatar support">S</div>
							<div class="p-info">
								<span class="p-name">{otherPartyLabel(t)}</span>
								<span class="p-sub">{isClientScope || (!isSubReseller && isChildScope) ? 'ارسال‌کننده تیکت' : 'پاسخ‌گو'}</span>
							</div>
						</div>
					</div>
				</div>

				{#if t.messages.some((m) => m.attachments.length > 0)}
					<div class="va-card sidebar-card">
						<div class="va-section-label">پیوست‌های گفتگو</div>
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
												{formatBytes(att.sizeBytes)} · {isMyMessage(msg.senderType) ? 'شما' : otherPartyLabel(t)}
											</span>
										</div>
									</button>
								{/each}
							{/each}
						</div>
					</div>
				{/if}

				{#if !isClosed}
					<div class="va-card sidebar-card security-notice">
						<div class="security-icon">
							<AnimatedIcon name="shield" size={13} />
						</div>
						<div>
							<div class="security-title">اطلاعات حساس را ارسال نکنید</div>
							<p class="security-body">
								گذرواژه، شماره کارت کامل یا اطلاعات شخصی مشتری را در تیکت قرار ندهید. مدیر هیچ‌گاه این اطلاعات را از شما نمی‌خواهد.
							</p>
						</div>
					</div>
				{/if}
			</aside>
		</div>
	</div>
{/if}

<!-- ═══ CREATE MODAL ═════════════════════════════════════════════════════════ -->
<Modal open={createModalOpen} title="تیکت جدید" eyebrow="گفتگوی پشتیبانی" onClose={() => (createModalOpen = false)}>
	<div class="ticket-composer">
		<label class="ticket-field">
			<span>عنوان</span>
			<input bind:value={subject} type="text" class="admin-field" placeholder="مثلاً مشکل شارژ حساب" maxlength="120" />
		</label>
		<label class="ticket-field">
			<span>متن پیام</span>
			<textarea bind:value={message} class="admin-field" rows="7" placeholder="توضیح کامل را بنویسید..."></textarea>
		</label>
		{#if !isChildScope && attachmentPreviews.length}
			<div class="attach-preview-row">
				{#each attachmentPreviews as url, i}
					<div class="attach-thumb-wrap">
						<img src={url} alt={attachmentNames[i] ?? 'پیوست'} class="attach-thumb" />
						<button type="button" class="attach-remove-btn" onclick={() => removeAttachment(i)} aria-label="حذف">
							<svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
								<line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
								<line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
							</svg>
						</button>
					</div>
				{/each}
				{#if attachmentPreviews.length < 3}
					<label class="attach-add-btn" for="modal-attach-more" title="افزودن تصویر">
						<AnimatedIcon name="cloud" size={13} />
						{#key attachmentInputKey}
							<input id="modal-attach-more" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onchange={handleAttachmentChange} />
						{/key}
					</label>
				{/if}
			</div>
		{:else if !isChildScope}
			<label class="attachment-drop">
				{#key attachmentInputKey}
					<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onchange={handleAttachmentChange} />
				{/key}
				<AnimatedIcon name="cloud" size={13} />
				<span>پیوست تصویر، حداکثر ۳ فایل و هرکدام ۵MB</span>
			</label>
		{/if}
		<button
			type="button"
			class="admin-btn admin-btn-primary full-width"
			disabled={(!message.trim() && attachments.length === 0) || createSupportTicketCommand.pending > 0}
			onclick={submitTicket}
		>
			<AnimatedIcon name="message" size={13} />
			<span>{createSupportTicketCommand.pending > 0 ? 'در حال ارسال...' : 'ارسال تیکت'}</span>
		</button>
	</div>
</Modal>

<ConfirmDialog
	open={closeConfirmId !== null}
	title="بستن تیکت"
	description="آیا مطمئن هستید؟ پس از بستن، تیکت به حالت «بسته» تغییر می‌کند."
	confirmLabel="بله، ببند"
	intent="warning"
	onConfirm={async () => {
		const id = closeConfirmId;
		closeConfirmId = null;
		if (id !== null) await closeTicket(id);
	}}
	onClose={() => (closeConfirmId = null)}
/>

<ImagePreviewModal open={previewImage !== null} src={previewImage?.src ?? null} alt={previewImage?.alt} onClose={() => (previewImage = null)} />

<style>
	/* ── Layout ────────────────────────────────────────────────────────────── */
	.tickets-va {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.scope-tabs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.scope-tabs .va-chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}

	.new-ticket-btn.hidden {
		display: none;
	}

	.client-inbox-launch {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-inline-start: auto;
	}

	.client-awaiting {
		padding: 2px 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--va-warning) 14%, transparent);
		color: var(--va-warning);
		font: 500 10.5px var(--va-font-mono);
	}

	.client-ticket-setting {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 14px;
		border: 1px solid var(--va-border);
		border-radius: 8px;
		background: var(--va-bg-panel);
	}

	.client-ticket-setting div {
		display: grid;
		gap: 3px;
	}

	.client-ticket-setting strong {
		color: var(--va-text);
		font-size: 12.5px;
	}

	.client-ticket-setting span {
		color: var(--va-text-muted);
		font-size: 11.5px;
	}

	.tickets-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-top: 1px solid var(--va-border);
		color: var(--va-text-muted);
		font: 500 12px var(--va-font-mono);
	}

	.tickets-pagination div {
		display: flex;
		gap: 6px;
	}

	.detail-va {
		gap: 14px;
	}

	/* ── Toolbar ───────────────────────────────────────────────────────────── */
	.tickets-toolbar {
		flex-wrap: wrap;
	}

	.chip-count {
		margin-inline-start: 4px;
		padding-inline: 5px;
		border-radius: 999px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		font-family: var(--va-font-mono);
	}

	.toolbar-spacer {
		flex: 1;
	}

	.new-ticket-btn {
		white-space: nowrap;
	}

	/* ── Table ─────────────────────────────────────────────────────────────── */
	.tickets-table-card {
		padding: 0;
		overflow: hidden;
	}

	.ticket-table-header,
	.ticket-row {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) 130px 80px 160px 140px 36px;
		align-items: center;
	}

	.ticket-table-header {
		padding: 0;
		background: var(--va-bg-raised);
		border-bottom: 1px solid var(--va-border);
	}

	.ticket-table-header span {
		padding: 9px 14px;
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
		padding: 14px;
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.ticket-subject-cell {
		padding: 12px 14px 12px 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ticket-subject-line {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.awaiting-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--va-warning);
		flex-shrink: 0;
	}

	.ticket-subject-text {
		font-size: 13.5px;
		color: var(--va-text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.is-awaiting .ticket-subject-text {
		font-weight: 600;
	}

	.ticket-preview {
		font-size: 11.5px;
		color: var(--va-text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 480px;
	}

	.ticket-counterpart {
		color: var(--va-accent);
		font: 500 11px var(--va-font-mono);
	}

	.ticket-msg-count {
		padding: 14px;
		font: 500 12px var(--va-font-mono);
		color: var(--va-text);
	}

	.ticket-date {
		padding: 14px;
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text-muted);
	}

	.ticket-age {
		padding: 14px;
		font-size: 12px;
		color: var(--va-text);
	}

	.ticket-chevron {
		padding: 14px;
		display: flex;
		justify-content: center;
		color: var(--va-text-faint);
	}

	/* ── Status pill ───────────────────────────────────────────────────────── */
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

	.status-awaiting {
		background: color-mix(in srgb, var(--va-warning) 12%, transparent);
		color: var(--va-warning);
	}

	.status-awaiting::before {
		background: var(--va-warning);
	}

	.status-answered {
		background: color-mix(in srgb, var(--va-success) 12%, transparent);
		color: var(--va-success);
	}

	.status-answered::before {
		background: var(--va-success);
	}

	.status-closed {
		background: color-mix(in srgb, var(--va-text-faint) 10%, transparent);
		color: var(--va-text-faint);
	}

	.status-closed::before {
		background: var(--va-text-faint);
	}

	/* ── Empty states ──────────────────────────────────────────────────────── */
	.empty-tickets {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 48px 24px;
		color: var(--va-text-muted);
		font-size: 13px;
	}

	.empty-tickets p {
		margin: 0;
	}

	/* ── Footer ────────────────────────────────────────────────────────────── */
	.tickets-footer {
		font: 500 11.5px var(--va-font-mono);
		color: var(--va-text-faint);
		padding-inline: 4px;
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

	/* danger ghost (close ticket) */
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

	/* ── Banner ────────────────────────────────────────────────────────────── */
	.detail-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0;
		padding: 12px 16px;
		border-inline-start-width: 3px;
		border-inline-start-style: solid;
	}

	.status-border-awaiting {
		border-inline-start-color: var(--va-warning);
	}

	.status-border-answered {
		border-inline-start-color: var(--va-success);
	}

	.status-border-closed {
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
		font: 500 12.5px var(--va-font-mono);
		color: var(--va-text);
	}

	/* ── Detail layout ─────────────────────────────────────────────────────── */
	.detail-layout {
		display: grid;
		grid-template-columns: 1fr 272px;
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
		background: color-mix(in srgb, var(--va-success) 14%, var(--va-bg-raised));
		border: 1px solid color-mix(in srgb, var(--va-success) 30%, var(--va-border));
		color: var(--va-success);
		display: grid;
		place-items: center;
		font: 600 11px var(--va-font-mono);
		flex-shrink: 0;
	}

	.bubble-avatar.mine {
		background: color-mix(in srgb, var(--va-accent) 14%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-accent) 30%, var(--va-border));
		color: var(--va-accent);
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
		background: var(--va-bg-panel);
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
		grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
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
		height: auto;
		max-height: 160px;
		object-fit: contain;
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

	.mini-attach {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: 1px dashed var(--va-border-strong);
		border-radius: 6px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		font-size: 12px;
		transition: border-color 140ms ease, color 140ms ease;
	}

	.mini-attach:hover {
		border-color: color-mix(in srgb, var(--va-accent) 40%, var(--va-border-strong));
		color: var(--va-text);
	}

	.mini-attach input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.attach-preview-row {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 8px;
	}

	.attach-thumb-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.attach-thumb {
		display: block;
		width: 72px;
		height: 72px;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid var(--va-border);
		background: var(--va-bg-raised);
	}

	.attach-remove-btn {
		position: absolute;
		top: -6px;
		left: -6px;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		border: 1px solid var(--va-border-strong);
		background: var(--va-bg-panel);
		color: var(--va-text-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: background-color 0.14s ease, color 0.14s ease;
	}

	.attach-remove-btn:hover {
		background: color-mix(in srgb, var(--va-danger) 16%, var(--va-bg-panel));
		color: var(--va-danger);
		border-color: var(--va-danger);
	}

	.attach-add-btn {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border: 1.5px dashed var(--va-border-strong);
		border-radius: 10px;
		background: var(--va-bg-raised);
		color: var(--va-text-faint);
		cursor: pointer;
		transition: border-color 140ms ease, color 140ms ease;
	}

	.attach-add-btn:hover {
		border-color: var(--va-accent);
		color: var(--va-accent);
	}

	.attach-add-btn input {
		display: none;
	}

	.attach-hint {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.reply-submit-group {
		display: flex;
		gap: 6px;
		margin-inline-start: auto;
	}

	/* ── Closed notice ─────────────────────────────────────────────────────── */
	.closed-notice {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		color: var(--va-text-muted);
		font-size: 12.5px;
		background: var(--va-bg-raised);
	}

	.closed-notice span {
		flex: 1;
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

	.p-avatar.mine {
		background: color-mix(in srgb, var(--va-accent) 12%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-accent) 22%, var(--va-border));
		color: var(--va-accent);
	}

	.p-avatar.support {
		background: color-mix(in srgb, var(--va-success) 12%, var(--va-bg-raised));
		border-color: color-mix(in srgb, var(--va-success) 22%, var(--va-border));
		color: var(--va-success);
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

	.p-role {
		font-size: 11px;
		color: var(--va-text-faint);
	}

	.p-sub {
		font: 500 10.5px var(--va-font-mono);
		color: var(--va-text-faint);
	}

	.all-attachments {
		display: flex;
		flex-direction: column;
		gap: 4px;
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
		width: 28px;
		height: 28px;
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

	/* ── Security notice ───────────────────────────────────────────────────── */
	.security-notice {
		flex-direction: row;
		align-items: flex-start;
		gap: 10px;
		background: color-mix(in srgb, var(--va-warning) 6%, var(--va-bg-panel));
		border-color: color-mix(in srgb, var(--va-warning) 22%, var(--va-border));
	}

	.security-icon {
		color: var(--va-warning);
		margin-top: 2px;
		flex-shrink: 0;
	}

	.security-title {
		font-size: 12px;
		color: var(--va-text);
		font-weight: 500;
		margin-bottom: 4px;
	}

	.security-body {
		margin: 0;
		font-size: 11.5px;
		color: var(--va-text-muted);
		line-height: 1.7;
	}

	/* ── Modal composer ────────────────────────────────────────────────────── */
	.ticket-composer {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.ticket-field {
		display: flex;
		flex-direction: column;
		gap: 7px;
		color: var(--va-text);
		font-size: 12px;
		font-weight: 650;
	}

	.ticket-field textarea {
		min-height: 150px;
		resize: vertical;
	}

	.attachment-drop {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border: 1px dashed var(--va-border-strong);
		border-radius: 8px;
		background: var(--va-bg-raised);
		color: var(--va-text-muted);
		cursor: pointer;
		font-size: 12px;
		transition: border-color 160ms ease, color 160ms ease;
	}

	.attachment-drop:hover {
		border-color: color-mix(in srgb, var(--va-accent) 45%, var(--va-border-strong));
		color: var(--va-text);
	}

	.attachment-drop input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.full-width {
		width: 100%;
		justify-content: center;
	}

	/* ── Responsive ────────────────────────────────────────────────────────── */
	@media (max-width: 900px) {
		.client-inbox-launch {
			margin-inline-start: 0;
		}

		.client-ticket-setting {
			align-items: flex-start;
			flex-direction: column;
		}

		.ticket-table-header,
		.ticket-row {
			grid-template-columns: 44px minmax(0, 1fr) 110px 60px 44px;
		}

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
	}
</style>
