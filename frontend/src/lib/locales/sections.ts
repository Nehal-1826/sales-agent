/** Landing-page sections, CTABand, and Footer strings. Auto-merged by lib/i18n. */
export const en: Record<string, string> = {
  // ── ProductSection ────────────────────────────────────────────────────────
  'sections.product.eyebrow': "What's inside",
  'sections.product.title1': 'Everything you need to',
  'sections.product.title2': 'land in inbox.',
  'sections.product.intro':
    'WarmPulse is built to build your sender reputation from the ground up — from a massive network of test accounts to continuous domain health checks.',

  // product feature cards
  'sections.feature.realTestAccounts.title': 'Real Test Accounts',
  'sections.feature.realTestAccounts.body':
    '2,800+ Gmail, Outlook, and Yahoo accounts — rotated hourly to keep interactions natural and safe.',
  'sections.feature.realTestAccounts.stat': '14 Email Providers',

  'sections.feature.smartScaling.title': 'Smart 30-day scaling',
  'sections.feature.smartScaling.body':
    'Daily sends naturally increase over 30 days (5 → 10 → 20 → 35 → 50+). Auto-pauses on delivery issues.',
  'sections.feature.smartScaling.stat': 'D1 → D29 scaling',

  'sections.feature.domainHealth.title': 'Domain Health Monitored',
  'sections.feature.domainHealth.body':
    'Continuous domain setup checks (SPF/DKIM/DMARC) and monitoring across 12 different blacklists.',
  'sections.feature.domainHealth.stat': 'Checks every 6h',

  'sections.feature.aiEmails.title': 'AI-written emails',
  'sections.feature.aiEmails.body':
    'Advanced AI generates realistic email threads with actual replies and follow-ups — never two alike.',
  'sections.feature.aiEmails.stat': 'Human-like content',

  'sections.feature.inboxStats.title': 'Inbox Stats',
  'sections.feature.inboxStats.body':
    'Health scores, inbox delivery %, engagement stats, and daily summaries for every email account you connect.',
  'sections.feature.inboxStats.stat': '7-day · 30-day · 90-day',

  'sections.feature.spamRescue.title': 'Spam Rescue',
  'sections.feature.spamRescue.body':
    'Our test accounts detect if your emails land in spam and automatically move them to the inbox to restore trust.',
  'sections.feature.spamRescue.stat': 'Automatic recovery',

  // ── PeerNetworkSection ────────────────────────────────────────────────────
  'sections.peer.eyebrow': 'The email network',
  'sections.peer.title1': '2,841 real accounts.',
  'sections.peer.title2': 'Talking to yours.',
  'sections.peer.intro':
    'Every connected email joins a pool that interacts with test accounts across all major email providers. Real opens, real replies, real spam rescues — building trust the way actual people do.',
  'sections.peer.stat.gmail': 'Gmail accounts',
  'sections.peer.stat.outlook': 'Outlook accounts',
  'sections.peer.stat.yahoo': 'Yahoo accounts',
  'sections.peer.stat.other': 'Other Providers',
  'sections.peer.bullet.0': 'Smart account matching for every email sent',
  'sections.peer.bullet.1': '24-hour limit — no account ever receives too many emails',
  'sections.peer.bullet.2': 'Hourly checks drop underperforming accounts automatically',
  'sections.peer.bullet.3': 'Dedicated account pools for premium plans',

  // ── PricingSection ────────────────────────────────────────────────────────
  'sections.pricing.eyebrow': 'Pricing',
  'sections.pricing.title1': 'One peer network.',
  'sections.pricing.title2': 'Four ways to grow.',
  'sections.pricing.intro':
    'Pick a plan based on how many mailboxes you warm. Every paid plan gets the full peer network, real ground-truth from Gmail Postmaster and Microsoft SNDS, and webhook alerts — no reputation gating behind tiers.',
  'sections.pricing.monthly': 'Monthly',
  'sections.pricing.yearly': 'Yearly',
  'sections.pricing.billingCycle': 'Billing cycle',
  'sections.pricing.mostPopular': 'Most popular',
  'sections.pricing.perMonth': '/ month',
  'sections.pricing.billedYearly': 'Billed yearly',
  'sections.pricing.getStarted': 'Get started',
  'sections.pricing.justExploring': 'Just exploring?',
  'sections.pricing.freeForever': 'free forever',
  'sections.pricing.freeTierPre': 'Try WarmPulse ',
  'sections.pricing.freeTierPost': ' — 1 mailbox · 5 sends/day · DNS validation · no card required.',
  'sections.pricing.startFree': 'Start free →',
  'sections.pricing.footerNote':
    'All paid plans · 7-day money-back · dummy gateway during beta · cancel anytime',

  // plan blurbs (keyed by slug matching planSlug(name))
  'sections.plan.starter.blurb': 'For solo founders dipping into outbound.',
  'sections.plan.pro.blurb': 'For teams running cold outreach at scale.',
  'sections.plan.pro_plus.blurb': 'For deliverability nerds + power users.',
  'sections.plan.agency.blurb': 'For agencies reselling to many clients.',

  // ── DocsSection ───────────────────────────────────────────────────────────
  'sections.docs.eyebrow': 'Developer docs',
  'sections.docs.title1': 'Built for the people who',
  'sections.docs.title2': 'read the docs.',
  'sections.docs.intro':
    'REST API, webhooks, CLI, OAuth flow — everything is documented, versioned, and shipped before we announce it.',
  'sections.docs.quickstart.title': 'Quickstart',
  'sections.docs.quickstart.body':
    'Connect a mailbox and watch the first warmup send in 30 seconds.',
  'sections.docs.restApi.title': 'REST API',
  'sections.docs.restApi.body': 'Programmatically manage mailboxes, peer pools, and reports.',
  'sections.docs.webhooks.title': 'Webhooks',
  'sections.docs.webhooks.body':
    'Subscribe to warmup events, ramp transitions, and spam-rescue triggers.',
  'sections.docs.teamSso.title': 'Team & SSO',
  'sections.docs.teamSso.body':
    'Invite teammates, scope per-workspace roles, configure Google SSO.',

  // ── ChangelogSection ──────────────────────────────────────────────────────
  'sections.changelog.eyebrow': 'Changelog',
  'sections.changelog.title1': 'Shipping',
  'sections.changelog.title2': 'every week.',
  'sections.changelog.intro':
    'Real updates from the people building it. Every change rolls out automatically to your workspace.',
  'sections.changelog.spamRescue.tag': 'New',
  'sections.changelog.spamRescue.title': 'Spam-rescue v2: bulk-folder detection',
  'sections.changelog.spamRescue.body':
    'IMAP watcher now scans Promotions and Updates folders in addition to Spam, recovering inbox placement faster on Gmail.',
  'sections.changelog.peerRotation.tag': 'Improved',
  'sections.changelog.peerRotation.title': 'Smarter peer rotation under load',
  'sections.changelog.peerRotation.body':
    'Hourly health check now deactivates underperformers (<0.3 reputation) atomically with audit trail. Day-0 peers exempt.',
  'sections.changelog.zohoDetect.tag': 'New',
  'sections.changelog.zohoDetect.title': 'Zoho data-center auto-detection',
  'sections.changelog.zohoDetect.body':
    'Mailbox connect probes MX records to pre-select the correct Zoho region — fewer onboarding misfires.',
  'sections.changelog.imapProbe.tag': 'Fixed',
  'sections.changelog.imapProbe.title': 'IMAP probe timeout on dual-stack hosts',
  'sections.changelog.imapProbe.body':
    'Test connection now falls back gracefully when IPv6 is advertised but unreachable; "Retry without IMAP" added.',

  // ── FinalCTA ──────────────────────────────────────────────────────────────
  'sections.finalCta.eyebrow': 'Stop guessing',
  'sections.finalCta.title1': 'Land in inbox.',
  'sections.finalCta.title2': 'Starting today.',
  'sections.finalCta.intro': 'Connect a mailbox in 30 seconds. Watch warmth climb in 24 hours.',
  'sections.finalCta.cta': 'Get started',

  // ── CTABand ───────────────────────────────────────────────────────────────
  'sections.ctaBand.heading': 'Stop landing in Spam.',
  'sections.ctaBand.sub': 'Start your 7-day dummy trial. No card required.',
  'sections.ctaBand.cta': 'Start warming now',

  // ── Footer ────────────────────────────────────────────────────────────────
  'footer.tagline':
    'Peer-network email warmup that actually convinces ESPs — built on the SashaLMS stack.',
  'footer.col.product': 'Product',
  'footer.col.company': 'Company',
  'footer.col.legal': 'Legal',
  'footer.link.features': 'Features',
  'footer.link.pricing': 'Pricing',
  'footer.link.faq': 'FAQ',
  'footer.link.contact': 'Contact',
  'footer.link.terms': 'Terms',
  'footer.link.privacy': 'Privacy',
  'footer.copyright': '© 2026 WarmPulse. Built on the SashaLMS stack.',
  'footer.version': 'v0.1 · beta',
};

export const hi: Record<string, string> = {
  // ── ProductSection ────────────────────────────────────────────────────────
  'sections.product.eyebrow': 'क्या है अंदर',
  'sections.product.title1': 'वह सब कुछ जो आपको चाहिए',
  'sections.product.title2': 'इनबॉक्स में पहुँचने के लिए।',
  'sections.product.intro':
    'WarmPulse आपकी प्रेषक प्रतिष्ठा को शुरुआत से बनाने के लिए तैयार है — परीक्षण खातों के विशाल नेटवर्क से लेकर निरंतर डोमेन स्वास्थ्य जाँच तक।',

  // product feature cards
  'sections.feature.realTestAccounts.title': 'वास्तविक परीक्षण खाते',
  'sections.feature.realTestAccounts.body':
    '2,800+ Gmail, Outlook और Yahoo खाते — इंटरेक्शन को स्वाभाविक और सुरक्षित रखने के लिए हर घंटे रोटेट होते हैं।',
  'sections.feature.realTestAccounts.stat': '14 ईमेल प्रदाता',

  'sections.feature.smartScaling.title': 'स्मार्ट 30-दिन स्केलिंग',
  'sections.feature.smartScaling.body':
    'दैनिक भेजें 30 दिनों में स्वाभाविक रूप से बढ़ते हैं (5 → 10 → 20 → 35 → 50+)। डिलीवरी समस्याओं पर स्वतः रुक जाता है।',
  'sections.feature.smartScaling.stat': 'D1 → D29 स्केलिंग',

  'sections.feature.domainHealth.title': 'डोमेन स्वास्थ्य निगरानी',
  'sections.feature.domainHealth.body':
    'निरंतर डोमेन सेटअप जाँच (SPF/DKIM/DMARC) और 12 विभिन्न ब्लैकलिस्ट पर निगरानी।',
  'sections.feature.domainHealth.stat': 'हर 6 घंटे जाँच',

  'sections.feature.aiEmails.title': 'AI-लिखे ईमेल',
  'sections.feature.aiEmails.body':
    'उन्नत AI वास्तविक उत्तरों और फॉलो-अप के साथ यथार्थवादी ईमेल थ्रेड उत्पन्न करता है — कोई भी दो एक जैसे नहीं।',
  'sections.feature.aiEmails.stat': 'मानव-जैसी सामग्री',

  'sections.feature.inboxStats.title': 'इनबॉक्स आँकड़े',
  'sections.feature.inboxStats.body':
    'हर उस ईमेल खाते के लिए स्वास्थ्य स्कोर, इनबॉक्स डिलीवरी %, एंगेजमेंट आँकड़े और दैनिक सारांश जिसे आप कनेक्ट करते हैं।',
  'sections.feature.inboxStats.stat': '7-दिन · 30-दिन · 90-दिन',

  'sections.feature.spamRescue.title': 'स्पैम बचाव',
  'sections.feature.spamRescue.body':
    'हमारे परीक्षण खाते पता लगाते हैं कि क्या आपके ईमेल स्पैम में जाते हैं और विश्वास बहाल करने के लिए उन्हें स्वतः इनबॉक्स में ले जाते हैं।',
  'sections.feature.spamRescue.stat': 'स्वचालित पुनर्प्राप्ति',

  // ── PeerNetworkSection ────────────────────────────────────────────────────
  'sections.peer.eyebrow': 'ईमेल नेटवर्क',
  'sections.peer.title1': '2,841 वास्तविक खाते।',
  'sections.peer.title2': 'आपके साथ बात करते हुए।',
  'sections.peer.intro':
    'हर कनेक्टेड ईमेल एक पूल में शामिल होता है जो सभी प्रमुख ईमेल प्रदाताओं के परीक्षण खातों के साथ इंटरेक्ट करता है। वास्तविक ओपन, वास्तविक उत्तर, वास्तविक स्पैम बचाव — जैसे वास्तविक लोग विश्वास बनाते हैं।',
  'sections.peer.stat.gmail': 'Gmail खाते',
  'sections.peer.stat.outlook': 'Outlook खाते',
  'sections.peer.stat.yahoo': 'Yahoo खाते',
  'sections.peer.stat.other': 'अन्य प्रदाता',
  'sections.peer.bullet.0': 'हर भेजे गए ईमेल के लिए स्मार्ट खाता मिलान',
  'sections.peer.bullet.1': '24 घंटे की सीमा — कोई भी खाता कभी भी बहुत अधिक ईमेल नहीं प्राप्त करता',
  'sections.peer.bullet.2': 'प्रति घंटा जाँच कमज़ोर प्रदर्शन वाले खातों को स्वतः हटाती है',
  'sections.peer.bullet.3': 'प्रीमियम प्लान के लिए समर्पित खाता पूल',

  // ── PricingSection ────────────────────────────────────────────────────────
  'sections.pricing.eyebrow': 'मूल्य निर्धारण',
  'sections.pricing.title1': 'एक पीयर नेटवर्क।',
  'sections.pricing.title2': 'बढ़ने के चार तरीके।',
  'sections.pricing.intro':
    'आप जितने मेलबॉक्स वार्म करना चाहते हैं उसके आधार पर एक प्लान चुनें। हर भुगतान किए गए प्लान को पूरा पीयर नेटवर्क, Gmail Postmaster और Microsoft SNDS से वास्तविक डेटा, और वेबहुक अलर्ट मिलते हैं — टियर के पीछे कोई प्रतिष्ठा गेटिंग नहीं।',
  'sections.pricing.monthly': 'मासिक',
  'sections.pricing.yearly': 'वार्षिक',
  'sections.pricing.billingCycle': 'बिलिंग चक्र',
  'sections.pricing.mostPopular': 'सबसे लोकप्रिय',
  'sections.pricing.perMonth': '/ माह',
  'sections.pricing.billedYearly': 'वार्षिक बिल',
  'sections.pricing.getStarted': 'शुरू करें',
  'sections.pricing.justExploring': 'बस देख रहे हैं?',
  'sections.pricing.freeForever': 'हमेशा के लिए मुफ़्त',
  'sections.pricing.freeTierPre': 'WarmPulse आज़माएं ',
  'sections.pricing.freeTierPost': ' — 1 मेलबॉक्स · 5 भेजें/दिन · DNS सत्यापन · कार्ड की ज़रूरत नहीं।',
  'sections.pricing.startFree': 'मुफ़्त शुरू करें →',
  'sections.pricing.footerNote':
    'सभी भुगतान प्लान · 7-दिन की मनी-बैक · बीटा के दौरान डमी गेटवे · कभी भी रद्द करें',

  // plan blurbs
  'sections.plan.starter.blurb': 'आउटबाउंड में कदम रखने वाले एकल संस्थापकों के लिए।',
  'sections.plan.pro.blurb': 'बड़े पैमाने पर कोल्ड आउटरीच चलाने वाली टीमों के लिए।',
  'sections.plan.pro_plus.blurb': 'डिलीवरेबिलिटी विशेषज्ञों और पावर यूज़र के लिए।',
  'sections.plan.agency.blurb': 'कई क्लाइंट को रीसेल करने वाली एजेंसियों के लिए।',

  // ── DocsSection ───────────────────────────────────────────────────────────
  'sections.docs.eyebrow': 'डेवलपर दस्तावेज़',
  'sections.docs.title1': 'उन लोगों के लिए बनाया गया जो',
  'sections.docs.title2': 'दस्तावेज़ पढ़ते हैं।',
  'sections.docs.intro':
    'REST API, वेबहुक, CLI, OAuth फ़्लो — हर चीज़ दस्तावेज़ीकृत, संस्करणीकृत है और घोषणा से पहले भेज दी जाती है।',
  'sections.docs.quickstart.title': 'त्वरित शुरुआत',
  'sections.docs.quickstart.body':
    'एक मेलबॉक्स कनेक्ट करें और 30 सेकंड में पहला वार्मअप भेजते देखें।',
  'sections.docs.restApi.title': 'REST API',
  'sections.docs.restApi.body': 'प्रोग्रामेटिक रूप से मेलबॉक्स, पीयर पूल और रिपोर्ट प्रबंधित करें।',
  'sections.docs.webhooks.title': 'वेबहुक',
  'sections.docs.webhooks.body':
    'वार्मअप इवेंट, रैंप ट्रांज़िशन और स्पैम-रेस्क्यू ट्रिगर की सदस्यता लें।',
  'sections.docs.teamSso.title': 'टीम और SSO',
  'sections.docs.teamSso.body':
    'टीम के सदस्यों को आमंत्रित करें, प्रति-वर्कस्पेस भूमिकाएँ निर्धारित करें, Google SSO कॉन्फ़िगर करें।',

  // ── ChangelogSection ──────────────────────────────────────────────────────
  'sections.changelog.eyebrow': 'परिवर्तन सूची',
  'sections.changelog.title1': 'शिपिंग',
  'sections.changelog.title2': 'हर हफ़्ते।',
  'sections.changelog.intro':
    'इसे बनाने वाले लोगों के वास्तविक अपडेट। हर बदलाव स्वतः आपके वर्कस्पेस में लागू होता है।',
  'sections.changelog.spamRescue.tag': 'नया',
  'sections.changelog.spamRescue.title': 'स्पैम-रेस्क्यू v2: बल्क-फ़ोल्डर डिटेक्शन',
  'sections.changelog.spamRescue.body':
    'IMAP वॉचर अब स्पैम के अलावा Promotions और Updates फ़ोल्डर भी स्कैन करता है, Gmail पर इनबॉक्स प्लेसमेंट तेज़ी से बहाल करता है।',
  'sections.changelog.peerRotation.tag': 'बेहतर',
  'sections.changelog.peerRotation.title': 'लोड में स्मार्ट पीयर रोटेशन',
  'sections.changelog.peerRotation.body':
    'प्रति घंटा स्वास्थ्य जाँच अब कम प्रदर्शन करने वालों (<0.3 प्रतिष्ठा) को ऑडिट ट्रेल के साथ परमाणु रूप से निष्क्रिय करती है। Day-0 पीयर छूट प्राप्त हैं।',
  'sections.changelog.zohoDetect.tag': 'नया',
  'sections.changelog.zohoDetect.title': 'Zoho डेटा-सेंटर ऑटो-डिटेक्शन',
  'sections.changelog.zohoDetect.body':
    'मेलबॉक्स कनेक्ट सही Zoho क्षेत्र पूर्व-चयन करने के लिए MX रिकॉर्ड जाँचता है — कम ऑनबोर्डिंग त्रुटियाँ।',
  'sections.changelog.imapProbe.tag': 'ठीक किया',
  'sections.changelog.imapProbe.title': 'डुअल-स्टैक होस्ट पर IMAP प्रोब टाइमआउट',
  'sections.changelog.imapProbe.body':
    'परीक्षण कनेक्शन अब IPv6 विज्ञापित लेकिन अनुपलब्ध होने पर सुचारु रूप से फॉलबैक होता है; "IMAP के बिना पुनः प्रयास" जोड़ा गया।',

  // ── FinalCTA ──────────────────────────────────────────────────────────────
  'sections.finalCta.eyebrow': 'अनुमान लगाना बंद करें',
  'sections.finalCta.title1': 'इनबॉक्स में पहुँचें।',
  'sections.finalCta.title2': 'आज से शुरू करें।',
  'sections.finalCta.intro': '30 सेकंड में एक मेलबॉक्स कनेक्ट करें। 24 घंटों में वार्मथ बढ़ते देखें।',
  'sections.finalCta.cta': 'शुरू करें',

  // ── CTABand ───────────────────────────────────────────────────────────────
  'sections.ctaBand.heading': 'स्पैम में जाना बंद करें।',
  'sections.ctaBand.sub': 'अपना 7-दिन का डमी ट्रायल शुरू करें। कोई कार्ड नहीं चाहिए।',
  'sections.ctaBand.cta': 'अभी वार्मअप शुरू करें',

  // ── Footer ────────────────────────────────────────────────────────────────
  'footer.tagline':
    'पीयर-नेटवर्क ईमेल वार्मअप जो वास्तव में ESP को आश्वस्त करता है — SashaLMS स्टैक पर बना।',
  'footer.col.product': 'उत्पाद',
  'footer.col.company': 'कंपनी',
  'footer.col.legal': 'कानूनी',
  'footer.link.features': 'विशेषताएँ',
  'footer.link.pricing': 'मूल्य निर्धारण',
  'footer.link.faq': 'सामान्य प्रश्न',
  'footer.link.contact': 'संपर्क',
  'footer.link.terms': 'नियम',
  'footer.link.privacy': 'गोपनीयता',
  'footer.copyright': '© 2026 WarmPulse. SashaLMS स्टैक पर बना।',
  'footer.version': 'v0.1 · बीटा',
};
