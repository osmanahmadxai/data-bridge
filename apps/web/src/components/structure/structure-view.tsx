'use client';

import { KeyRound, Link2 } from 'lucide-react';
import { useSchema } from '@/lib/queries';
import { useStudio } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function StructureView() {
  const { activeConnectionId, activeDatabase, selected } = useStudio();
  const { data: schema } = useSchema(activeConnectionId, activeDatabase);

  if (!selected) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Select a table to inspect its structure.
      </div>
    );
  }

  const table = schema?.namespaces
    .flatMap((ns) => ns.tables)
    .find(
      (t) =>
        t.name === selected.table &&
        (t.schema ?? '') === (selected.schema ?? ''),
    );

  if (!table) {
    return (
      <div className="text-muted-foreground p-4 text-sm">
        Loading structure…
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Columns
            <Badge variant="secondary" className="font-normal">
              {table.columns.length}
            </Badge>
          </h3>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Nullable</th>
                  <th className="px-3 py-2 font-medium">Default</th>
                  <th className="px-3 py-2 font-medium">Key</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col) => (
                  <tr key={col.name} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {col.name}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">
                      {col.dataType}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {col.nullable ? 'YES' : 'NO'}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">
                      {col.defaultValue ?? '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        {col.isPrimaryKey && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-amber-500"
                          >
                            <KeyRound className="h-3 w-3" /> PK
                          </Badge>
                        )}
                        {col.references && (
                          <Badge variant="outline" className="gap-1">
                            <Link2 className="h-3 w-3" />
                            {col.references.table}.{col.references.column}
                          </Badge>
                        )}
                        {col.isAutoIncrement && (
                          <Badge variant="outline">auto</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {table.indexes.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Indexes</h3>
            <div className="space-y-1">
              {table.indexes.map((idx) => (
                <div
                  key={idx.name}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
                >
                  <span className="font-mono">{idx.name}</span>
                  <span className="text-muted-foreground">
                    ({idx.columns.join(', ')})
                  </span>
                  {idx.primary && <Badge variant="outline">primary</Badge>}
                  {idx.unique && !idx.primary && (
                    <Badge variant="outline">unique</Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {table.foreignKeys.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Foreign keys</h3>
            <div className="space-y-1">
              {table.foreignKeys.map((fk) => (
                <div
                  key={fk.name}
                  className="rounded-md border px-3 py-1.5 font-mono text-xs"
                >
                  {fk.columns.join(', ')} → {fk.referencedTable}(
                  {fk.referencedColumns.join(', ')})
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}
