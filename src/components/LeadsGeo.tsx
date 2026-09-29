import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLeads } from '../lib/api';
import type { Lead } from '../lib/types';
import { Chip, Spinner } from './ui';

type SortKey = 'company' | 'industry' | 'score' | 'state' | 'country';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'industry', label: 'Industry', className: 'hide-sm' },
  { key: 'score', label: 'Score' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
];

function scoreTone(score: number): 'success' | 'warn' | 'accent' {
  if (score >= 80) return 'success';
  if (score >= 65) return 'warn';
  return 'accent';
}

/**
 * LEADS · REGION — every lead with its state + country, sortable column-wise
 * and filterable state/country wise (mirrors the Django Admin lead list).
 */
export function LeadsGeo({ refreshToken = 0 }: { refreshToken?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [country, setCountry] = useState(''); // '' = all
  const [state, setState] = useState(''); // '' = all

  const reload = useCallback(() => {
    setLoading(true);
    getLeads().then((l) => {
      setLeads(l);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshToken]);

  const countries = useMemo(
    () => [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(),
    [leads],
  );
  const states = useMemo(
    () => [...new Set(leads.map((l) => l.state).filter(Boolean))].sort(),
    [leads],
  );

  const visible = useMemo(() => {
    const rows = leads.filter(
      (l) => (!country || l.country === country) && (!state || l.state === state),
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = (a[sortKey] ?? '').toString().toLowerCase();
      const vb = (b[sortKey] ?? '').toString().toLowerCase();
      if (va === vb) return 0;
      // numeric fields sort numerically, empty values sink to the bottom
      if (sortKey === 'score') return (Number(va) - Number(vb)) * dir;
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb) * dir;
    });
  }, [leads, country, state, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  };

  if (loading) return <Spinner label="Loading leads…" />;

  return (
    <div className="leads-geo">
      <div className="leads-geo-filters">
        <label>
          Country
          <select className="input select-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All ({countries.length})</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          State
          <select className="input select-sm" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All ({states.length})</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="leads-geo-count">
          {visible.length} of {leads.length} leads
        </span>
      </div>

      <div className="leads-geo-scroll">
        <table className="leads-geo-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.className}>
                  <button
                    className={`th-sort${sortKey === col.key ? ' active' : ''}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    <span className="th-arrow">{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
              <th className="hide-sm">Contact</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="lg-company">
                    <strong>{lead.company}</strong>
                    <small>{lead.website || 'no website'}</small>
                  </div>
                </td>
                <td className="hide-sm dim">{lead.industry}</td>
                <td>
                  <Chip tone={scoreTone(lead.score)}>{lead.score}</Chip>
                </td>
                <td>{lead.state || <span className="dim">—</span>}</td>
                <td>{lead.country || <span className="dim">—</span>}</td>
                <td className="hide-sm dim">{lead.contactEmail || '—'}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="dim" style={{ textAlign: 'center', padding: 18 }}>
                  No leads match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
