import type { ReactNode } from 'react';

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** Grid track width, e.g. "2fr" | "120px". */
  width?: string;
  render: (row: T) => ReactNode;
}

export interface AdminDataTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  loadingText?: string;
  onRowClick?: (row: T) => void;
  activeRowKey?: string | null;
}

export function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyText = 'Nothing to show.',
  loadingText = 'Loading…',
  onRowClick,
  activeRowKey,
}: AdminDataTableProps<T>) {
  const template = columns.map((c) => c.width ?? '1fr').join(' ');
  return (
    <div className="ag-table">
      <div className="ag-table__row ag-table__row--head" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <div key={c.key}>{c.header}</div>
        ))}
      </div>
      {loading ? (
        <div className="ag-table__state">{loadingText}</div>
      ) : rows.length === 0 ? (
        <div className="ag-table__state">{emptyText}</div>
      ) : (
        rows.map((row) => {
          const key = rowKey(row);
          return (
            <div
              key={key}
              className={`ag-table__row ${onRowClick ? 'ag-table__row--click' : ''} ${activeRowKey === key ? 'ag-table__row--active' : ''}`}
              style={{ gridTemplateColumns: template }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <div key={c.key}>{c.render(row)}</div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
