'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  BrowseParams,
  ConnectionInputDTO,
} from '@relay/core';
import { api } from './api';

export const queryKeys = {
  drivers: ['drivers'] as const,
  connections: ['connections'] as const,
  connection: (id: string) => ['connections', id] as const,
  databases: (id: string) => ['connections', id, 'databases'] as const,
  schema: (id: string, database?: string) =>
    ['connections', id, 'schema', database ?? 'default'] as const,
  browse: (id: string, database: string | undefined, params: BrowseParams) =>
    ['connections', id, 'browse', database ?? 'default', params] as const,
};

export function useDrivers() {
  return useQuery({
    queryKey: queryKeys.drivers,
    queryFn: () => api.listDrivers(),
    staleTime: Infinity,
  });
}

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections,
    queryFn: () => api.listConnections(),
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectionInputDTO) => api.createConnection(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.connections }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConnectionInputDTO }) =>
      api.updateConnection(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.connections }),
  });
}

export function useSchema(id: string | null, database?: string) {
  return useQuery({
    queryKey: id ? queryKeys.schema(id, database) : ['schema', 'none'],
    queryFn: () => api.getSchema(id as string, database),
    enabled: !!id,
  });
}

export function useDatabases(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.databases(id) : ['databases', 'none'],
    queryFn: () => api.listDatabases(id as string),
    enabled: !!id,
  });
}

export function useBrowse(
  id: string | null,
  params: BrowseParams | null,
  database?: string,
) {
  return useQuery({
    queryKey:
      id && params ? queryKeys.browse(id, database, params) : ['browse', 'none'],
    queryFn: () => api.browse(id as string, params as BrowseParams, database),
    enabled: !!id && !!params,
    placeholderData: (prev) => prev,
  });
}
