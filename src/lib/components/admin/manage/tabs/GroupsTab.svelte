<script lang="ts">
	import { toast } from 'svelte-sonner';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';
	import ConfirmDialog from '$lib/components/admin/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import InspectorPortal from '$lib/components/admin/InspectorPortal.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import {
		createGroup,
		editGroup,
		removeGroup,
		setResellerGroup
	} from '../../../../../routes/manage/page.remote';

	type Group = {
		id: number;
		name: string;
		color: string;
		badgeIcon: string;
		description: string;
	};
	type Reseller = {
		id: number;
		username: string;
		parentResellerId: number | null;
		groupId: number | null;
		groupName: string | null;
		isSystemManager: boolean;
	};
	type PlanAccessEntry = {
		planId: number;
		resellerId: number | null;
		groupId: number | null;
	};
	type Props = {
		data: {
			resellerGroups: Group[];
			resellerAccounts: Reseller[];
			planAccessEntries: PlanAccessEntry[];
		};
	};

	let { data }: Props = $props();
	let selectedId = $state<number | null>(null);
	let createOpen = $state(false);
	let deleteTarget = $state<Group | null>(null);
	let page = $state(1);
	const pageSize = 10;
	const selected = $derived(
		selectedId !== null ? data.resellerGroups.find((group) => group.id === selectedId) ?? null : data.resellerGroups[0] ?? null
	);
	const pages = $derived(Math.max(1, Math.ceil(data.resellerGroups.length / pageSize)));
	const visibleGroups = $derived(data.resellerGroups.slice((page - 1) * pageSize, page * pageSize));
	const assignableResellers = $derived(data.resellerAccounts.filter((account) => account.parentResellerId === null && !account.isSystemManager));

	function members(groupId: number) {
		return assignableResellers.filter((account) => account.groupId === groupId);
	}

	function privatePlanCount(groupId: number) {
		return data.planAccessEntries.filter((e) => e.groupId === groupId).length;
	}

	async function assign(resellerId: number, groupId: number | null) {
		const result = await setResellerGroup({ resellerId, groupId });
		if (result?.groupSuccess) toast.success(result.groupSuccess);
		if (result?.groupError) toast.error(result.groupError);
	}
</script>

<InspectorPortal content={groupsInspector} />

<section class="va-card groups-panel">
	<div class="panel-head">
		<div>
			<div class="panel-title">گروه‌های فروشندگان</div>
			<div class="panel-sub">رده‌های تجاری برای ارائه بسته‌های شارژ اختصاصی به فروشندگان مستقیم.</div>
		</div>
		<button type="button" class="admin-btn admin-btn-primary" onclick={() => (createOpen = true)}>
			<AnimatedIcon name="plus-network" size={13} />
			<span>گروه جدید</span>
		</button>
	</div>

	{#if data.resellerGroups.length === 0}
		<EmptyState title="گروهی ثبت نشده" description="یک گروه بسازید و بسته‌های خصوصی را به آن اختصاص دهید." icon="inbox" />
	{:else}
		<div class="va-table-wrap">
			<table class="va-table">
				<thead>
					<tr><th>گروه</th><th>توضیح</th><th>فروشندگان</th><th>پلن خصوصی</th></tr>
				</thead>
				<tbody>
					{#each visibleGroups as group (group.id)}
						<tr class:is-selected={selected?.id === group.id} onclick={() => (selectedId = group.id)}>
							<td>
								<span class="group-chip" style={`--group-color: ${group.color}`}>
									<span class="group-dot-sm"></span>{group.name}
								</span>
							</td>
							<td class="description">{group.description || 'بدون توضیح'}</td>
							<td class="va-mono">{members(group.id).length.toLocaleString('fa-IR-u-nu-latn')}</td>
							<td class="va-mono">{privatePlanCount(group.id).toLocaleString('fa-IR-u-nu-latn')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="va-pagination">
			<span>{page} / {pages}</span>
			<div>
				<button type="button" class="va-icon-btn" disabled={page <= 1} onclick={() => page--}><span class="pagination-prev-icon"><AnimatedIcon name="chevron-left" size={13} /></span></button>
				<button type="button" class="va-icon-btn" disabled={page >= pages} onclick={() => page++}><AnimatedIcon name="chevron-left" size={13} /></button>
			</div>
		</div>
	{/if}
</section>

{#snippet groupsInspector()}
	<aside class="va-inspector">
		<div class="va-inspector-head">
			<AnimatedIcon name="store" size={20} active />
			<div>
				<p class="va-inspector-title">{selected?.name ?? 'جزئیات گروه'}</p>
				<p class="va-inspector-sub">عضویت و مشخصات رده تجاری</p>
			</div>
		</div>
		<div class="va-inspector-body">
			{#if selected}
				{@const updateForm = editGroup.for(selected.id)}
				<form {...updateForm.enhance(async ({ submit }) => {
					await submit();
					if (updateForm.result?.groupSuccess) toast.success(updateForm.result.groupSuccess);
					if (updateForm.result?.groupError) toast.error(updateForm.result.groupError);
				})} class="panel-form">
					<input type="hidden" name="id" value={selected.id} />
					<div class="va-section-label">مشخصات گروه</div>
					<label>نام<input class="admin-field" name="name" value={selected.name} maxlength="64" required /></label>
					<div class="two-fields">
						<label>رنگ<input class="admin-field color-field" type="color" name="color" value={selected.color} /></label>
						<label>آیکن<input class="admin-field" name="badgeIcon" value={selected.badgeIcon} maxlength="64" /></label>
					</div>
					<label>توضیح<textarea class="admin-field" name="description" rows="2" maxlength="256">{selected.description}</textarea></label>
					<button type="submit" class="admin-btn admin-btn-ghost full">ذخیره تغییرات</button>
				</form>

				<div class="member-block">
					<div class="va-section-label">فروشندگان مستقیم</div>
					{#if assignableResellers.length === 0}
						<p class="hint">فروشنده مستقیمی برای تخصیص وجود ندارد.</p>
					{:else}
						{#each assignableResellers as reseller (reseller.id)}
							<div class="member-row">
								<span>{reseller.username}</span>
								<button
									type="button"
									class="admin-btn admin-btn-ghost"
									class:is-member={reseller.groupId === selected.id}
									onclick={() => assign(reseller.id, reseller.groupId === selected.id ? null : selected.id)}
								>
									{reseller.groupId === selected.id ? 'حذف' : reseller.groupId ? 'انتقال' : 'افزودن'}
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<button type="button" class="admin-btn danger full" onclick={() => (deleteTarget = selected)}>حذف گروه</button>
			{:else}
				<EmptyState title="گروهی انتخاب نشده" description="برای مشاهده اعضا یک گروه را انتخاب کنید." icon="inbox" />
			{/if}
		</div>
	</aside>
{/snippet}

<Modal open={createOpen} title="گروه جدید" eyebrow="رده تجاری فروشندگان" onClose={() => (createOpen = false)}>
	<form {...createGroup.enhance(async ({ submit }) => {
		await submit();
		if (createGroup.result?.groupSuccess) {
			toast.success(createGroup.result.groupSuccess);
			createOpen = false;
		}
		if (createGroup.result?.groupError) toast.error(createGroup.result.groupError);
	})} class="panel-form">
		<label>نام<input class="admin-field" name="name" maxlength="64" required placeholder="مثلاً عمده‌فروش" /></label>
		<div class="two-fields">
			<label>رنگ<input class="admin-field color-field" type="color" name="color" value="#18a27b" /></label>
			<label>آیکن<input class="admin-field" name="badgeIcon" value="tag-outline" maxlength="64" /></label>
		</div>
		<label>توضیح<textarea class="admin-field" name="description" rows="3" maxlength="256"></textarea></label>
		<button type="submit" class="admin-btn admin-btn-primary full">ساخت گروه</button>
	</form>
</Modal>

<ConfirmDialog
	open={deleteTarget !== null}
	title="حذف گروه فروشنده"
	description="اعضای این گروه بدون گروه خواهند شد و دسترسی بسته‌های اختصاص‌یافته به گروه حذف می‌شود. درخواست‌های ثبت‌شده تغییری نمی‌کنند."
	confirmLabel="حذف گروه"
	intent="danger"
	onClose={() => (deleteTarget = null)}
	onConfirm={async () => {
		if (!deleteTarget) return;
		const result = await removeGroup({ id: deleteTarget.id });
		if (result?.groupSuccess) toast.success(result.groupSuccess);
		if (result?.groupError) toast.error(result.groupError);
		deleteTarget = null;
	}}
/>

<style>
	.groups-panel { overflow: hidden; padding: 0; }
	.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--va-border); }
	.panel-title { color: var(--va-text); font-size: 14px; font-weight: 700; }
	.panel-sub, .description, .hint { color: var(--va-text-faint); font-size: 11px; }
	tr { cursor: pointer; }
	.group-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid color-mix(in srgb, var(--group-color) 36%, var(--va-border)); border-radius: 5px; padding: 3px 8px; background: color-mix(in srgb, var(--group-color) 11%, transparent); color: var(--group-color); }
	.group-dot-sm { width: 8px; height: 8px; border-radius: 50%; background: var(--group-color); flex-shrink: 0; }
	.va-pagination { display: flex; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--va-border); }
	.va-pagination div { display: flex; gap: 6px; }
	.panel-form { display: grid; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--va-border); }
	.panel-form label { display: grid; gap: 5px; color: var(--va-text-muted); font-size: 11.5px; }
	.panel-form textarea { resize: vertical; }
	.two-fields { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px; }
	.color-field { min-height: 38px; padding: 4px; }
	.member-block { display: grid; gap: 7px; margin: 14px 0; }
	.member-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--va-border); color: var(--va-text); font-size: 12px; }
	.member-row .admin-btn { padding: 4px 9px; font-size: 11px; }
	.member-row .is-member { color: var(--va-danger); }
	.full { width: 100%; justify-content: center; }
	.danger { border: 1px solid color-mix(in srgb, var(--va-danger) 30%, var(--va-border)); color: var(--va-danger); background: transparent; }
</style>
