// The manage panel depends entirely on live server state (via query() SSE).
// SSR would always render <LoadingState /> anyway, and the inline query run
// during SSR can cause a 502 (Node.js crash) on hard refresh.
// Disable SSR so the shell is always client-rendered.
export const ssr = false;
