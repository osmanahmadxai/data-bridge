'use client';

import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { KeyRound, Link2 } from 'lucide-react';
import type { DatabaseSchema, TableSchema } from '@data-bridge/core';
import { useSchema } from '@/lib/queries';
import { useStudio } from '@/lib/store';

type TableNodeData = { table: TableSchema };

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const { table } = data;
  return (
    <div className="border-border bg-card min-w-[200px] overflow-hidden rounded-md border shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="bg-muted/60 border-b px-3 py-1.5 text-xs font-semibold">
        {table.name}
      </div>
      <div className="divide-y">
        {table.columns.slice(0, 20).map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-2 px-3 py-1 text-[11px]"
          >
            {col.isPrimaryKey ? (
              <KeyRound className="h-3 w-3 shrink-0 text-amber-500" />
            ) : col.references ? (
              <Link2 className="text-muted-foreground h-3 w-3 shrink-0" />
            ) : (
              <span className="w-3" />
            )}
            <span className="font-mono">{col.name}</span>
            <span className="text-muted-foreground ml-auto font-mono">
              {col.dataType}
            </span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

function buildGraph(schema: DatabaseSchema): { nodes: Node[]; edges: Edge[] } {
  const tables = schema.namespaces.flatMap((ns) => ns.tables);
  const cols = Math.ceil(Math.sqrt(tables.length)) || 1;

  const nodes: Node[] = tables.map((table, i) => ({
    id: table.name,
    type: 'table',
    position: { x: (i % cols) * 320, y: Math.floor(i / cols) * 280 },
    data: { table },
  }));

  const ids = new Set(tables.map((t) => t.name));
  const edges: Edge[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!ids.has(fk.referencedTable)) continue;
      edges.push({
        id: `${table.name}-${fk.name}`,
        source: table.name,
        target: fk.referencedTable,
        animated: true,
        label: fk.columns.join(', '),
        style: { stroke: 'hsl(var(--muted-foreground))' },
      });
    }
  }
  return { nodes, edges };
}

export function ERDiagram() {
  const { activeConnectionId, activeDatabase } = useStudio();
  const { data: schema } = useSchema(activeConnectionId, activeDatabase);

  const { nodes, edges } = useMemo(
    () => (schema ? buildGraph(schema) : { nodes: [], edges: [] }),
    [schema],
  );

  if (!activeConnectionId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Select a connection to view its entity-relationship diagram.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No tables to diagram.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
