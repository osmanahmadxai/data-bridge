import type { DatabaseEngine } from '@relay/core';

interface EngineMeta {
  label: string;
  /** Short tag shown in the avatar square. */
  abbr: string;
  /** Tailwind classes for the engine accent (bg + text). */
  className: string;
}

export const ENGINE_META: Record<DatabaseEngine, EngineMeta> = {
  postgres: {
    label: 'PostgreSQL',
    abbr: 'PG',
    className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  mysql: {
    label: 'MySQL',
    abbr: 'My',
    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  sqlite: {
    label: 'SQLite',
    abbr: 'SL',
    className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  mongodb: {
    label: 'MongoDB',
    abbr: 'Mo',
    className: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
  redis: {
    label: 'Redis',
    abbr: 'Rd',
    className: 'bg-red-500/15 text-red-600 dark:text-red-400',
  },
  mssql: {
    label: 'SQL Server',
    abbr: 'MS',
    className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
};

export function engineMeta(engine: DatabaseEngine): EngineMeta {
  return (
    ENGINE_META[engine] ?? {
      label: engine,
      abbr: engine.slice(0, 2).toUpperCase(),
      className: 'bg-muted text-muted-foreground',
    }
  );
}
