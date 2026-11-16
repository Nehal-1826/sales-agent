import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

/**
 * Reports react-query hooks (spec §5.1 item 6).
 *
 * Endpoints live under `/api/workspace/reports/*`. All reads soft-fail on
 * 404/501/503 so the UI renders empty states rather than throwing. Downloads
 * use `responseType:'blob'` and trigger a browser file save.
 */

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';
export type ReportFormat = 'pdf' | 'csv';
export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface GeneratedReport {
  id: string;
  type: ReportType;
  range: string; // e.g. "2026-04-01 → 2026-04-15"
  format: ReportFormat;
  created_at: string;
  download_url: string;
}

export interface ScheduledReport {
  id: string;
  type: ReportType;
  frequency: ReportFrequency;
  recipients: string[];
  next_run_at: string;
  last_run_at: string | null;
}

export interface ReportsVolumePoint {
  date: string;
  pdfs: number;
  csvs: number;
}

export interface ReportsData {
  generated: GeneratedReport[];
  scheduled: ScheduledReport[];
  volume_series: ReportsVolumePoint[];
}

export const REPORTS_KEY = ['reports'] as const;

function statusCode(err: unknown): number | null {
  if (err instanceof AxiosError) return err.response?.status ?? null;
  return null;
}

function isSoftMissing(err: unknown): boolean {
  const s = statusCode(err);
  return s === 404 || s === 501 || s === 503;
}

async function getOrEmpty<T>(
  path: string,
  params: Record<string, unknown> | undefined,
  empty: T,
): Promise<T> {
  try {
    const res = await api.get<T>(path, { params });
    return res.data;
  } catch (err) {
    if (isSoftMissing(err)) return empty;
    throw err;
  }
}

function emptyVolumeSeries(): ReportsVolumePoint[] {
  const today = new Date();
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return { date: d.toISOString().slice(0, 10), pdfs: 0, csvs: 0 };
  });
}

export function useReports(): UseQueryResult<ReportsData> {
  return useQuery({
    queryKey: REPORTS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      // Try the all-in-one endpoint first.
      try {
        const res = await api.get('/workspace/reports');
        const d = res.data as Partial<ReportsData> & Record<string, unknown>;
        if (d && typeof d === 'object' && ('generated' in d || 'scheduled' in d)) {
          return {
            generated: (d.generated as GeneratedReport[]) ?? [],
            scheduled: (d.scheduled as ScheduledReport[]) ?? [],
            volume_series:
              (d.volume_series as ReportsVolumePoint[]) ?? emptyVolumeSeries(),
          } satisfies ReportsData;
        }
      } catch (err) {
        if (!isSoftMissing(err)) throw err;
      }

      // Fallback: parallel fetches with soft-fail.
      const [generated, scheduled, volume] = await Promise.all([
        getOrEmpty<GeneratedReport[] | { items: GeneratedReport[] }>(
          '/workspace/reports/generated',
          undefined,
          [],
        ),
        getOrEmpty<ScheduledReport[] | { items: ScheduledReport[] }>(
          '/workspace/reports/scheduled',
          undefined,
          [],
        ),
        getOrEmpty<ReportsVolumePoint[] | { items: ReportsVolumePoint[] }>(
          '/workspace/reports/volume',
          { days: 30 },
          emptyVolumeSeries(),
        ),
      ]);

      const pickArr = <T,>(v: T[] | { items: T[] }): T[] =>
        Array.isArray(v) ? v : v.items ?? [];

      return {
        generated: pickArr(generated),
        scheduled: pickArr(scheduled),
        volume_series: Array.isArray(volume) ? volume : volume.items ?? [],
      } satisfies ReportsData;
    },
  });
}

// ---------- mutations ----------

export interface GenerateReportPayload {
  type: ReportType;
  format: ReportFormat;
  from: string; // YYYY-MM-DD
  to: string;
  mailbox_ids?: string[];
}

export function useGenerateReport(): UseMutationResult<
  GeneratedReport,
  unknown,
  GenerateReportPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/reports/generate', payload);
      return res.data as GeneratedReport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

/**
 * Generate the report server-side and ask the backend to email it to the
 * caller (or explicit recipients). Backend persists the generated row so the
 * "Recently generated" panel picks it up, and returns the dispatch outcome.
 */
export interface EmailReportPayload {
  type: ReportType;
  format?: ReportFormat;
  from: string;
  to: string;
  recipients?: string[];
  mailbox_ids?: string[];
}

export interface EmailReportResponse {
  status: 'sent' | 'dry_run' | 'failed' | string;
  recipients: string[];
  report: GeneratedReport;
}

export function useEmailReport(): UseMutationResult<
  EmailReportResponse,
  unknown,
  EmailReportPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/reports/email', payload);
      return res.data as EmailReportResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export function useDeleteReport(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/reports/generated/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export interface ScheduledReportPayload {
  type: ReportType;
  frequency: ReportFrequency;
  recipients: string[];
  format?: ReportFormat;
}

export function useCreateScheduledReport(): UseMutationResult<
  ScheduledReport,
  unknown,
  ScheduledReportPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/reports/scheduled', payload);
      return res.data as ScheduledReport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export function useUpdateScheduledReport(): UseMutationResult<
  ScheduledReport,
  unknown,
  { id: string; payload: Partial<ScheduledReportPayload> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch(`/workspace/reports/scheduled/${id}`, payload);
      return res.data as ScheduledReport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export function useDeleteScheduledReport(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/reports/scheduled/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

/**
 * Triggers a browser file-save. Blob is fetched via axios so the bearer token
 * attaches via the existing interceptor; `download_url` may be a relative path
 * or absolute — we pass absolute URLs straight to the browser since they're
 * usually pre-signed S3 links.
 */
export function useDownloadReport(): UseMutationResult<void, unknown, GeneratedReport> {
  return useMutation({
    mutationFn: async (report) => {
      const isAbsolute = /^https?:\/\//i.test(report.download_url);
      if (isAbsolute) {
        // Let the browser handle pre-signed URLs directly.
        if (typeof window !== 'undefined') {
          const a = document.createElement('a');
          a.href = report.download_url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.download = buildFilename(report);
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        return;
      }

      const res = await api.get(report.download_url, { responseType: 'blob' });
      const blob = res.data as Blob;
      if (typeof window === 'undefined') return;
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = buildFilename(report);
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    },
  });
}

function buildFilename(report: GeneratedReport): string {
  const date = (report.created_at ?? '').slice(0, 10) || 'report';
  const safeRange = (report.range ?? '').replace(/[^0-9A-Za-z_-]+/g, '_');
  return `warmpulse-${report.type}-${date}${safeRange ? `-${safeRange}` : ''}.${report.format}`;
}
