'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useLogin } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginScreen() {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    // the Enter-key handler bypasses the button's disabled state
    if (login.isPending) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setError(null);
    try {
      await login.mutateAsync({ username: username.trim(), password });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong';
      setError(message);
      toast.error('Could not sign in', { description: message });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/logo-dark.png"
            alt="Data Bridge"
            width={747}
            height={412}
            priority
            className="mb-2 h-8 w-auto dark:hidden"
          />
          <Image
            src="/logo-white.png"
            alt="Data Bridge"
            width={747}
            height={412}
            priority
            className="mb-2 hidden h-8 w-auto dark:block"
          />
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your credentials to access Data Bridge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
