import React, { useState } from 'react';
import { Text, ScrollView, StyleSheet, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { PromptModal } from '../../../../components/PromptModal';
import { Settings, Shield, Zap, DollarSign, AlertTriangle, RefreshCw, KeyRound } from 'lucide-react-native';
import { useAdminSettings } from '../../../../lib/adminData';
import {
  useUpdateDefaults,
  useUpdateLlm,
  useRotateLlmKey,
  useTestLlm,
  useUpdateOauth,
  useTestOauth,
  useUpdateSmtp,
  useTestSmtp,
  useToggleMaintenance,
  useResetPeerHealth,
  type SmtpPatch,
} from '../../../../lib/adminMutations';

/** Which single-field edit prompt is open. */
type EditField =
  | { kind: 'ramp_day1'; label: string }
  | { kind: 'ramp_day7_target'; label: string }
  | { kind: 'human_delay_min_s'; label: string }
  | { kind: 'human_delay_max_s'; label: string }
  | { kind: 'warmup_log_retention_days'; label: string }
  | { kind: 'default_cap_tokens'; label: string }
  | { kind: 'llm_api_key'; label: string }
  | { kind: 'oauth_client_id'; label: string }
  | { kind: 'oauth_client_secret'; label: string }
  | { kind: 'smtp_host'; label: string }
  | { kind: 'smtp_port'; label: string }
  | { kind: 'smtp_username'; label: string }
  | { kind: 'smtp_password'; label: string }
  | { kind: 'smtp_from_addr'; label: string }
  | null;

/** SMTP edit kinds → SmtpPatch body keys (backend UpdateSmtpPayload). */
const SMTP_FIELD_MAP: Record<
  'smtp_host' | 'smtp_port' | 'smtp_username' | 'smtp_password' | 'smtp_from_addr',
  keyof SmtpPatch
> = {
  smtp_host: 'host',
  smtp_port: 'port',
  smtp_username: 'username',
  smtp_password: 'password',
  smtp_from_addr: 'from_addr',
};

export function AdminSettings2() {
  const q = useAdminSettings();
  const d = q.data;
  const [edit, setEdit] = useState<EditField>(null);

  const updateDefaults = useUpdateDefaults();
  const updateLlm = useUpdateLlm();
  const rotateKey = useRotateLlmKey();
  const testLlm = useTestLlm();
  const updateOauth = useUpdateOauth();
  const testOauth = useTestOauth();
  const updateSmtp = useUpdateSmtp();
  const testSmtp = useTestSmtp();
  const toggleMaint = useToggleMaintenance();
  const resetHealth = useResetPeerHealth();

  const ok = (m: string) => Alert.alert('Done', m);
  const fail = () => Alert.alert('Failed', 'Action did not complete. Try again.');

  function currentValue(): string {
    if (!edit) return '';
    switch (edit.kind) {
      case 'ramp_day1': return String(d?.defaults?.ramp_day1 ?? '');
      case 'ramp_day7_target': return String(d?.defaults?.ramp_day7_target ?? '');
      case 'human_delay_min_s': return String(d?.defaults?.human_delay_min_s ?? '');
      case 'human_delay_max_s': return String(d?.defaults?.human_delay_max_s ?? '');
      case 'warmup_log_retention_days': return String(d?.defaults?.warmup_log_retention_days ?? '');
      case 'default_cap_tokens': return String(d?.llm?.default_cap_tokens ?? '');
      case 'llm_api_key': return '';
      case 'oauth_client_id': return '';
      case 'oauth_client_secret': return '';
      case 'smtp_host': return d?.transactional_smtp?.host ?? '';
      case 'smtp_port': return '';
      case 'smtp_username': return '';
      case 'smtp_password': return '';
      case 'smtp_from_addr': return '';
      default: return '';
    }
  }

  function isNumeric(kind: EditField extends infer T ? T : never): boolean {
    if (!kind) return false;
    return ['ramp_day1', 'ramp_day7_target', 'human_delay_min_s', 'human_delay_max_s', 'warmup_log_retention_days', 'default_cap_tokens', 'smtp_port'].includes(
      (kind as { kind: string }).kind,
    );
  }

  function submitEdit(val: string) {
    if (!edit) return;
    const close = () => setEdit(null);
    const onOk = () => { ok('Saved.'); close(); };
    const onErr = () => Alert.alert('Failed', 'Could not save. Check the value.');

    switch (edit.kind) {
      case 'ramp_day1':
      case 'ramp_day7_target':
      case 'human_delay_min_s':
      case 'human_delay_max_s':
      case 'warmup_log_retention_days':
        updateDefaults.mutate({ [edit.kind]: Number(val) }, { onSuccess: onOk, onError: onErr });
        break;
      case 'default_cap_tokens':
        updateLlm.mutate({ default_cap_tokens: Number(val) }, { onSuccess: onOk, onError: onErr });
        break;
      case 'llm_api_key':
        updateLlm.mutate({ api_key: val }, { onSuccess: onOk, onError: onErr });
        break;
      case 'oauth_client_id':
        updateOauth.mutate({ client_id: val }, { onSuccess: onOk, onError: onErr });
        break;
      case 'oauth_client_secret':
        updateOauth.mutate({ client_secret: val }, { onSuccess: onOk, onError: onErr });
        break;
      case 'smtp_host':
      case 'smtp_port':
      case 'smtp_username':
      case 'smtp_password':
      case 'smtp_from_addr': {
        const patch: SmtpPatch =
          edit.kind === 'smtp_port' ? { port: Number(val) } : { [SMTP_FIELD_MAP[edit.kind]]: val };
        updateSmtp.mutate(patch, { onSuccess: onOk, onError: onErr });
        break;
      }
    }
  }

  function dangerActions() {
    Alert.alert('Danger zone', 'Pick an action', [
      {
        text: d?.danger?.maintenance_mode ? 'Turn maintenance OFF' : 'Turn maintenance ON',
        onPress: () =>
          toggleMaint.mutate(!d?.danger?.maintenance_mode, { onSuccess: () => ok('Maintenance toggled.'), onError: fail }),
      },
      {
        text: 'Rotate LLM key',
        onPress: () =>
          Alert.alert('Rotate LLM key', 'Drop the stored LLM key? LLM warmup falls back to the next provider.', [
            { text: 'Rotate', style: 'destructive', onPress: () => rotateKey.mutate(undefined, { onSuccess: () => ok('LLM key cleared.'), onError: fail }) },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      {
        text: 'Reset all peer health',
        onPress: () =>
          Alert.alert('Reset peer health', 'Reset reputation + daily counters for ALL peers? Use with care.', [
            { text: 'Reset all', style: 'destructive', onPress: () => resetHealth.mutate(undefined, { onSuccess: () => ok('Peer health reset.'), onError: fail }) },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function integrationsActions() {
    Alert.alert('LLM provider', 'Test or update the LLM key', [
      { text: 'Test LLM', onPress: () => testLlm.mutate(undefined, { onSuccess: (r) => Alert.alert('LLM test', r.ok ? 'OK' : `Failed: ${r.error ?? ''}`), onError: fail }) },
      { text: 'Edit API key', onPress: () => setEdit({ kind: 'llm_api_key', label: 'LLM API key' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function oauthActions() {
    Alert.alert('Google OAuth', 'Test or update the OAuth client', [
      { text: 'Edit client ID', onPress: () => setEdit({ kind: 'oauth_client_id', label: 'Google OAuth client ID' }) },
      { text: 'Edit client secret', onPress: () => setEdit({ kind: 'oauth_client_secret', label: 'Google OAuth client secret' }) },
      { text: 'Test', onPress: () => testOauth.mutate(undefined, { onSuccess: (r) => Alert.alert('OAuth test', r.ok ? 'OK' : `Failed: ${r.error ?? ''}`), onError: fail }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const numPad = { keyboardType: 'number-pad' as const };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Platform Settings</Text>
      </Animated.View>

      <Async loading={q.isLoading} error={q.isError} isEmpty={!d} onRetry={q.refetch}>
        <Animated.View entering={FadeInUp.duration(450).delay(60)}>
          <Glass style={{ marginTop: 4 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>INTEGRATIONS</Text>
            <Row
              icon={Settings}
              title="Google OAuth"
              value={d?.google_oauth?.configured ? 'Configured' : 'Not set'}
              accent={d?.google_oauth?.configured ? wp.success : wp.textFaint}
              onPress={oauthActions}
            />
            <Row
              icon={Zap}
              title="LLM provider"
              value={d?.llm?.configured ? 'Configured' : 'Not set'}
              accent={d?.llm?.configured ? wp.success : wp.textFaint}
              onPress={integrationsActions}
            />
            <Row
              icon={Shield}
              title="Transactional SMTP"
              subtitle={d?.transactional_smtp?.host ?? ''}
              value={d?.transactional_smtp?.mode ?? '—'}
              accent={d?.transactional_smtp?.configured ? wp.success : wp.textFaint}
              onPress={() => Alert.alert('SMTP', 'Edit which field?', [
                { text: 'Host', onPress: () => setEdit({ kind: 'smtp_host', label: 'SMTP host' }) },
                { text: 'Port', onPress: () => setEdit({ kind: 'smtp_port', label: 'SMTP port' }) },
                { text: 'Username', onPress: () => setEdit({ kind: 'smtp_username', label: 'SMTP username' }) },
                { text: 'Password', onPress: () => setEdit({ kind: 'smtp_password', label: 'SMTP password' }) },
                { text: 'From address', onPress: () => setEdit({ kind: 'smtp_from_addr', label: 'From address' }) },
                { text: 'Test (sends email)', onPress: () => testSmtp.mutate(undefined, { onSuccess: (r) => Alert.alert('SMTP test', r.ok ? 'Sent.' : `Failed: ${r.error ?? r.detail ?? ''}`), onError: fail }) },
                { text: 'Cancel', style: 'cancel' },
              ])}
              last
            />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(120)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>WARMUP DEFAULTS</Text>
            <Row icon={Settings} title="Day 1 sends" value={String(d?.defaults?.ramp_day1 ?? '—')} onPress={() => setEdit({ kind: 'ramp_day1', label: 'Day 1 sends' })} />
            <Row icon={Settings} title="Day 7 target" value={String(d?.defaults?.ramp_day7_target ?? '—')} onPress={() => setEdit({ kind: 'ramp_day7_target', label: 'Day 7 target' })} />
            <Row icon={Settings} title="Human delay min (s)" value={String(d?.defaults?.human_delay_min_s ?? '—')} onPress={() => setEdit({ kind: 'human_delay_min_s', label: 'Min delay (seconds)' })} />
            <Row icon={Settings} title="Human delay max (s)" value={String(d?.defaults?.human_delay_max_s ?? '—')} onPress={() => setEdit({ kind: 'human_delay_max_s', label: 'Max delay (seconds)' })} />
            <Row icon={Settings} title="Log retention (days)" value={String(d?.defaults?.warmup_log_retention_days ?? '—')} onPress={() => setEdit({ kind: 'warmup_log_retention_days', label: 'Retention (days)' })} last />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(180)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>LLM SPEND</Text>
            <Row icon={DollarSign} title="Spend MTD" value={`$${(d?.llm?.spend_mtd_usd ?? 0).toFixed(2)}`} accent={wp.accent2} />
            <Row icon={KeyRound} title="Default cap (tokens)" value={(d?.llm?.default_cap_tokens ?? 0).toLocaleString()} accent={wp.accent2} onPress={() => setEdit({ kind: 'default_cap_tokens', label: 'Default token cap' })} />
            <Row icon={RefreshCw} title="Rotate LLM key" subtitle="Clear stored key → fallback provider" accent={wp.warning} onPress={() => Alert.alert('Rotate LLM key', 'Drop the stored LLM key?', [
              { text: 'Rotate', style: 'destructive', onPress: () => rotateKey.mutate(undefined, { onSuccess: () => ok('LLM key cleared.'), onError: fail }) },
              { text: 'Cancel', style: 'cancel' },
            ])} last />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>DANGER</Text>
            <Row icon={AlertTriangle} title="Maintenance mode" value={d?.danger?.maintenance_mode ? 'ON' : 'Off'} accent={d?.danger?.maintenance_mode ? wp.danger : wp.textFaint} onPress={() =>
              toggleMaint.mutate(!d?.danger?.maintenance_mode, { onSuccess: () => ok('Maintenance toggled.'), onError: fail })
            } />
            <Row icon={AlertTriangle} title="Reset all peer health" subtitle="Reputation + counters → defaults" accent={wp.danger} onPress={() =>
              Alert.alert('Reset peer health', 'Reset reputation + daily counters for ALL peers?', [
                { text: 'Reset all', style: 'destructive', onPress: () => resetHealth.mutate(undefined, { onSuccess: () => ok('Peer health reset.'), onError: fail }) },
                { text: 'Cancel', style: 'cancel' },
              ])
            } last />
          </Glass>
        </Animated.View>
      </Async>

      <PromptModal
        visible={!!edit}
        title={edit?.label ?? ''}
        initialValue={currentValue()}
        {...(edit && isNumeric(edit as never) ? numPad : {})}
        submitLabel="Save"
        busy={updateDefaults.isPending || updateLlm.isPending || updateOauth.isPending || updateSmtp.isPending}
        onSubmit={submitEdit}
        onClose={() => setEdit(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
});
