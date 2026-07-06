'use client';

import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStatus } from '@/lib/queries';
import { LoginScreen } from './login-screen';
import { SetupScreen } from './setup-screen';

/**
 * decides which surface the app shows based on the public auth-status probe:
 * a first-run setup screen, the login form, or the actual app. must render
 * inside the QueryClient (it uses TanStack Query).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: status, isLoading } = useAuthStatus();

  if (isLoading || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (status.needsSetup) return <SetupScreen />;
  if (!status.authenticated) return <LoginScreen />;

  return <>{children}</>;
}
