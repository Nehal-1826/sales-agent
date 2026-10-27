import { useEffect, useState } from 'react';
import { Banner, LoadError, Skeleton } from '../components/feedback';
import { PageHeader } from '../components/ui';
import { getSettings, isDemo } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import type { SettingsSection, SettingsState } from '../lib/types';
import { AccountSection } from './settings/AccountSection';
import { AdvancedSection } from './settings/AdvancedSection';
import { BusinessSection } from './settings/BusinessSection';
import { EmailSection } from './settings/EmailSection';
import { ScheduleSection } from './settings/ScheduleSection';
import { TargetingSection } from './settings/TargetingSection';
import { TemplatesSection } from './settings/TemplatesSection';

const SECTIONS: { key: SettingsSection; label: string; hint: string }[] = [
  { key: 'business', label: 'Your business', hint: 'Name, website, what you sell' },
  { key: 'targeting', label: 'Who to find', hint: 'Places and kinds of businesses' },
  { key: 'email', label: 'Email sending', hint: 'Connect your mailbox' },
  { key: 'templates', label: 'Email templates', hint: 'How emails start' },
  { key: 'schedule', label: 'Schedule & reports', hint: 'Autopilot and daily report' },
  { key: 'account', label: 'Account', hint: 'Password' },
  { key: 'advanced', label: 'Advanced', hint: 'AI key, mail server, AI instructions' },
];

/**
 * SETTINGS — one section at a time (deep-linkable: #/settings/email). Every
 * section saves only its own fields, so a profile switch or a chat command
 * made elsewhere is never overwritten by a stale form.
 */
export function SettingsPage({ section: raw }: { section: string }) {
  const section: SettingsSection = SECTIONS.some((s) => s.key === raw) ? (raw as SettingsSection) : 'business';
  const loaded = useAsync(getSettings);
  const [settings, setSettings] = useState<SettingsState | null>(null);

  useEffect(() => {
    if (loaded.data) setSettings(loaded.data);
  }, [loaded.data]);

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Set up your business, who to find and how emails go out." />
      {isDemo() && (
        <Banner tone="info" title="Offline demo">
          Changes can't be saved until your workspace is connected.
        </Banner>
      )}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`settings-nav-item${section === s.key ? ' active' : ''}`}
              aria-current={section === s.key ? 'page' : undefined}
              onClick={() => navigate('settings', s.key)}
            >
              <strong>{s.label}</strong>
              <small>{s.hint}</small>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'templates' ? (
            <TemplatesSection />
          ) : section === 'account' ? (
            <AccountSection />
          ) : loaded.loading ? (
            <section className="panel">
              <Skeleton rows={5} height={38} />
            </section>
          ) : !settings ? (
            <LoadError message={loaded.error ?? 'Settings are unavailable.'} onRetry={() => void loaded.reload()} />
          ) : section === 'business' ? (
            <BusinessSection settings={settings} onSaved={setSettings} />
          ) : section === 'targeting' ? (
            <TargetingSection settings={settings} onSaved={setSettings} />
          ) : section === 'email' ? (
            <EmailSection settings={settings} onSaved={setSettings} />
          ) : section === 'schedule' ? (
            <ScheduleSection settings={settings} onSaved={setSettings} />
          ) : (
            <AdvancedSection settings={settings} onSaved={setSettings} />
          )}
        </div>
      </div>
    </div>
  );
}
