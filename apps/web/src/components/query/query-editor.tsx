'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Loader2, Play, Plus, Sparkles, X } from 'lucide-react';
import { format } from 'sql-formatter';
import { toast } from 'sonner';
import type { QueryLanguage, QueryResult } from '@data-bridge/core';
import { api, ApiError } from '@/lib/api';
import { useConnections, useDrivers, useSchema } from '@/lib/queries';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ResultTable } from './result-table';

const MONACO_LANG: Record<QueryLanguage, string> = {
  sql: 'sql',
  mongo: 'json',
  redis: 'shell',
  none: 'plaintext',
};

const STARTER: Record<QueryLanguage, string> = {
  sql: '-- Write SQL and press ⌘/Ctrl + Enter to run\nSELECT 1;',
  mongo:
    '// JSON command document\n{\n  "collection": "",\n  "find": {},\n  "limit": 20\n}',
  redis: '# One Redis command per line\nPING\nINFO server',
  none: '',
};

export function QueryEditor() {
  const { activeConnectionId, activeDatabase } = useStudio();
  const {
    queryTabs,
    activeQueryTabId,
    addQueryTab,
    closeQueryTab,
    setActiveQueryTab,
    updateQueryTabSql,
  } = useStudio();
  const { resolvedTheme } = useTheme();
  const { data: connections } = useConnections();
  const { data: drivers } = useDrivers();
  const conn = connections?.find((c) => c.id === activeConnectionId);
  const driver = drivers?.find((d) => d.engine === conn?.engine);
  const lang = driver?.capabilities.queryLanguage ?? 'sql';

  const { data: schema } = useSchema(activeConnectionId, activeDatabase);
  // module-level ref so the (once-only) completion provider always reads the
  // schema of whichever editor instance rendered last
  latestSchemaRef.current = schema;

  const activeTab =
    queryTabs.find((t) => t.id === activeQueryTabId) ?? queryTabs[0]!;
  const value = activeTab.sql;

  const [results, setResults] = useState<Record<string, QueryResult | null>>(
    {},
  );
  const [runningId, setRunningId] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // seed a starter snippet only when the active tab is empty
  useEffect(() => {
    if (!activeTab.sql.trim()) updateQueryTabSql(activeTab.id, STARTER[lang]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, activeTab.id]);

  // results are keyed by tab id; drop them all when the connection changes so
  // a stale result set never shows against another database's tabs
  useEffect(() => {
    setResults({});
  }, [activeConnectionId]);

  const run = useCallback(async () => {
    if (!activeConnectionId) return;
    const tabId = activeQueryTabId;
    const statement = editorRef.current?.getModel()?.getValue() ?? value;
    if (!statement.trim()) return;
    setRunningId(tabId);
    try {
      const res = await api.runQuery(
        activeConnectionId,
        statement,
        undefined,
        activeDatabase,
      );
      setResults((r) => ({ ...r, [tabId]: res }));
    } catch (err) {
      toast.error('Query failed', {
        description: err instanceof ApiError ? err.message : String(err),
      });
    } finally {
      setRunningId(null);
    }
  }, [activeConnectionId, activeDatabase, activeQueryTabId, value]);

  // Monaco keeps the command callback it was mounted with forever; go through
  // a ref so ⌘/Ctrl+Enter always runs against the current connection/tab
  const runRef = useRef(run);
  runRef.current = run;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => void runRef.current(),
    );
    if (lang === 'sql') registerSqlCompletion(monaco);
  };

  function formatSql() {
    if (lang !== 'sql') return;
    try {
      updateQueryTabSql(
        activeTab.id,
        format(editorRef.current?.getValue() ?? value),
      );
    } catch {
      /* ignore formatting errors */
    }
  }

  if (!activeConnectionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a connection to run queries.
      </div>
    );
  }

  const running = runningId === activeQueryTabId;

  return (
    <div className="flex h-full flex-col">
      {/* tab bar */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b px-1 scrollbar-thin">
        {queryTabs.map((t) => (
          <div
            key={t.id}
            className={cn(
              'group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-t border-b-2 px-3 text-xs',
              t.id === activeQueryTabId
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveQueryTab(t.id)}
          >
            <span className="max-w-[140px] truncate">{t.name}</span>
            <button
              className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                // prune the closed tab's result so the map doesn't grow forever
                setResults((r) => {
                  const next = { ...r };
                  delete next[t.id];
                  return next;
                });
                closeQueryTab(t.id);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="New query tab"
          onClick={() => addQueryTab()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Button size="sm" onClick={() => run()} disabled={running}>
          {running ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          Run
          <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">
            ⌘↵
          </span>
        </Button>
        {lang === 'sql' && (
          <Button size="sm" variant="ghost" onClick={formatSql}>
            <Sparkles className="mr-1 h-4 w-4" /> Format
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {driver?.label} · {lang.toUpperCase()}
        </span>
      </div>

      <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={50} minSize={20}>
          <Editor
            path={activeTab.id}
            language={MONACO_LANG[lang]}
            theme={resolvedTheme === 'light' ? 'light' : 'vs-dark'}
            value={value}
            onChange={(v) => updateQueryTabSql(activeTab.id, v ?? '')}
            onMount={handleMount}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              fontFamily: 'var(--font-mono)',
              automaticLayout: true,
            }}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={20}>
          <ResultTable result={results[activeQueryTabId] ?? null} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** registers schema-aware SQL autocompletion (tables + columns + keywords) */
let sqlCompletionRegistered = false;
/** updated by every mounted editor so completion reads the live schema */
const latestSchemaRef: { current: unknown } = { current: undefined };
function registerSqlCompletion(monaco: Monaco) {
  if (sqlCompletionRegistered) return;
  sqlCompletionRegistered = true;

  const KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY',
    'ORDER BY', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE FROM', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'ON', 'COUNT', 'DISTINCT',
  ];

  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions: import('monaco-editor').languages.CompletionItem[] =
        [];

      const schema = latestSchemaRef.current as
        | {
            namespaces: {
              tables: { name: string; columns: { name: string }[] }[];
            }[];
          }
        | undefined;

      if (schema) {
        for (const ns of schema.namespaces) {
          for (const table of ns.tables) {
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: table.name,
              detail: 'table',
              range,
            });
            for (const col of table.columns) {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${table.name} column`,
                range,
              });
            }
          }
        }
      }

      for (const kw of KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }
      return { suggestions };
    },
  });
}
