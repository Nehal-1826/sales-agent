/**
 * App i18n + country standard. A LocaleProvider holds the selected standard
 * (country) and exposes the active language + a `t()` translator. Switching a
 * standard switches the UI language; persisted via AsyncStorage.
 *
 * Mirrors the website's lib/countries + lib/i18n. The app is INR-focused, so a
 * standard here primarily drives language (and is the hook point for currency
 * later). Add a language by adding its catalog below — every t('…') localizes.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'hi';
export type StandardId = 'IN-en' | 'IN-hi' | 'US' | 'GB' | 'AE' | 'DE' | 'AU' | 'CA' | 'SG';

export interface CountryStandard {
  id: StandardId;
  flag: string;
  label: string;
  language: Language;
}

export const COUNTRY_STANDARDS: CountryStandard[] = [
  { id: 'IN-en', flag: '🇮🇳', label: 'India · English', language: 'en' },
  { id: 'IN-hi', flag: '🇮🇳', label: 'भारत · हिंदी', language: 'hi' },
  { id: 'US', flag: '🇺🇸', label: 'United States', language: 'en' },
  { id: 'GB', flag: '🇬🇧', label: 'United Kingdom', language: 'en' },
  { id: 'AE', flag: '🇦🇪', label: 'UAE', language: 'en' },
  { id: 'DE', flag: '🇩🇪', label: 'Germany', language: 'en' },
  { id: 'AU', flag: '🇦🇺', label: 'Australia', language: 'en' },
  { id: 'CA', flag: '🇨🇦', label: 'Canada', language: 'en' },
  { id: 'SG', flag: '🇸🇬', label: 'Singapore', language: 'en' },
];

function standardById(id: string): CountryStandard {
  return COUNTRY_STANDARDS.find((s) => s.id === id) ?? COUNTRY_STANDARDS[0]!;
}

const en: Record<string, string> = {
  'nav.dashboard': 'Dashboard',
  'nav.mailboxes': 'Mailboxes',
  'nav.activity': 'Activity',
  'nav.stats': 'Stats',
  'nav.tools': 'Tools',
  'nav.reports': 'Reports',
  'nav.leads': 'Leads',
  'nav.settings': 'Settings',
  'nav.billing': 'Billing',
  'auth.signInTo': 'Sign in to',
  'auth.welcomeBack': 'WELCOME BACK',
  'auth.signIn': 'Sign in',
  'auth.createAccount': 'Create account',
  'auth.startFree': 'START FREE',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.fullName': 'Full name',
  'auth.later': 'Later',
  'common.update': 'Update now',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.retry': 'Retry',
  'common.language': 'Country & language',
  // Dashboard
  'dash.planSuffix': 'PLAN',
  'dash.yourMailbox': 'your mailbox',
  'dash.empty': 'Connect a mailbox to start warming.',
  'dash.warmthTrend': 'WARMTH · TREND',
  'dash.placement': 'PLACEMENT',
  'dash.inboxBadge': '{v}% inbox',
  'dash.pts': 'pts',
  'dash.sent': 'Sent',
  'dash.opens': 'Opens',
  'dash.replies': 'Replies',
  'dash.spamRescue': 'Spam-rescue',
  'dash.pulledFromSpam': 'pulled from spam',
  'dash.inbox': 'Inbox',
  'dash.promotions': 'Promotions',
  'dash.spam': 'Spam',
  // Mailboxes
  'mbx.connected': 'CONNECTED',
  'mbx.yourMailbox': 'Your mailbox',
  'mbx.yourMailboxes': 'Your mailboxes',
  'mbx.empty': 'No mailboxes yet. Add one from the website to start warming.',
  'mbx.sentToday': 'Sent today',
  'mbx.opensToday': 'Opens today',
  'mbx.manage': 'Manage mailbox',
  'mbx.pausedTapResume': 'Paused · tap to resume',
  'mbx.activeTapPause': 'Active · tap to pause',
  // Activity
  'act.eyebrow': 'LIVE PEER-NETWORK ENGAGEMENT',
  'act.heading': 'Warmup activity',
  'act.empty': 'No warmup activity yet. It appears as your mailboxes send and engage.',
  'act.noEvents': 'No events match this filter.',
  'act.failedSuffix': ' · failed',
  'act.chipAll': 'All',
  'act.chipSent': 'Sent',
  'act.chipOpened': 'Opened',
  'act.chipReplied': 'Replied',
  'act.chipStarred': 'Starred',
  'act.chipRescued': 'Rescued',
  'act.verbSent': 'Sent',
  'act.verbOpened': 'Opened',
  'act.verbReplied': 'Replied',
  'act.verbStarred': 'Starred',
  'act.verbRescued': 'Rescued from spam',
  'act.verbImportant': 'Marked important',
  'act.verbActivity': 'Activity',
  // Stats
  'stats.eyebrow': 'DELIVERABILITY OVER TIME',
  'stats.heading': 'Stats',
  'stats.empty': 'No stats yet — they build up as warmup runs.',
  'stats.warmthOverTime': 'WARMTH OVER TIME',
  'stats.avg': 'avg',
  'stats.emailsSent': 'EMAILS SENT',
  'stats.totalSent': 'Total sent',
  'stats.totalOpens': 'Total opens',
  'stats.openRate': 'Open rate',
  'stats.avgWarmth': 'Avg warmth',
  'stats.bounce': 'Bounce',
  'stats.spamSaves': 'Spam saves',
  'stats.replyRateSub': '{v}% reply',
  // Reports
  'rep.eyebrow': 'SCHEDULED & ON-DEMAND',
  'rep.heading': 'Reports',
  'rep.scheduled': 'Scheduled',
  'rep.newReport': 'New report',
  'rep.emptyScheduled': 'No scheduled reports.',
  'rep.recentExports': 'Recent exports',
  'rep.emptyGenerated': 'No reports generated yet.',
  // Billing
  'bill.eyebrow': 'PLAN & PAYMENTS',
  'bill.heading': 'Billing',
  'bill.availablePlans': 'AVAILABLE PLANS',
  'bill.currentPlan': 'CURRENT PLAN',
  'bill.renews': 'Renews {date}',
  'bill.upgrading': 'Upgrading…',
  'bill.upgradePlan': 'Upgrade plan',
  'bill.upgradeTo': 'Upgrade to {name}',
  'bill.usageMonth': 'USAGE THIS MONTH',
  'bill.mailboxes': 'Mailboxes',
  'bill.warmupEmailsSent': 'Warmup emails sent',
  'bill.aiTokens': 'AI tokens',
  'bill.paymentMethod': 'PAYMENT METHOD',
  'bill.autoPay': 'Auto-pay',
  'bill.nextBilling': 'Next billing',
  'bill.paymentHistory': 'PAYMENT HISTORY',
  'bill.noPayments': 'No payments yet.',
  'bill.on': 'On',
  'bill.off': 'Off',
  'bill.perMonth': '/mo',
  // Tools
  'tools.eyebrow': 'TEST & VALIDATE DELIVERABILITY',
  'tools.heading': 'Tools',
  'tools.placement': 'Placement Tester',
  'tools.placementSub': 'See inbox vs spam across providers',
  'tools.placementRunning': 'Running…',
  'tools.spam': 'Spam Scanner',
  'tools.spamSub': 'Scan content for spam triggers',
  'tools.spamScanning': 'Scanning…',
  'tools.dns': 'DNS Validator',
  'tools.dnsSub': 'Check SPF, DKIM and DMARC',
  'tools.dnsChecking': 'Checking…',
  'tools.template': 'Template Designer',
  'tools.templateSub': 'Build branded warmup templates',
  'tools.preview': 'Warmup Preview',
  'tools.previewSub': 'Preview a generated thread',
  'tools.previewGenerating': 'Generating…',
  'tools.spamModalTitle': 'Spam Scanner',
  'tools.spamModalMsg': 'Paste email content to scan for spam triggers.',
  'tools.spamModalPlaceholder': 'Your email subject + body…',
  'tools.scan': 'Scan',
  // Leads
  'leads.eyebrow': 'CRM',
  'leads.title': 'Leads',
  'leads.empty': 'No leads yet. Import or add leads to start tracking.',
  'leads.campaigns': 'Campaigns',
  'leads.leads': 'Leads',
  'leads.wonValue': 'Won value',
  'leads.byStage': 'BY STAGE',
  'leads.stageNew': 'New',
  'leads.stageContacted': 'Contacted',
  'leads.stageReplied': 'Replied',
  'leads.stageInterested': 'Interested',
  'leads.stageWon': 'Won',
  'leads.stageLost': 'Lost',
  // Settings
  'set.eyebrow': 'ACCOUNT & PREFERENCES',
  'set.heading': 'Settings',
  'set.profile': 'PROFILE',
  'set.editProfile': 'Edit profile',
  'set.security': 'SECURITY',
  'set.twoFactor': 'Two-factor auth',
  'set.authApp': 'Authenticator app · {status}',
  'set.authEnabled': 'Enabled',
  'set.authDisabled': 'Disabled',
  'set.recoveryCodes': 'Recovery codes',
  'set.recoverySubtitle': 'View & download',
  'set.appearance': 'APPEARANCE',
  'set.theme': 'Theme',
  'set.themeSubtitle': 'Choose your display theme',
  'set.dark': 'Dark',
  'set.notifications': 'NOTIFICATIONS',
  'set.warmthAlerts': 'Warmth alerts',
  'set.weeklyReport': 'Weekly report',
  'set.productUpdates': 'Product updates',
  'set.verified': 'Verified',
  'set.unverified': 'Unverified',
  'set.editProfileMsg': 'Update your display name.',
  'set.namePlaceholder': 'Your name',
  'set.verify2faTitle': 'Verify 2FA',
  'set.verify2faMsg': 'Enter the 6-digit code from your authenticator app.',
  'set.verify': 'Verify',
  'set.disable2faTitle': 'Disable 2FA',
  'set.disable2faMsg': 'Enter your password to turn off two-factor auth.',
  'set.disable': 'Disable',
  // notifications inbox
  'nav.notifications': 'Notifications',
  'notif.title': 'Notifications',
  'notif.eyebrow': 'INBOX',
  'notif.empty': 'You’re all caught up',
  'notif.emptySub': 'Warmth alerts, reports and account updates will show up here.',
  'notif.markAllRead': 'Mark all read',
  'notif.justNow': 'just now',
  'notif.minutesAgo': '{n}m ago',
  'notif.hoursAgo': '{n}h ago',
  'notif.daysAgo': '{n}d ago',
  'notif.new': 'New',
  // permissions
  'set.permissions': 'PERMISSIONS',
  'set.pushNotifs': 'Push notifications',
  'set.pushGranted': 'Allowed — you’ll get alerts on this device',
  'set.pushDenied': 'Blocked — tap to open system settings',
  'set.pushUndetermined': 'Tap to enable alerts on this device',
  'set.pushEnable': 'Enable',
  'set.openSettings': 'Open settings',
  'set.pushUnsupported': 'Not available on this device',
};

const hi: Record<string, string> = {
  'nav.dashboard': 'डैशबोर्ड',
  'nav.mailboxes': 'मेलबॉक्स',
  'nav.activity': 'गतिविधि',
  'nav.stats': 'आँकड़े',
  'nav.tools': 'उपकरण',
  'nav.reports': 'रिपोर्ट',
  'nav.leads': 'लीड्स',
  'nav.settings': 'सेटिंग्स',
  'nav.billing': 'बिलिंग',
  'auth.signInTo': 'साइन इन करें',
  'auth.welcomeBack': 'वापसी पर स्वागत है',
  'auth.signIn': 'साइन इन',
  'auth.createAccount': 'खाता बनाएं',
  'auth.startFree': 'मुफ़्त शुरू करें',
  'auth.email': 'ईमेल',
  'auth.password': 'पासवर्ड',
  'auth.fullName': 'पूरा नाम',
  'auth.later': 'बाद में',
  'common.update': 'अभी अपडेट करें',
  'common.save': 'सहेजें',
  'common.cancel': 'रद्द करें',
  'common.retry': 'पुनः प्रयास',
  'common.language': 'देश और भाषा',
  // Dashboard
  'dash.planSuffix': 'प्लान',
  'dash.yourMailbox': 'आपका मेलबॉक्स',
  'dash.empty': 'वार्मिंग शुरू करने के लिए एक मेलबॉक्स जोड़ें।',
  'dash.warmthTrend': 'वार्मथ · ट्रेंड',
  'dash.placement': 'प्लेसमेंट',
  'dash.inboxBadge': '{v}% इनबॉक्स',
  'dash.pts': 'अंक',
  'dash.sent': 'भेजे',
  'dash.opens': 'खुले',
  'dash.replies': 'जवाब',
  'dash.spamRescue': 'स्पैम-रेस्क्यू',
  'dash.pulledFromSpam': 'स्पैम से निकाले',
  'dash.inbox': 'इनबॉक्स',
  'dash.promotions': 'प्रमोशन',
  'dash.spam': 'स्पैम',
  // Mailboxes
  'mbx.connected': 'कनेक्टेड',
  'mbx.yourMailbox': 'आपका मेलबॉक्स',
  'mbx.yourMailboxes': 'आपके मेलबॉक्स',
  'mbx.empty': 'अभी कोई मेलबॉक्स नहीं है। वार्मिंग शुरू करने के लिए वेबसाइट से एक जोड़ें।',
  'mbx.sentToday': 'आज भेजे',
  'mbx.opensToday': 'आज खुले',
  'mbx.manage': 'मेलबॉक्स प्रबंधित करें',
  'mbx.pausedTapResume': 'रुका हुआ · फिर शुरू करने के लिए टैप करें',
  'mbx.activeTapPause': 'सक्रिय · रोकने के लिए टैप करें',
  // Activity
  'act.eyebrow': 'लाइव पीयर-नेटवर्क एंगेजमेंट',
  'act.heading': 'वार्मअप गतिविधि',
  'act.empty': 'अभी कोई वार्मअप गतिविधि नहीं है। यह तब दिखेगी जब आपके मेलबॉक्स भेजेंगे और इंटरैक्ट करेंगे।',
  'act.noEvents': 'इस फ़िल्टर से मेल खाने वाली कोई घटना नहीं है।',
  'act.failedSuffix': ' · विफल',
  'act.chipAll': 'सभी',
  'act.chipSent': 'भेजे',
  'act.chipOpened': 'खुले',
  'act.chipReplied': 'जवाब दिए',
  'act.chipStarred': 'स्टार किए',
  'act.chipRescued': 'बचाए',
  'act.verbSent': 'भेजा',
  'act.verbOpened': 'खोला',
  'act.verbReplied': 'जवाब दिया',
  'act.verbStarred': 'स्टार किया',
  'act.verbRescued': 'स्पैम से बचाया',
  'act.verbImportant': 'महत्वपूर्ण चिह्नित',
  'act.verbActivity': 'गतिविधि',
  // Stats
  'stats.eyebrow': 'समय के साथ डिलीवरेबिलिटी',
  'stats.heading': 'आँकड़े',
  'stats.empty': 'अभी कोई आँकड़े नहीं — जैसे-जैसे वार्मअप चलेगा, ये बढ़ते जाएंगे।',
  'stats.warmthOverTime': 'समय के साथ वार्मथ',
  'stats.avg': 'औसत',
  'stats.emailsSent': 'भेजे गए ईमेल',
  'stats.totalSent': 'कुल भेजे',
  'stats.totalOpens': 'कुल खुले',
  'stats.openRate': 'ओपन दर',
  'stats.avgWarmth': 'औसत वार्मथ',
  'stats.bounce': 'बाउंस',
  'stats.spamSaves': 'स्पैम बचाव',
  'stats.replyRateSub': '{v}% जवाब',
  // Reports
  'rep.eyebrow': 'निर्धारित और मांग पर',
  'rep.heading': 'रिपोर्ट',
  'rep.scheduled': 'निर्धारित',
  'rep.newReport': 'नई रिपोर्ट',
  'rep.emptyScheduled': 'कोई निर्धारित रिपोर्ट नहीं।',
  'rep.recentExports': 'हालिया निर्यात',
  'rep.emptyGenerated': 'अभी तक कोई रिपोर्ट नहीं बनाई गई।',
  // Billing
  'bill.eyebrow': 'प्लान और भुगतान',
  'bill.heading': 'बिलिंग',
  'bill.availablePlans': 'उपलब्ध प्लान',
  'bill.currentPlan': 'वर्तमान प्लान',
  'bill.renews': '{date} को नवीनीकरण',
  'bill.upgrading': 'अपग्रेड हो रहा है…',
  'bill.upgradePlan': 'प्लान अपग्रेड करें',
  'bill.upgradeTo': '{name} पर अपग्रेड करें',
  'bill.usageMonth': 'इस महीने का उपयोग',
  'bill.mailboxes': 'मेलबॉक्स',
  'bill.warmupEmailsSent': 'वार्मअप ईमेल भेजे',
  'bill.aiTokens': 'AI टोकन',
  'bill.paymentMethod': 'भुगतान विधि',
  'bill.autoPay': 'स्वतः-भुगतान',
  'bill.nextBilling': 'अगला बिल',
  'bill.paymentHistory': 'भुगतान इतिहास',
  'bill.noPayments': 'अभी कोई भुगतान नहीं।',
  'bill.on': 'चालू',
  'bill.off': 'बंद',
  'bill.perMonth': '/माह',
  // Tools
  'tools.eyebrow': 'डिलीवरेबिलिटी परीक्षण और सत्यापन',
  'tools.heading': 'उपकरण',
  'tools.placement': 'प्लेसमेंट टेस्टर',
  'tools.placementSub': 'प्रदाताओं में इनबॉक्स बनाम स्पैम देखें',
  'tools.placementRunning': 'चल रहा है…',
  'tools.spam': 'स्पैम स्कैनर',
  'tools.spamSub': 'स्पैम ट्रिगर के लिए सामग्री स्कैन करें',
  'tools.spamScanning': 'स्कैन हो रहा है…',
  'tools.dns': 'DNS सत्यापनकर्ता',
  'tools.dnsSub': 'SPF, DKIM और DMARC जाँचें',
  'tools.dnsChecking': 'जाँच हो रही है…',
  'tools.template': 'टेम्पलेट डिज़ाइनर',
  'tools.templateSub': 'ब्रांडेड वार्मअप टेम्पलेट बनाएं',
  'tools.preview': 'वार्मअप पूर्वावलोकन',
  'tools.previewSub': 'एक जेनरेट किया थ्रेड देखें',
  'tools.previewGenerating': 'बन रहा है…',
  'tools.spamModalTitle': 'स्पैम स्कैनर',
  'tools.spamModalMsg': 'स्पैम ट्रिगर स्कैन करने के लिए ईमेल सामग्री पेस्ट करें।',
  'tools.spamModalPlaceholder': 'आपका ईमेल विषय + बॉडी…',
  'tools.scan': 'स्कैन करें',
  // Leads
  'leads.eyebrow': 'CRM',
  'leads.title': 'लीड्स',
  'leads.empty': 'अभी कोई लीड नहीं है। ट्रैकिंग शुरू करने के लिए लीड आयात करें या जोड़ें।',
  'leads.campaigns': 'अभियान',
  'leads.leads': 'लीड्स',
  'leads.wonValue': 'जीती हुई राशि',
  'leads.byStage': 'स्तर के अनुसार',
  'leads.stageNew': 'नए',
  'leads.stageContacted': 'संपर्क किए',
  'leads.stageReplied': 'जवाब दिए',
  'leads.stageInterested': 'रुचि रखने वाले',
  'leads.stageWon': 'जीते',
  'leads.stageLost': 'खोए',
  // Settings
  'set.eyebrow': 'खाता और प्राथमिकताएं',
  'set.heading': 'सेटिंग्स',
  'set.profile': 'प्रोफाइल',
  'set.editProfile': 'प्रोफाइल संपादित करें',
  'set.security': 'सुरक्षा',
  'set.twoFactor': 'दो-कारक प्रमाणीकरण',
  'set.authApp': 'प्रमाणक ऐप · {status}',
  'set.authEnabled': 'सक्षम',
  'set.authDisabled': 'अक्षम',
  'set.recoveryCodes': 'रिकवरी कोड',
  'set.recoverySubtitle': 'देखें और डाउनलोड करें',
  'set.appearance': 'दिखावट',
  'set.theme': 'थीम',
  'set.themeSubtitle': 'अपना डिस्प्ले थीम चुनें',
  'set.dark': 'डार्क',
  'set.notifications': 'सूचनाएं',
  'set.warmthAlerts': 'वार्मथ अलर्ट',
  'set.weeklyReport': 'साप्ताहिक रिपोर्ट',
  'set.productUpdates': 'उत्पाद अपडेट',
  'set.verified': 'सत्यापित',
  'set.unverified': 'असत्यापित',
  'set.editProfileMsg': 'अपना प्रदर्शन नाम अपडेट करें।',
  'set.namePlaceholder': 'आपका नाम',
  'set.verify2faTitle': '2FA सत्यापित करें',
  'set.verify2faMsg': 'अपने प्रमाणक ऐप से 6-अंकीय कोड दर्ज करें।',
  'set.verify': 'सत्यापित करें',
  'set.disable2faTitle': '2FA अक्षम करें',
  'set.disable2faMsg': 'दो-कारक प्रमाणीकरण बंद करने के लिए अपना पासवर्ड दर्ज करें।',
  'set.disable': 'अक्षम करें',
  // notifications inbox
  'nav.notifications': 'सूचनाएँ',
  'notif.title': 'सूचनाएँ',
  'notif.eyebrow': 'इनबॉक्स',
  'notif.empty': 'सब कुछ देख लिया',
  'notif.emptySub': 'वार्मथ अलर्ट, रिपोर्ट और खाता अपडेट यहाँ दिखेंगे।',
  'notif.markAllRead': 'सभी पढ़े के रूप में चिह्नित करें',
  'notif.justNow': 'अभी',
  'notif.minutesAgo': '{n} मिनट पहले',
  'notif.hoursAgo': '{n} घंटे पहले',
  'notif.daysAgo': '{n} दिन पहले',
  'notif.new': 'नया',
  // permissions
  'set.permissions': 'अनुमतियाँ',
  'set.pushNotifs': 'पुश सूचनाएँ',
  'set.pushGranted': 'अनुमति है — इस डिवाइस पर अलर्ट मिलेंगे',
  'set.pushDenied': 'अवरुद्ध — सिस्टम सेटिंग्स खोलने के लिए टैप करें',
  'set.pushUndetermined': 'इस डिवाइस पर अलर्ट सक्षम करने के लिए टैप करें',
  'set.pushEnable': 'सक्षम करें',
  'set.openSettings': 'सेटिंग्स खोलें',
  'set.pushUnsupported': 'इस डिवाइस पर उपलब्ध नहीं',
};

const CATALOGS: Record<Language, Record<string, string>> = { en, hi };

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const s = CATALOGS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

type LocaleContextValue = {
  language: Language;
  standardId: StandardId;
  setStandard: (id: StandardId) => void;
  t: TFunc;
};

const LocaleContext = createContext<LocaleContextValue>({
  language: 'en',
  standardId: 'IN-en',
  setStandard: () => {},
  t: (key) => translate('en', key),
});

const STORAGE_KEY = 'wp.standard';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [standardId, setStandardId] = useState<StandardId>('IN-en');
  const language = standardById(standardId).language;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v) setStandardId(v as StandardId);
      })
      .catch(() => {});
  }, []);

  const setStandard = useCallback((id: StandardId) => {
    setStandardId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const t = useCallback<TFunc>((key, vars) => translate(language, key, vars), [language]);

  return (
    <LocaleContext.Provider value={{ language, standardId, setStandard, t }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useT(): TFunc {
  return useContext(LocaleContext).t;
}
