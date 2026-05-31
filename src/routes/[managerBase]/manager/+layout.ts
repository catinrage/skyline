// See manage/+layout.ts — same reason: admin panel depends on live SSE state,
// SSR causes 502 on hard refresh.
export const ssr = false;
