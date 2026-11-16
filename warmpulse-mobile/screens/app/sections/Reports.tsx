import { ScrollView, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { Row } from '../../../components/Row';
import { Async } from '../../../components/Async';
import { useReports, type GeneratedReport, type ScheduledReport } from '../../../lib/data';
import { useGenerateReport } from '../../../lib/mutations';
import { useT } from '../../../lib/i18n';
import { API_BASE_URL } from '../../../lib/config';
import { downloadAndOpenFile, getReportFilename } from '../../../lib/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { FileText, FileSpreadsheet, Download, Plus } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function openReport(report: GeneratedReport) {
  try {
    const url = report.download_url;
    if (!url) {
      Alert.alert('No download link', 'This report does not have a download link.');
      return;
    }
    const absolute = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
    const reportDate = report.created_at ? new Date(report.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const filename = getReportFilename(report.type, report.format ?? 'pdf', reportDate);
    await downloadAndOpenFile(absolute, filename);
  } catch (error) {
    Alert.alert('Download failed', error instanceof Error ? error.message : 'Could not download the report. Try again.');
  }
}

function scheduledSubtitle(r: ScheduledReport): string {
  const parts = [cap(r.frequency)];
  const count = r.recipients?.length ?? 0;
  parts.push(`${count} recipient${count === 1 ? '' : 's'}`);
  const next = shortDate(r.next_run_at);
  if (next) parts.push(`next ${next}`);
  return parts.join(' · ');
}

function generatedSubtitle(r: GeneratedReport): string {
  const created = shortDate(r.created_at);
  const base = `${r.range} · ${(r.format ?? '').toUpperCase()}`;
  return created ? `${base} · ${created}` : base;
}

export function Reports() {
  const t = useT();
  const q = useReports();
  const gen = useGenerateReport();
  const generated = q.data?.generated ?? [];
  const scheduled = q.data?.scheduled ?? [];

  const generate = (type: string) => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    gen.mutate(
      { type, format: 'pdf', from, to },
      {
        onSuccess: () =>
          Alert.alert(
            'Report generating',
            'Your ' + type + ' report (last 30 days) is being prepared. It will appear in the list.',
          ),
        onError: () => Alert.alert('Failed', 'Could not start the report. Try again.'),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>
          {t('rep.eyebrow')}
        </Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 }}>
          {t('rep.heading')}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass style={styles.card}>
          <View style={styles.scheduledHeader}>
            <Text style={{ color: wp.text, fontSize: 13, fontFamily: fonts.sansSemibold }}>{t('rep.scheduled')}</Text>
            <Pressable
              disabled={gen.isPending}
              onPress={() =>
                Alert.alert('New report', 'Choose a report type', [
                  { text: 'Warmth', onPress: () => generate('warmth') },
                  { text: 'Engagement', onPress: () => generate('engagement') },
                  { text: 'Placement', onPress: () => generate('placement') },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            >
              <LinearGradient
                colors={[wp.accent, wp.accentHover]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.newReportBtn}
              >
                <Plus size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.newReportText}>{t('rep.newReport')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Async
            loading={q.isLoading}
            error={q.isError ? q.error : undefined}
            isEmpty={scheduled.length === 0}
            emptyText={t('rep.emptyScheduled')}
            onRetry={q.refetch}
          >
            {scheduled.map((r, i) => (
              <Row
                key={r.id}
                icon={r.frequency === 'monthly' ? FileSpreadsheet : FileText}
                title={cap(r.type)}
                subtitle={scheduledSubtitle(r)}
                value={cap(r.frequency)}
                last={i === scheduled.length - 1}
              />
            ))}
          </Async>
        </Glass>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Glass style={styles.card}>
          <Text style={styles.eyebrow}>{t('rep.recentExports')}</Text>
          <Async
            loading={q.isLoading}
            error={q.isError ? q.error : undefined}
            isEmpty={generated.length === 0}
            emptyText={t('rep.emptyGenerated')}
            onRetry={q.refetch}
          >
            {generated.map((r, i) => (
              <Row
                key={r.id}
                icon={Download}
                title={`${cap(r.type)} · ${r.range}`}
                subtitle={generatedSubtitle(r)}
                value={(r.format ?? '').toUpperCase()}
                onPress={r.download_url ? () => openReport(r) : undefined}
                last={i === generated.length - 1}
              />
            ))}
          </Async>
        </Glass>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  scheduledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  newReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  newReportText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.sansSemibold,
  },
  eyebrow: {
    color: wp.textDim,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 1.2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
});
