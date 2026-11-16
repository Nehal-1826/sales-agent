import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Admin + client read-heavy pages do not change second-to-second.
      // 5-min stale + 30-min gc means navigating between pages serves from
      // cache instead of re-spinning every list endpoint on every mount.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: (failureCount, error: unknown) => {
        // Don't retry 401/403 — auth interceptor handles refresh elsewhere.
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error.status === 401 || error.status === 403)
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
