/**
 * System health feature hooks.
 *
 * One composite read (`useSystemHealth`) that returns queue metrics, worker
 * heartbeats, delivery time-series, API latency series, and grouped error
 * counts. The endpoint is expected to be stubbed for a while, so the hook
 * soft-fails to sensible defaults on 404/501/503 — the UI renders an empty
 * state rather than a crash.
 *
 * Consumer contract (from SystemHealthPage):
 *   data?.queues          → QueueMetrics
 *   data?.workers         → WorkerRow[]
 *   data?.delivery_rates  → DeliveryPoint[]
 *   data?.latency         → LatencyBundle
 *   data?.error_types     → ErrorTypeRow[]
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueueSparkPoint {
  t: string;
  value: number;
}

export interface QueueMetrics {
  celery_depth: number;
  beat_delay_s: number;
  redis_ops_per_s: number;
  celery_depth_series: QueueSparkPoint[];
  beat_delay_series: QueueSparkPoint[];
  redis_ops_series: QueueSparkPoint[];
}

export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface WorkerRow {
  id: string;
  host: string;
  status: WorkerStatus;
  last_heartbeat: string;
  current_task: string | null;
}

export interface DeliveryPoint {
  t: string;
  smtp_send: number;
  imap_fetch: number;
  error_rate: number;
}

export interface LatencyPoint {
  t: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyBundle {
  api_p50: number;
  api_p95: number;
  api_p99: number;
  series: LatencyPoint[];
}

export interface ErrorTypeRow {
  type: string;
  count: number;
}

export interface SystemHealthBundle {
  queues: QueueMetrics;
  workers: WorkerRow[];
  delivery_rates: DeliveryPoint[];
  latency: LatencyBundle;
  error_types: ErrorTypeRow[];
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

export const SYSTEM_HEALTH_KEYS = {
  root: ['admin', 'system-health'] as const,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusCode(err: unknown): number | null {
  if (err instanceof AxiosError) return err.response?.status ?? null;
  return null;
}

function isSoftMissing(err: unknown): boolean {
  const s = statusCode(err);
  return s === 404 || s === 501 || s === 503;
}

async function getOrEmpty<T>(path: string, empty: T): Promise<T> {
  try {
    const res = await api.get<T>(path);
    return res.data;
  } catch (err) {
    if (isSoftMissing(err)) return empty;
    throw err;
  }
}

const EMPTY_HEALTH: SystemHealthBundle = {
  queues: {
    celery_depth: 0,
    beat_delay_s: 0,
    redis_ops_per_s: 0,
    celery_depth_series: [],
    beat_delay_series: [],
    redis_ops_series: [],
  },
  workers: [],
  delivery_rates: [],
  latency: { api_p50: 0, api_p95: 0, api_p99: 0, series: [] },
  error_types: [],
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useSystemHealth(): UseQueryResult<SystemHealthBundle> {
  return useQuery({
    queryKey: SYSTEM_HEALTH_KEYS.root,
    // Refresh on a short cadence — this page is basically a live dashboard.
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: () => getOrEmpty<SystemHealthBundle>('/admin/system-health', EMPTY_HEALTH),
  });
}
