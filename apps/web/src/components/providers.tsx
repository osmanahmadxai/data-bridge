'use client';

import { useState, type ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/components/confirm';
import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queries';

/** the session expired or the cookie is gone — bounce back to the login screen */
function isSessionExpiry(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    // on any 401 (except the status probe itself), refetch auth status so the
    // AuthGate drops back to the login screen. refetching — not clearing — the
    // key keeps this idempotent and avoids an invalidate → refetch → 401 loop.
    const onError = (err: unknown, key?: readonly unknown[]) => {
      if (!isSessionExpiry(err)) return;
      if (key && key[0] === queryKeys.authStatus[0]) return;
      void qc.invalidateQueries({ queryKey: queryKeys.authStatus });
    };

    const qc: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (err, query) => onError(err, query.queryKey),
      }),
      mutationCache: new MutationCache({
        onError: (err) => onError(err),
      }),
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
          staleTime: 10_000,
        },
      },
    });
    return qc;
  });

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={300}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
