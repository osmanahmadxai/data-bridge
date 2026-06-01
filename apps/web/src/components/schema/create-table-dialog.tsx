'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDefinition, DatabaseEngine } from '@relay/core';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  connectionId: string;
  engine: DatabaseEngine;
  database?: string;
  schema?: string;
  dataTypes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DraftColumn = ColumnDefinition & { id: number };

const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;

// One template shared by header + rows so checkbox columns line up exactly.
const GRID =
  'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_2.4rem_2.4rem_2.4rem_2.4rem_minmax(0,1.4fr)_2rem] items-center gap-2';

/** Common default expressions offered as suggestions per engine. */
function defaultPresets(engine: DatabaseEngine): string[] {
  switch (engine) {
    case 'postgres':
      return ['now()', 'CURRENT_TIMESTAMP', 'gen_random_uuid()', 'true', 'false', '0', "''"];
    case 'mysql':
      return ['CURRENT_TIMESTAMP', 'NOW()', 'UUID()', '0', '1', "''"];
    case 'sqlite':
      return ['CURRENT_TIMESTAMP', "(datetime('now'))", '0', "''"];
    default:
      return [];
  }
}

function timestampHint(engine: DatabaseEngine): string {
  if (engine === 'postgres')
    return 'Tip: for a created-at column use type "timestamptz" with default now().';
  if (engine === 'mysql')
    return 'Tip: for a created-at column use type "datetime" with default CURRENT_TIMESTAMP.';
  if (engine === 'sqlite')
    return 'Tip: for a created-at column use type "TEXT" with default CURRENT_TIMESTAMP.';
  return '';
}

let columnId = 0;
function newColumn(type: string): DraftColumn {
  return {
    id: columnId++,
    name: '',
    type,
    nullable: true,
    primaryKey: false,
    autoIncrement: false,
    unique: false,
  };
}

export function CreateTableDialog({
  connectionId,
  engine,
  database,
  schema,
  dataTypes,
  open,
  onOpenChange,
}: Props) {
  // Mongo (and other schemaless engines) expose no column types — a table is
  // just a named collection.
  const schemaless = dataTypes.length === 0;
  const defaultType = dataTypes[0] ?? 'text';
  const presets = defaultPresets(engine);

  const [table, setTable] = useState('');
  const [columns, setColumns] = useState<DraftColumn[]>(() => {
    const id = newColumn(engine === 'sqlite' ? 'INTEGER' : defaultType);
    id.name = 'id';
    id.primaryKey = true;
    id.autoIncrement = true;
    id.nullable = false;
    return [id];
  });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  function patch(id: number, change: Partial<DraftColumn>) {
    setColumns((cols) =>
      cols.map((c) => (c.id === id ? { ...c, ...change } : c)),
    );
  }

  async function handleCreate() {
    const tableName = table.trim();
    if (!IDENT.test(tableName)) {
      toast.error('Invalid table name', {
        description:
          'Start with a letter or _, then letters, digits or underscores — no spaces or dashes.',
      });
      return;
    }

    let payloadColumns: ColumnDefinition[];
    if (schemaless) {
      payloadColumns = [
        { name: '_id', type: 'objectId', nullable: false, primaryKey: true, autoIncrement: false },
      ];
    } else {
      // Ignore fully-blank rows the user never filled in.
      const defined = columns.filter((c) => c.name.trim() !== '');
      if (defined.length === 0) {
        toast.error('Add at least one named column');
        return;
      }
      for (const c of defined) {
        if (!IDENT.test(c.name.trim())) {
          toast.error(`Invalid column name “${c.name}”`, {
            description: 'Use snake_case or camelCase — no spaces or dashes.',
          });
          return;
        }
        if (!c.type.trim()) {
          toast.error(`Column “${c.name}” needs a type`);
          return;
        }
      }
      payloadColumns = defined.map((c) => ({
        name: c.name.trim(),
        type: c.type,
        nullable: c.nullable,
        primaryKey: c.primaryKey,
        autoIncrement: c.autoIncrement,
        unique: c.unique,
        defaultValue: c.defaultValue?.trim() || undefined,
      }));
    }

    setSaving(true);
    try {
      await api.createTable(
        connectionId,
        { schema, table: tableName, columns: payloadColumns },
        database,
      );
      await qc.invalidateQueries({
        queryKey: ['connections', connectionId, 'schema'],
      });
      toast.success(`Created ${tableName}`);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>
            {schemaless ? 'New collection' : 'New table'}
          </DialogTitle>
          <DialogDescription>
            {schemaless
              ? 'Create an empty collection in this database.'
              : 'Define columns, keys, constraints and defaults.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tbl-name">
              {schemaless ? 'Collection name' : 'Table name'}
            </Label>
            <Input
              id="tbl-name"
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder={schemaless ? 'events' : 'users'}
              autoFocus
            />
          </div>

          {!schemaless && (
            <div className="grid gap-2">
              <div
                className={`${GRID} px-1 text-[11px] font-medium text-muted-foreground`}
              >
                <span>Name</span>
                <span>Type</span>
                <span className="text-center" title="Nullable">
                  Null
                </span>
                <span className="text-center" title="Primary key">
                  PK
                </span>
                <span className="text-center" title="Auto-increment">
                  AI
                </span>
                <span className="text-center" title="Unique">
                  Uniq
                </span>
                <span>Default</span>
                <span />
              </div>

              {columns.map((col) => (
                <div key={col.id} className={GRID}>
                  <Input
                    value={col.name}
                    placeholder="column"
                    className="h-8"
                    onChange={(e) => patch(col.id, { name: e.target.value })}
                  />
                  <Select
                    value={col.type}
                    onValueChange={(v) => patch(col.id, { type: v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dataTypes.map((t) => (
                        <SelectItem key={t} value={t} className="font-mono">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="checkbox"
                    aria-label="Nullable"
                    checked={col.nullable}
                    disabled={col.primaryKey}
                    onChange={(e) => patch(col.id, { nullable: e.target.checked })}
                    className="mx-auto h-4 w-4 accent-primary"
                  />
                  <input
                    type="checkbox"
                    aria-label="Primary key"
                    checked={col.primaryKey}
                    onChange={(e) =>
                      patch(col.id, {
                        primaryKey: e.target.checked,
                        nullable: e.target.checked ? false : col.nullable,
                      })
                    }
                    className="mx-auto h-4 w-4 accent-primary"
                  />
                  <input
                    type="checkbox"
                    aria-label="Auto-increment"
                    checked={col.autoIncrement}
                    onChange={(e) =>
                      patch(col.id, {
                        autoIncrement: e.target.checked,
                        primaryKey: e.target.checked ? true : col.primaryKey,
                        nullable: e.target.checked ? false : col.nullable,
                      })
                    }
                    className="mx-auto h-4 w-4 accent-primary"
                  />
                  <input
                    type="checkbox"
                    aria-label="Unique"
                    checked={col.unique}
                    disabled={col.primaryKey}
                    onChange={(e) => patch(col.id, { unique: e.target.checked })}
                    className="mx-auto h-4 w-4 accent-primary"
                  />
                  <Input
                    list="omni-default-presets"
                    value={col.defaultValue ?? ''}
                    placeholder="—"
                    className="h-8"
                    onChange={(e) =>
                      patch(col.id, { defaultValue: e.target.value })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={columns.length === 1}
                    onClick={() =>
                      setColumns((cols) => cols.filter((c) => c.id !== col.id))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <datalist id="omni-default-presets">
                {presets.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  setColumns((cols) => [...cols, newColumn(defaultType)])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add column
              </Button>

              <p className="text-xs text-muted-foreground">
                {timestampHint(engine)} Names must be valid identifiers
                (letters, digits, underscores — no spaces).
              </p>
            </div>
          )}
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
