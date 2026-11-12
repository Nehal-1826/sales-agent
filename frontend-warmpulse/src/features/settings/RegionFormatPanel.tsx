/**
 * RegionFormatPanel
 *
 * A self-contained "Region & Format" settings section. Drop it anywhere inside
 * a settings page. Reads from / writes to `useLocaleStore` (localStorage key
 * `wp-locale`). Re-renders when region changes via the hook.
 *
 * Live preview shows a fixed sample timestamp so there are no top-level
 * `new Date()` / `Date.now()` calls at module scope.
 */

import { Globe } from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { Region } from '@/stores/locale';
import './region-format-panel.css';

// Fixed sample — avoids module-scope Date.now() / new Date()
const SAMPLE_AMOUNT = 1234567;
const SAMPLE_TS = 978307200000; // 2001-01-01T00:00:00.000Z — stable, memorable

interface RegionOption {
  region: Region;
  label: string;
  sub: string;
}

const OPTIONS: RegionOption[] = [
  {
    region: 'IN',
    label: 'India',
    sub: '₹ INR · DD/MM/YYYY · IST',
  },
  {
    region: 'INTL',
    label: 'International',
    sub: '$ USD · MMM D, YYYY',
  },
];

const CLOCK_OPTIONS: { value: boolean; label: string; sub: string }[] = [
  { value: false, label: '24-hour', sub: '20:51' },
  { value: true, label: '12-hour', sub: '8:51 PM' },
];

export function RegionFormatPanel() {
  const { region, setRegion, hour12, setHour12, money, dateTime } = useLocaleFormat();

  return (
    <section className="rfp">
      {/* Header */}
      <header className="rfp__head">
        <span className="rfp__icon">
          <Globe size={14} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="rfp__title">Region &amp; Format</h2>
          <p className="rfp__sub">
            Controls how numbers, currency and dates appear across your
            WarmPulse account. Stored in your browser.
          </p>
        </div>
      </header>

      {/* Segmented switcher */}
      <div className="rfp__seg" role="group" aria-label="Choose region">
        {OPTIONS.map((opt) => {
          const active = opt.region === region;
          return (
            <button
              key={opt.region}
              type="button"
              aria-pressed={active}
              onClick={() => setRegion(opt.region)}
              className={`rfp__seg-btn${active ? ' rfp__seg-btn--active' : ''}`}
            >
              <span className="rfp__seg-label">{opt.label}</span>
              <span className="rfp__seg-sub">{opt.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Clock format (12 / 24-hour) — independent of region */}
      <div className="rfp__seg" role="group" aria-label="Choose clock format" style={{ marginTop: 10 }}>
        {CLOCK_OPTIONS.map((opt) => {
          const active = opt.value === hour12;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => setHour12(opt.value)}
              className={`rfp__seg-btn${active ? ' rfp__seg-btn--active' : ''}`}
            >
              <span className="rfp__seg-label">{opt.label}</span>
              <span className="rfp__seg-sub">{opt.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Live preview */}
      <div className="rfp__preview">
        <span className="rfp__preview-label">Preview</span>
        <span className="rfp__preview-value">
          {money(SAMPLE_AMOUNT)}
          <span className="rfp__preview-sep">·</span>
          {dateTime(SAMPLE_TS)}
        </span>
      </div>
    </section>
  );
}
