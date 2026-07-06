'use client';

import { useState } from 'react';
import { KeyRound, LogOut, Settings, User } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAuthStatus, useLogout } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingsDialog } from './settings-dialog';

export function UserMenu() {
  const { data: status } = useAuthStatus();
  const logout = useLogout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('account');

  const username = status?.user?.username ?? 'Account';

  function openSettings(tab: string) {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch (err) {
      toast.error('Could not log out', {
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Account"
          >
            <User className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openSettings('account')}
            className="gap-2"
          >
            <Settings className="h-4 w-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => openSettings('account')}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4" /> Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={logout.isPending}
            className="text-destructive focus:text-destructive gap-2"
          >
            <LogOut className="h-4 w-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDialog
        key={settingsTab}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
      />
    </>
  );
}
