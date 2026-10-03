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

const SCORE_FILTERS = [
  { value: '0', label: 'Any score' },
  { value: '40', label: '40+' },
  { value: '55', label: '55+' },
  { value: '65', label: '65+ (potential)' },
  { value: '80', label: '80+ (hot)' },
];

function scoreTone(score: number): 'success' | 'warn' | 'accent' {
  if (score >= 80) return 'success';
  if (score >= 65) return 'warn';
  return 'accent';
}

/**
 * LEADS · REGION — every lead with its region + audit metadata. Sortable
 * column-wise; filter by search text, industry, country/state, web presence,
 * contact availability and minimum score (mirrors the Django Admin filters).
 */
export function LeadsGeo({ refreshToken = 0 }: { refreshToken?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState(''); // '' = all
  const [state, setState] = useState(''); // '' = all
  const [presence, setPresence] = useState(''); // '' | 'website' | 'no-website'
  const [contact, setContact] = useState(''); // '' | 'has' | 'missing'
  const [minScore, setMinScore] = useState(0);

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
  // states scoped to the selected country (all states when no country chosen)
  const states = useMemo(
    () => [
      ...new Set(
        leads
          .filter((l) => !country || l.country === country)
          .map((l) => l.state)
          .filter(Boolean),
      ),
    ].sort(),
    [leads, country],
  );
  const industries = useMemo(
    () => [...new Set(leads.map((l) => l.industry).filter(Boolean))].sort(),
    [leads],
  );

  // keep State valid when the country changes (its state list shrank)
  useEffect(() => {
    if (state && !states.includes(state)) setState('');
  }, [states, state]);

  const activeFilters =
    (search ? 1 : 0) + (industry ? 1 : 0) + (country ? 1 : 0) + (state ? 1 : 0) +
    (presence ? 1 : 0) + (contact ? 1 : 0) + (minScore > 0 ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setIndustry('');
    setCountry('');
    setState('');
    setPresence('');
    setContact('');
    setMinScore(0);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = leads.filter((l) => {
      if (country && l.country !== country) return false;
      if (state && l.state !== state) return false;
      if (industry && l.industry !== industry) return false;
      if (presence === 'website' && !l.hasWebsite) return false;
      if (presence === 'no-website' && l.hasWebsite) return false;
      if (contact === 'has' && !l.contactEmail) return false;
      if (contact === 'missing' && l.contactEmail) return false;
      if (l.score < minScore) return false;
      if (q) {
        const hay = `${l.company} ${l.website} ${l.contactEmail} ${l.industry}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
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
  }, [leads, search, industry, country, state, presence, contact, minScore, sortKey, sortDir]);

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
          Search
          <input
            className="select-sm"
            placeholder="company, site or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Industry
          <select className="input select-sm" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">All ({industries.length})</option>
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
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
        <label>
          Web presence
          <select className="input select-sm" value={presence} onChange={(e) => setPresence(e.target.value)}>
            <option value="">All</option>
            <option value="website">Has website</option>
            <option value="no-website">No website</option>
          </select>
        </label>
        <label>
          Contact
          <select className="input select-sm" value={contact} onChange={(e) => setContact(e.target.value)}>
            <option value="">All</option>
            <option value="has">Has email</option>
            <option value="missing">Missing email</option>
          </select>
        </label>
        <label>
          Min score
          <select
            className="input select-sm"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          >
            {SCORE_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        {activeFilters > 0 && (
          <button className="btn btn-ghost" onClick={resetFilters}>
            Clear filters ({activeFilters})
          </button>
        )}
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
