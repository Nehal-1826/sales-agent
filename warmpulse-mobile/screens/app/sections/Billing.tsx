import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Switch, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, CreditCard, Download, ArrowRight, Mail, Zap, Repeat, FileText } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { Row } from '../../../components/Row';
import { Async } from '../../../components/Async';
import { useAuth } from '../../../lib/auth';
import { usePayments, useUsage, useBillingStatus, usePlans, type PlanOut } from '../../../lib/data';
import { useQuickUpgrade, useSetAutoPay } from '../../../lib/mutations';
import { useT } from '../../../lib/i18n';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const inr = (cents: number) => `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;

function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Billing() {
  const t = useT();
  const { user, refreshUser } = useAuth();
  const planName = user?.plan ?? 'Starter';

  const plansQ = usePlans();
  const usageQ = useUsage();
  const paymentsQ = usePayments();
  const billingQ = useBillingStatus();
  const upgrade = useQuickUpgrade();
  const setAutoPay = useSetAutoPay();

  const [autoPayLocal, setAutoPayLocal] = useState(billingQ.data?.auto_pay_enabled ?? false);

  // Update local state when billing data loads
  React.useEffect(() => {
    if (billingQ.data !== undefined) {
      setAutoPayLocal(billingQ.data.auto_pay_enabled);
    }
  }, [billingQ.data]);

  const onToggleAutoPay = (value: boolean) => {
    setAutoPayLocal(value);
    setAutoPay.mutate(value, {
      onSuccess: () => {
        // Optimistic update already done
      },
      onError: () => {
        setAutoPayLocal(!value); // Revert on error
        Alert.alert('Error', 'Failed to update auto-pay setting. Please try again.');
      },
    });
  };

  const currentPlan: PlanOut | undefined = (plansQ.data ?? []).find(
    (p) => norm(p.name) === norm(planName),
  );

  // Plans sorted ascending by sort_order (fallback price_cents).
  const sortedPlans: PlanOut[] = [...(plansQ.data ?? [])].sort((a, b) => {
    const ao = a.sort_order ?? a.price_cents;
    const bo = b.sort_order ?? b.price_cents;
    return ao - bo;
  });
  const currentIdx = sortedPlans.findIndex((p) => norm(p.name) === norm(planName));
  const currentSorted = currentIdx >= 0 ? sortedPlans[currentIdx] : undefined;
  // Next tier: first plan priced above the current one, else the next in sorted order.
  const nextPlan: PlanOut | undefined = currentSorted
    ? sortedPlans.find((p) => p.price_cents > currentSorted.price_cents) ??
      sortedPlans[currentIdx + 1]
    : undefined;

  const onUpgrade = (targetPlan: PlanOut) => {
    const isCurrent = norm(targetPlan.name) === norm(planName);
    if (isCurrent) {
      Alert.alert('Current Plan', 'You are already on the ' + targetPlan.name + ' plan.');
      return;
    }
    Alert.alert(
      'Upgrade to ' + targetPlan.name + '?',
      'You will be moved to ' +
        targetPlan.name +
        ' (₹' +
        Math.round(targetPlan.price_cents / 100).toLocaleString('en-IN') +
        '/mo).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: () =>
            upgrade.mutate(targetPlan.id, {
              onSuccess: async () => {
                await refreshUser();
                Alert.alert('Upgraded', 'You are now on ' + targetPlan.name + '.');
              },
              onError: () =>
                Alert.alert('Upgrade failed', 'Could not upgrade right now. Try again.'),
            }),
        },
      ],
    );
  };
  const priceLabel =
    currentPlan && typeof currentPlan.price_cents === 'number'
      ? `₹${(currentPlan.price_cents / 100).toLocaleString('en-IN')}`
      : null;

  const planFeatures = currentPlan?.capabilities?.features;
  const features =
    Array.isArray(planFeatures) && planFeatures.length > 0 ? planFeatures : null;

  const usage = usageQ.data;
  const billing = billingQ.data;
  const payments = paymentsQ.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrowHeader}>{t('bill.eyebrow')}</Text>
        <Text style={styles.pageTitle}>{t('bill.heading')}</Text>
      </Animated.View>

      {/* Current Plan Card */}
      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass accent={wp.accent} style={styles.cardSpacing}>
          <Text style={styles.eyebrow}>{t('bill.currentPlan')}</Text>

          <View style={styles.planRow}>
            <Text style={styles.planName}>{planName}</Text>
            {priceLabel ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>{priceLabel}</Text>
                <Text style={styles.priceUnit}>{t('bill.perMonth')}</Text>
              </View>
            ) : null}
          </View>

          {billing?.next_billing_date ? (
            <Text style={styles.renewText}>{t('bill.renews', { date: shortDate(billing.next_billing_date) })}</Text>
          ) : null}

          {features ? (
            <View style={styles.featuresList}>
              {features.map((feature, idx) => (
                <View key={idx} style={styles.featureItem}>
                  <Check size={14} color={wp.accent} strokeWidth={2.5} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Glass>
      </Animated.View>

      {/* Plan Selection Cards */}
      <Animated.View entering={FadeInUp.duration(450).delay(100)}>
        <Text style={styles.eyebrowHeader}>{t('bill.availablePlans')}</Text>
        <Async loading={plansQ.isLoading} error={plansQ.error} onRetry={() => plansQ.refetch()}>
          <View style={styles.plansGrid}>
            {sortedPlans.map((plan, idx) => {
              const isCurrent = norm(plan.name) === norm(planName);
              const planFeatures = plan.capabilities?.features ?? [];
              return (
                <Pressable
                  key={plan.id}
                  style={[styles.planCard, isCurrent && styles.planCardCurrent]}
                  onPress={() => !isCurrent && onUpgrade(plan)}
                  disabled={upgrade.isPending || isCurrent}
                  android_ripple={{ color: hexA(wp.accent, 0.1), borderless: false }}
                >
                  <LinearGradient
                    colors={isCurrent ? [hexA(wp.accent, 0.15), hexA(wp.accent, 0.05)] : ['transparent', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.planCardGradient}
                  >
                    <View style={styles.planCardHeader}>
                      <Text style={[styles.planCardName, isCurrent && styles.planCardNameCurrent]}>
                        {plan.name}
                      </Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.planCardPrice}>
                      <Text style={[styles.planCardPriceAmount, isCurrent && styles.planCardPriceAmountCurrent]}>
                        ₹{(plan.price_cents / 100).toLocaleString('en-IN')}
                      </Text>
                      <Text style={[styles.planCardPriceUnit, isCurrent && styles.planCardPriceUnitCurrent]}>
                        /month
                      </Text>
                    </View>

                    <View style={styles.planCardFeatures}>
                      {planFeatures.slice(0, 4).map((feature, fIdx) => (
                        <View key={fIdx} style={styles.planFeatureItem}>
                          <Check size={12} color={isCurrent ? wp.accent : wp.textDim} strokeWidth={2} />
                          <Text style={[styles.planFeatureText, isCurrent && styles.planFeatureTextCurrent]}>
                            {feature}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {!isCurrent && (
                      <View style={[styles.planCardBtn, upgrade.isPending && styles.planCardBtnDisabled]}>
                        <Text style={styles.planCardBtnText}>
                          {upgrade.isPending ? 'Processing...' : 'Upgrade'}
                        </Text>
                        <ArrowRight size={14} color="#FFFFFF" strokeWidth={2} style={{ marginLeft: 4 }} />
                      </View>
                    )}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        </Async>
      </Animated.View>

      {/* Usage Card */}
      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Glass style={styles.cardSpacing}>
          <Text style={styles.eyebrow}>{t('bill.usageMonth')}</Text>
          <Async loading={usageQ.isLoading} error={usageQ.error} onRetry={() => usageQ.refetch()}>
            {usage ? (
              <>
                <Row
                  icon={Mail}
                  title={t('bill.mailboxes')}
                  value={`${usage.mailboxes_used} / ${usage.mailboxes_cap}`}
                />
                <Row
                  icon={Zap}
                  title={t('bill.warmupEmailsSent')}
                  value={usage.warmup_emails_sent_mtd.toLocaleString('en-IN')}
                />
                <Row
                  icon={Repeat}
                  title={t('bill.aiTokens')}
                  value={`${usage.llm_tokens_used_mtd.toLocaleString('en-IN')} / ${usage.llm_tokens_cap.toLocaleString('en-IN')}`}
                  last={true}
                />
              </>
            ) : null}
          </Async>
        </Glass>
      </Animated.View>

      {/* Auto-pay Card */}
      <Animated.View entering={FadeInUp.duration(450).delay(240)}>
        <Glass style={styles.cardSpacing}>
          <Text style={styles.eyebrow}>{t('bill.paymentMethod')}</Text>
          <Async loading={billingQ.isLoading} error={billingQ.error} onRetry={() => billingQ.refetch()}>
            {billing ? (
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <CreditCard size={18} color={wp.accent} strokeWidth={2} />
                  <View style={styles.toggleText}>
                    <Text style={styles.toggleTitle}>{t('bill.autoPay')}</Text>
                    <Text style={styles.toggleSubtitle}>
                      {billing.auto_pay_enabled ? 'Automatic renewal enabled' : 'Manual renewal required'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={autoPayLocal}
                  onValueChange={onToggleAutoPay}
                  disabled={setAutoPay.isPending}
                  trackColor={{ true: wp.accent, false: wp.border }}
                  thumbColor="#fff"
                />
              </View>
            ) : null}
          </Async>
          {billing?.next_billing_date ? (
            <Row
              icon={Download}
              title={t('bill.nextBilling')}
              value={shortDate(billing.next_billing_date)}
              last={true}
            />
          ) : null}
        </Glass>
      </Animated.View>

      {/* Payment History Card */}
      <Animated.View entering={FadeInUp.duration(450).delay(320)}>
        <Glass style={styles.cardSpacing}>
          <Text style={styles.eyebrow}>{t('bill.paymentHistory')}</Text>
          <Async
            loading={paymentsQ.isLoading}
            error={paymentsQ.error}
            isEmpty={payments.length === 0}
            emptyText={t('bill.noPayments')}
            onRetry={() => paymentsQ.refetch()}
          >
            {payments.map((p, idx) => {
              const method = p.payment_method ? ` · ${p.payment_method}` : '';
              const isSuccess = p.status.toLowerCase() === 'succeeded';
              return (
                <View key={p.id} style={[styles.invoiceRow, !isSuccess && styles.invoiceRowFailed]}>
                  <View style={styles.invoiceRowLeft}>
                    <FileText size={16} color={isSuccess ? wp.accent : wp.danger} strokeWidth={2} />
                    <View style={styles.invoiceInfo}>
                      <Text style={styles.invoicePlan}>{p.plan_name ?? 'Payment'}</Text>
                      <Text style={styles.invoiceMeta}>
                        {shortDate(p.created_at)} · {p.status}{method}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.invoiceRight}>
                    <Text style={styles.invoiceAmount}>{inr(p.amount_cents)}</Text>
                  </View>
                </View>
              );
            })}
          </Async>
        </Glass>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrowHeader: {
    color: wp.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: fonts.monoBold,
    marginBottom: 6,
  },
  pageTitle: {
    color: wp.text,
    fontSize: 24,
    fontFamily: fonts.sansBold,
    letterSpacing: -0.5,
    marginBottom: 18,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  eyebrow: {
    color: wp.textFaint,
    fontSize: 10,
    letterSpacing: 1.4,
    fontFamily: fonts.monoBold,
    marginBottom: 14,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  planName: {
    color: wp.text,
    fontSize: 20,
    fontFamily: fonts.sansBold,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    color: wp.accent,
    fontSize: 20,
    fontFamily: fonts.monoBold,
  },
  priceUnit: {
    color: wp.textDim,
    fontSize: 13,
    fontFamily: fonts.mono,
    marginLeft: 2,
  },
  renewText: {
    color: wp.textFaint,
    fontSize: 12,
    fontFamily: fonts.sans,
    marginBottom: 16,
  },
  featuresList: {
    marginBottom: 20,
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: wp.textDim,
    fontSize: 13,
    fontFamily: fonts.sans,
  },
  upgradeBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradientBtn: {
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: fonts.sansSemibold,
  },
  plansGrid: {
    gap: 12,
    marginBottom: 16,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: wp.border,
    overflow: 'hidden',
    backgroundColor: hexA(wp.surface, 0.3),
  },
  planCardCurrent: {
    borderColor: wp.accent,
    borderWidth: 1.5,
  },
  planCardGradient: {
    padding: 16,
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planCardName: {
    color: wp.text,
    fontSize: 16,
    fontFamily: fonts.sansBold,
  },
  planCardNameCurrent: {
    color: wp.accent,
  },
  currentBadge: {
    backgroundColor: hexA(wp.accent, 0.15),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: wp.accent,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
  },
  planCardPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  planCardPriceAmount: {
    color: wp.text,
    fontSize: 24,
    fontFamily: fonts.monoBold,
  },
  planCardPriceAmountCurrent: {
    color: wp.accent,
  },
  planCardPriceUnit: {
    color: wp.textDim,
    fontSize: 13,
    fontFamily: fonts.sans,
    marginLeft: 2,
  },
  planCardPriceUnitCurrent: {
    color: wp.accent,
  },
  planCardFeatures: {
    gap: 6,
    marginBottom: 12,
  },
  planFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planFeatureText: {
    color: wp.textDim,
    fontSize: 12,
    fontFamily: fonts.sans,
    flex: 1,
  },
  planFeatureTextCurrent: {
    color: wp.text,
  },
  planCardBtn: {
    backgroundColor: wp.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  planCardBtnDisabled: {
    opacity: 0.6,
  },
  planCardBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: fonts.sansSemibold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    color: wp.text,
    fontSize: 14,
    fontFamily: fonts.sansSemibold,
  },
  toggleSubtitle: {
    color: wp.textDim,
    fontSize: 12,
    fontFamily: fonts.sans,
    marginTop: 2,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: wp.border,
  },
  invoiceRowFailed: {
    opacity: 0.7,
  },
  invoiceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoicePlan: {
    color: wp.text,
    fontSize: 14,
    fontFamily: fonts.sansSemibold,
  },
  invoiceMeta: {
    color: wp.textDim,
    fontSize: 12,
    fontFamily: fonts.sans,
    marginTop: 2,
  },
  invoiceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  invoiceAmount: {
    color: wp.text,
    fontSize: 14,
    fontFamily: fonts.monoBold,
  },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexA(wp.accent, 0.08),
  },
  downloadBtnPressed: {
    opacity: 0.7,
  },
});
