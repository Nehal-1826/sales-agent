import { ScrollView, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Target, Radar, ShieldCheck, FileText, Mail } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { Row } from '../../../components/Row';
import { useT } from '../../../lib/i18n';
import { useToolNav } from '../tools-nav';

export function Tools() {
  const t = useT();
  const { open } = useToolNav();

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>{t('tools.eyebrow')}</Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 }}>{t('tools.heading')}</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass>
          <Row
            icon={Target}
            title={t('tools.placement')}
            subtitle={t('tools.placementSub')}
            accent={wp.accent}
            onPress={() => open('placement')}
          />
          <Row
            icon={Radar}
            title={t('tools.spam')}
            subtitle={t('tools.spamSub')}
            accent={wp.accent2}
            onPress={() => open('spam')}
          />
          <Row
            icon={ShieldCheck}
            title={t('tools.dns')}
            subtitle={t('tools.dnsSub')}
            accent={wp.success}
            onPress={() => open('dns')}
          />
          <Row
            icon={FileText}
            title={t('tools.template')}
            subtitle={t('tools.templateSub')}
            accent={wp.warning}
            onPress={() => open('template')}
          />
          <Row
            icon={Mail}
            title={t('tools.preview')}
            subtitle={t('tools.previewSub')}
            accent={wp.danger}
            onPress={() => open('preview')}
            last={true}
          />
        </Glass>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({});
