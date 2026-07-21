'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectionInputDTO, DatabaseEngine } from '@syncle/core';
import { api, ApiError } from '@/lib/api';
import {
  useCreateConnection,
  useDrivers,
  useUpdateConnection,
} from '@/lib/queries';
import { useStudio } from '@/lib/store';
import { engineMeta } from '@/lib/engines';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormState = Record<string, string> & { name?: string; ssl?: string };

export function ConnectionDialog() {
  const { dialog, closeConnectionDialog } = useStudio();
  const { data: drivers } = useDrivers();
  const create = useCreateConnection();
  const update = useUpdateConnection();

  const [engine, setEngine] = useState<DatabaseEngine>('postgres');
  const [form, setForm] = useState<FormState>({ name: '' });
  const [ssl, setSsl] = useState(false);
  const [testing, setTesting] = useState(false);

  const editing = dialog.editingId;

  // load existing connection when editing
  useEffect(() => {
    if (!dialog.open) return;
    // always start from a clean slate so a failed load can't leave the
    // previous connection's values behind
    setForm({ name: '' });
    setEngine('postgres');
    setSsl(false);
    if (!editing) return;
    void api.getConnection(editing).then(
      (c) => {
        setEngine(c.engine);
        setSsl(!!c.ssl);
        setForm({
          name: c.name,
          host: c.host ?? '',
          port: c.port != null ? String(c.port) : '',
          user: c.user ?? '',
          password: c.password ?? '',
          database: c.database ?? '',
          connectionString: c.connectionString ?? '',
        });
      },
      (err) => {
        // don't silently show new-connection defaults for an edit
        toast.error('Could not load connection', {
          description: err instanceof ApiError ? err.message : String(err),
        });
        closeConnectionDialog();
      },
    );
  }, [dialog.open, editing, closeConnectionDialog]);

  const driver = useMemo(
    () => drivers?.find((d) => d.engine === engine),
    [drivers, engine],
  );

  function buildPayload(): ConnectionInputDTO {
    const payload: ConnectionInputDTO = {
      name: form.name?.trim() || engineMeta(engine).label,
      engine,
      ssl,
    };
    for (const field of driver?.fields ?? []) {
      const raw = form[field.key]?.trim();
      if (!raw) continue;
      if (field.key === 'port') payload.port = Number(raw);
      else (payload as Record<string, unknown>)[field.key] = raw;
    }
    return payload;
  }

  async function handleTest() {
    setTesting(true);
    try {
      await api.testConnection(buildPayload());
      toast.success('Connection successful');
    } catch (err) {
      toast.error('Connection failed', {
        description: err instanceof ApiError ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const payload = buildPayload();
    try {
      if (editing) {
        await update.mutateAsync({ id: editing, input: payload });
        toast.success('Connection updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Connection created');
      }
      closeConnectionDialog();
    } catch (err) {
      toast.error('Could not save', {
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(o) => !o && closeConnectionDialog()}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit connection' : 'New connection'}
          </DialogTitle>
          <DialogDescription>
            Credentials are encrypted at rest. Nothing leaves your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={form.name ?? ''}
              placeholder="My database"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <Label>Engine</Label>
            <Select
              value={engine}
              onValueChange={(v) => setEngine(v as DatabaseEngine)}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {drivers?.map((d) => (
                  <SelectItem key={d.engine} value={d.engine}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {driver && (
              <p className="text-xs text-muted-foreground">
                {driver.description}
              </p>
            )}
          </div>

          {driver?.fields.map((field) => (
            <div key={field.key} className="grid gap-2">
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              <Input
                id={field.key}
                type={field.type === 'password' ? 'password' : 'text'}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                value={form[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [field.key]: e.target.value }))
                }
              />
              {field.hint && (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
            </div>
          ))}

          {engine !== 'sqlite' && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="ssl">Use TLS / SSL</Label>
                <p className="text-xs text-muted-foreground">
                  Encrypt the connection to the server.
                </p>
              </div>
              <Switch id="ssl" checked={ssl} onCheckedChange={setSsl} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="mr-2 h-4 w-4" />
            )}
            Test
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeConnectionDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
