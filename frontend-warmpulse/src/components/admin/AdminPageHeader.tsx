import type { ReactNode } from 'react';

export interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned action cluster (search, buttons). */
  actions?: ReactNode;
}

/** Standard section header: title + subtitle on the left, actions on the right. */
export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <header className="ag-header">
      <div>
        <h1 className="ag-header__title">{title}</h1>
        {subtitle != null && <p className="ag-header__sub">{subtitle}</p>}
      </div>
      {actions != null && <div className="ag-header__actions">{actions}</div>}
    </header>
  );
}
