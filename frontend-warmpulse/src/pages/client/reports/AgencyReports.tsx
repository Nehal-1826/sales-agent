import { PageLoader } from '@/components/loaders';
import { useAgencyReportsData } from '@/features/reports/useAgencyReportsData';
import { AgRptM4Galley } from '@/pages/client/agency/AgRptM4Galley';

/**
 * /app/reports for Agency-tier users — the locked-live "Editor's Galley
 * Proof" design (`AgRptM4Galley`) wrapped with the live-data adapter.
 *
 * M4's defining characteristic is the editorial galley-proof aesthetic +
 * ledger-card XLSX preview with real PDF + XLSX dual-export. The agency
 * reports surface is re-imagined as a magazine editor's proofing desk —
 * three vertical columns compose the experience like a publishing house
 * layout: a style-guide rail on the left (edition controls, editorial
 * sections, accent inkwells, distribution recipients), a galley-proof
 * canvas in the centre (PDF mode renders an actual galley page with
 * editorial margin marks; XLSX mode renders the workbook as a vertical
 * stack of polished ledger cards — one card per sheet for Summary /
 * Detail / Template), and a fact-checker inspector on the right
 * (page-count / word-count in PDF mode, sheet breakdown / row counts /
 * file size in XLSX mode).
 *
 * The EXACT-MATCH guarantee is the differentiator: a shared builder
 * plan drives BOTH the on-screen preview AND the real `handlePdf` /
 * `handleXlsx` export functions. What the editor signs off in preview
 * is byte-faithful to the downloaded file — the XLSX workbook always
 * carries three sheets (Summary, Detail, Template) and the PDF always
 * ships the cover plate, editorial, KPI figures, breakdown, trend bars,
 * and colophon configured in the rail.
 *
 * The M4 design accepts an optional `data?: AgencyReportsData` prop and
 * falls back to its inline MOCK ("Northwind Agency") when no prop is
 * passed — useful for the design-preview harness. In this locked-live
 * wrapper we always pass the adapter's `data`, never the MOCK, so the
 * editor sees their own agency portfolio.
 *
 * Loading state: shows the shared PageLoader (returns null — the
 * established convention across the nine other locked Agency wrappers).
 * Once `data` arrives, the galley renders.
 *
 * Empty-data state: the adapter returns a valid AgencyReportsData with
 * zero-fill metric rows for a brand-new agency; the galley itself
 * handles the empty sub-client list gracefully (pull-quote reads
 * "no sub-client warmth signal yet" etc.).
 */
export function AgencyReports() {
  const { data, isLoading } = useAgencyReportsData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgRptM4Galley data={data} />;
}

export default AgencyReports;
