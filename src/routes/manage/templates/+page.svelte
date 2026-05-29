<script lang="ts">
	import { getContext } from 'svelte';
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import AnimatedIcon from '$lib/components/admin/AnimatedIcon.svelte';

	const manageState = getContext('manageState') as ReturnType<
		typeof import('../page.remote').getManageState
	>;
</script>

{#if manageState.current?.authenticated}
	<div class="templates-placeholder">
		<EmptyState
			title="قالب‌های پیام"
			description="این بخش به زودی اضافه می‌شود. قالب‌های از پیش تعریف‌شده برای پیام‌های اتوماتیک پنل اینجا مدیریت خواهند شد."
			icon="inbox"
		/>
	</div>
{/if}
