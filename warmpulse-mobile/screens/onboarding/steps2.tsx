import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { ShieldCheck, CreditCard, Check, X, RefreshCw, Sparkles } from 'lucide-react-native';
import { wp, fonts } from '../../theme/tokens';
import { Field } from '../../components/Field';
import { hexA } from '../../components/Glass';
import { useMailboxDnsCheck } from '../../lib/mutations';
import { StepHeading, type OnboardingState } from './steps';

const RECORDS: { key: 'spf_valid' | 'dkim_valid' | 'dmarc_valid'; label: string }[] = [
  { key: 'spf_valid', label: 'SPF' },
  { key: 'dkim_valid', label: 'DKIM' },
  { key: 'dmarc_valid', label: 'DMARC' },
];

export function DnsStep({ mailboxId }: { mailboxId?: string }) {
  const dns = useMailboxDnsCheck();
  const [result, setResult] = useState<{ spf_valid?: boolean; dkim_valid?: boolean; dmarc_valid?: boolean } | null>(null);

  const run = () => {
    if (!mailboxId) return;
    dns.mutate(mailboxId, { onSuccess: setResult });
  };

  useEffect(() => {
    run();
    // run once per mailbox
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxId]);

  const scanning = dns.isPending;
  const allValid = !!result && RECORDS.every((r) => result[r.key]);

  return (
    <View>
      <StepHeading eyebrow="STEP 5 · DNS" title="Domain authentication" />
      <Text style={s.help}>We verify SPF, DKIM and DMARC so receivers trust your domain.</Text>
      <View style={{ gap: 10, marginTop: 16 }}>
        {RECORDS.map((r) => {
          const ok = result?.[r.key];
          return (
            <View key={r.key} style={s.dnsRow}>
              <Text style={s.dnsLabel}>{r.label}</Text>
              {scanning || !result ? (
                <ActivityIndicator size="small" color={wp.textFaint} />
              ) : ok ? (
                <View style={s.dnsOk}>
                  <View style={s.okDot}><Check size={11} color={wp.success} strokeWidth={2.6} /></View>
                  <Text style={s.okText}>Verified</Text>
                </View>
              ) : (
                <View style={s.dnsOk}>
                  <View style={[s.okDot, { backgroundColor: hexA(wp.warning, 0.18) }]}><X size={11} color={wp.warning} strokeWidth={2.6} /></View>
                  <Text style={[s.okText, { color: wp.warning }]}>Missing</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Pressable onPress={run} disabled={scanning || !mailboxId} style={s.rescan}>
        <RefreshCw size={13} color={wp.textDim} strokeWidth={2} />
        <Text style={s.rescanText}>{scanning ? 'Scanning…' : 'Re-check records'}</Text>
      </Pressable>
      {result && !scanning && (
        <View style={allValid ? s.banner : [s.banner, { borderColor: hexA(wp.warning, 0.3), backgroundColor: hexA(wp.warning, 0.08) }]}>
          <ShieldCheck size={15} color={allValid ? wp.success : wp.warning} strokeWidth={2} />
          <Text style={s.bannerText}>
            {allValid
              ? "All records valid — you're cleared to warm up."
              : 'Some records are missing. Warmup still starts; fix these in Tools → DNS for best deliverability.'}
          </Text>
        </View>
      )}
    </View>
  );
}

export function PaymentStep({ st, set }: { st: OnboardingState; set: (patch: Partial<OnboardingState>) => void }) {
  return (
    <View>
      <StepHeading eyebrow="STEP 6 · PAYMENT" title="Payment details" />
      <View style={s.betaNote}>
        <CreditCard size={14} color={wp.accent} strokeWidth={2} />
        <Text style={s.betaText}>Dummy gateway during beta — no real charge. 7-day money-back.</Text>
      </View>
      <View style={{ marginTop: 16 }}>
        <Field label="Card number" value={st.card} onChangeText={(t) => set({ card: t })} placeholder="4242 4242 4242 4242" keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Expiry" value={st.exp} onChangeText={(t) => set({ exp: t })} placeholder="MM/YY" keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="CVC" value={st.cvc} onChangeText={(t) => set({ cvc: t })} placeholder="123" keyboardType="number-pad" secure /></View>
        </View>
      </View>
    </View>
  );
}

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', pro: 'Pro', proplus: 'Pro Plus', agency: 'Agency' };
const PROV_LABEL: Record<string, string> = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', smtp: 'SMTP / IMAP' };

export function StartStep({ st }: { st: OnboardingState }) {
  const rows: [string, string][] = [
    ['Plan', PLAN_LABEL[st.plan] ?? '—'],
    ['Daily target', `${st.volume} / day`],
    ['Provider', PROV_LABEL[st.provider] ?? '—'],
    ['Mailbox', st.email || '—'],
    ['Domain auth', 'Verified ✓'],
  ];
  return (
    <View>
      <StepHeading eyebrow="STEP 7 · START" title="Ready to warm up" />
      <View style={s.summary}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[s.sumRow, i < rows.length - 1 && s.sumRowBorder]}>
            <Text style={s.sumKey}>{k}</Text>
            <Text style={s.sumVal}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={[s.banner, { backgroundColor: hexA(wp.accent, 0.1), borderColor: hexA(wp.accent, 0.3) }]}>
        <Sparkles size={15} color={wp.accent} strokeWidth={2} />
        <Text style={[s.bannerText, { color: wp.text }]}>Your peer network is ready. Warmth starts climbing within 24 hours.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  help: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, lineHeight: 19 },
  dnsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: wp.border, backgroundColor: 'rgba(18,18,18,0.5)' },
  dnsLabel: { color: wp.text, fontSize: 14, fontFamily: fonts.monoBold },
  dnsOk: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  okDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: hexA(wp.success, 0.18), alignItems: 'center', justifyContent: 'center' },
  okText: { color: wp.success, fontSize: 12, fontFamily: fonts.sansSemibold },
  rescan: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 7, marginTop: 16, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: wp.border },
  rescanText: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sansSemibold },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: hexA(wp.success, 0.3), backgroundColor: hexA(wp.success, 0.08) },
  bannerText: { color: wp.textDim, fontSize: 12.5, fontFamily: fonts.sans, flex: 1, lineHeight: 18 },
  betaNote: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: hexA(wp.accent, 0.3), backgroundColor: hexA(wp.accent, 0.08) },
  betaText: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, flex: 1, lineHeight: 17 },
  summary: { borderRadius: 14, borderWidth: 1, borderColor: wp.border, backgroundColor: 'rgba(18,18,18,0.5)', overflow: 'hidden' },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  sumRowBorder: { borderBottomWidth: 1, borderBottomColor: wp.border },
  sumKey: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans },
  sumVal: { color: wp.text, fontSize: 13, fontFamily: fonts.sansSemibold },
});
