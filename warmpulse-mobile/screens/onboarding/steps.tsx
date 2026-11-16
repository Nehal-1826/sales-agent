import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, Mail, ArrowRight, ShieldCheck } from 'lucide-react-native';
import { wp, fonts } from '../../theme/tokens';
import { hexA } from '../../components/Glass';
import { ConnectMailbox } from '../app/connect/ConnectMailbox';

export type OnboardingState = {
  plan: string; volume: number; provider: string;
  email: string; appPassword: string;
  card: string; exp: string; cvc: string;
  connected: boolean; smtpFallback: boolean;
  /** id of the mailbox created in the Connect step — drives the real DNS check. */
  mailboxId?: string;
};

export function StepHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

function SelectCard({ active, tone, onPress, children }: { active: boolean; tone: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[s.card, { borderColor: active ? tone : wp.border, backgroundColor: active ? hexA(tone, 0.08) : 'rgba(18,18,18,0.5)' }]}>
      {children}
      <View style={[s.radio, { borderColor: active ? tone : wp.borderStrong }]}>{active && <View style={[s.radioDot, { backgroundColor: tone }]} />}</View>
    </Pressable>
  );
}

const PLANS = [
  { key: 'starter', name: 'Starter', price: '₹1,500', desc: '1 mailbox · 30/day' },
  { key: 'pro', name: 'Pro', price: '₹5,000', desc: '10 mailboxes · 50/day', popular: true },
  { key: 'proplus', name: 'Pro Plus', price: '₹8,000', desc: '15 mailboxes · 75/day' },
  { key: 'agency', name: 'Agency', price: '₹15,000', desc: 'Unlimited · white-label' },
];

export function PlanStep({ value, set }: { value: string; set: (v: string) => void }) {
  return (
    <View>
      <StepHeading eyebrow="STEP 1 · PLAN" title="Pick a plan" />
      <View style={{ gap: 10 }}>
        {PLANS.map((p) => (
          <SelectCard key={p.key} active={value === p.key} tone={wp.accent} onPress={() => set(p.key)}>
            <View style={{ flex: 1 }}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>{p.name}</Text>
                <Text style={[s.price, { color: wp.accent }]}>{p.price}<Text style={s.per}>/mo</Text></Text>
              </View>
              <Text style={s.cardDesc}>{p.desc}</Text>
            </View>
          </SelectCard>
        ))}
      </View>
    </View>
  );
}

const VOLUMES = [5, 10, 20, 35, 50];
export function VolumeStep({ value, set }: { value: number; set: (v: number) => void }) {
  return (
    <View>
      <StepHeading eyebrow="STEP 2 · VOLUME" title="Daily send target" />
      <Text style={s.help}>WarmPulse ramps up to this gradually over 30 days. You can change it later.</Text>
      <View style={s.chips}>
        {VOLUMES.map((v) => {
          const on = value === v;
          return (
            <Pressable key={v} onPress={() => set(v)} style={[s.chip, { borderColor: on ? wp.accent : wp.border, backgroundColor: on ? hexA(wp.accent, 0.12) : 'transparent' }]}>
              <Text style={[s.chipNum, { color: on ? wp.accent : wp.text }]}>{v}</Text>
              <Text style={s.chipLabel}>/ day</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export type ProviderAuth = 'oauth' | 'smtp';
export const PROVIDERS: { key: string; name: string; sub: string; auth: ProviderAuth; recommended?: boolean }[] = [
  { key: 'gmail', name: 'Gmail / Workspace', sub: 'One-click OAuth', auth: 'oauth', recommended: true },
  { key: 'outlook_oauth', name: 'Outlook (Microsoft OAuth)', sub: 'Beta · own-tenant testing', auth: 'oauth' },
  { key: 'outlook', name: 'Outlook / Office 365', sub: 'SMTP / IMAP w/ app password', auth: 'smtp' },
  { key: 'yahoo', name: 'Yahoo Mail', sub: 'SMTP / IMAP w/ app password', auth: 'smtp' },
  { key: 'zoho', name: 'Zoho Mail', sub: 'SMTP / IMAP w/ app password', auth: 'smtp' },
  { key: 'smtp', name: 'Generic SMTP / IMAP', sub: 'Fastmail, self-hosted, …', auth: 'smtp' },
];
export const providerAuth = (key: string): ProviderAuth => PROVIDERS.find((p) => p.key === key)?.auth ?? 'smtp';
export const providerName = (key: string): string => PROVIDERS.find((p) => p.key === key)?.name ?? key;

export function ProviderStep({ value, set }: { value: string; set: (v: string) => void }) {
  return (
    <View>
      <StepHeading eyebrow="STEP 3 · PROVIDER" title="Pick where your mailbox lives" />
      <Text style={s.help}>OAuth providers are most secure and don't need a password. SMTP/IMAP works with any provider that supports app passwords.</Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        {PROVIDERS.map((p) => {
          const on = value === p.key;
          const tone = p.auth === 'oauth' ? wp.accent : wp.warning;
          return (
            <Pressable key={p.key} onPress={() => set(p.key)} style={[s.provRow, { borderColor: on ? wp.accent : wp.border, backgroundColor: on ? hexA(wp.accent, 0.08) : 'rgba(18,18,18,0.5)' }]}>
              <View style={[s.provIcon, { backgroundColor: hexA(tone, on ? 0.2 : 0.12) }]}><Mail size={15} color={tone} strokeWidth={2} /></View>
              <View style={{ flex: 1 }}>
                <View style={s.provNameRow}>
                  <Text style={s.provName}>{p.name}</Text>
                  {p.recommended && <View style={s.recBadge}><Text style={s.recText}>RECOMMENDED</Text></View>}
                </View>
                <Text style={s.provSub}>{p.sub} · <Text style={{ color: tone, fontFamily: fonts.monoBold }}>{p.auth.toUpperCase()}</Text></Text>
              </View>
              {on ? <View style={s.provCheck}><Check size={12} color="#fff" strokeWidth={2.6} /></View> : <ArrowRight size={15} color={wp.textFaint} strokeWidth={2} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Step 4 — real mailbox connect via the shared app-password / SMTP flow.
 *  Detects the mail server from the domain, probes the credentials, and creates
 *  the mailbox on the backend. Once created we hold the new mailbox id so the
 *  DNS step can run a real SPF/DKIM/DMARC check against it. */
export function ConnectStep({ st, set, provider }: { st: OnboardingState; set: (patch: Partial<OnboardingState>) => void; provider?: string }) {
  const isOauth = provider && providerAuth(provider) === 'oauth';

  if (st.connected) {
    return (
      <View>
        <StepHeading eyebrow="STEP 4 · MAILBOX" title="Mailbox connected" />
        <View style={[s.connectCard, { borderColor: hexA(wp.success, 0.4) }]}>
          <View style={[s.connectIcon, { backgroundColor: hexA(wp.success, 0.16) }]}>
            <ShieldCheck size={18} color={wp.success} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.connectName}>{st.email}</Text>
            <Text style={s.connectSub}>Encrypted credentials stored · ready to warm up</Text>
          </View>
          <View style={s.connectedBadge}><Check size={13} color={wp.success} strokeWidth={2.6} /></View>
        </View>
        <Pressable onPress={() => set({ connected: false, mailboxId: undefined })} style={s.fallback}>
          <Text style={s.fallbackText}>Connect a different mailbox</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <StepHeading eyebrow="STEP 4 · MAILBOX" title="Connect your mailbox" />
      <Text style={s.help}>
        {isOauth
          ? 'Connect Gmail / Outlook with an app password. '
          : ''}
        Your app password is encrypted at rest — we only store an access token.
      </Text>
      <View style={{ marginTop: 14 }}>
        <ConnectMailbox
          provider={provider}
          dailyTarget={st.volume}
          ctaLabel="Connect mailbox"
          onConnected={(mbx) => set({ connected: true, mailboxId: mbx.id, email: mbx.email_address })}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 10, letterSpacing: 1.8, fontFamily: fonts.monoBold, marginBottom: 8 },
  title: { color: wp.text, fontSize: 26, fontFamily: fonts.sansBold, letterSpacing: -0.8 },
  help: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, lineHeight: 19, marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: wp.text, fontSize: 15, fontFamily: fonts.sansSemibold },
  cardDesc: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 3 },
  price: { fontSize: 15, fontFamily: fonts.monoBold },
  per: { color: wp.textFaint, fontSize: 10, fontFamily: fonts.mono },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  chip: { width: 88, paddingVertical: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  chipNum: { fontSize: 24, fontFamily: fonts.monoBold },
  chipLabel: { color: wp.textFaint, fontSize: 10, fontFamily: fonts.mono, marginTop: 2 },
  provRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  provIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  provNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  provName: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  provSub: { color: wp.textFaint, fontSize: 11, fontFamily: fonts.mono, marginTop: 3 },
  provCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: wp.accent, alignItems: 'center', justifyContent: 'center' },
  recBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: hexA(wp.success, 0.16) },
  recText: { color: wp.success, fontSize: 8, letterSpacing: 0.6, fontFamily: fonts.monoBold },
  connectCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: wp.border, backgroundColor: 'rgba(18,18,18,0.6)', marginTop: 18 },
  connectIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  connectName: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  connectSub: { color: wp.textFaint, fontSize: 11, fontFamily: fonts.mono, marginTop: 2 },
  connectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, minWidth: 96, paddingHorizontal: 14, borderRadius: 999 },
  connectBtnText: { color: '#fff', fontSize: 13, fontFamily: fonts.sansSemibold },
  connectedBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: hexA(wp.success, 0.18), alignItems: 'center', justifyContent: 'center' },
  smtpConnect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, marginTop: 8 },
  fallback: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: wp.border },
  fallbackText: { color: wp.textDim, fontSize: 12.5, fontFamily: fonts.sansSemibold },
});
