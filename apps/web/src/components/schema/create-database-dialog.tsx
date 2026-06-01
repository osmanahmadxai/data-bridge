'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDatabaseDialog({
  connectionId,
  open,
  onOpenChange,
}: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createDatabase(connectionId, name.trim());
      await qc.invalidateQueries({
        queryKey: ['connections', connectionId, 'databases'],
      });
      toast.success(`Created database ${name.trim()}`);
      setName('');
      onOpenChange(false);
    } catch (err) {
      toast.error('Create failed', {
        description: err instanceof ApiError ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New database</DialogTitle>
          <DialogDescription>
            Create a new database on this server.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="db-name">Name</Label>
          <Input
            id="db-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="analytics"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
