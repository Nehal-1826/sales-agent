import type {
  AgentConfig,
  AgentKey,
  AgentMeta,
  ChatMessage,
  EmailDraft,
  Finding,
  Lead,
  Potential,
  Reply,
  SettingsState,
} from './types';

/* ------------------------------------------------------------------ */
/* Agents — exact conceptual names from the handwritten notes          */
/* ------------------------------------------------------------------ */

export const AGENTS: AgentMeta[] = [
  {
    key: 'search',
    name: 'Search (Scrape)',
    shortName: 'Search',
    role: 'Discovers and scrapes new companies and leads',
    status: 'Active',
    lastAction: '3 new leads discovered · 2 min ago',
  },
  {
    key: 'profile',
    name: 'Profile',
    shortName: 'Profile',
    role: 'Profiles the discovered company / lead and enriches data',
    status: 'Active',
    lastAction: 'Enriched BlueRiver Finance · 9 min ago',
  },
  {
    key: 'copywright',
    name: 'Copywright',
    shortName: 'Copywright',
    role: 'Generates the communication / pitch for each lead',
    status: 'Active',
    lastAction: 'Drafted 5 first-touch emails · 21 min ago',
  },
  {
    key: 'responder',
    name: 'Responder (Chatbot)',
    shortName: 'Responder',
    role: 'Handles responses and conversations with leads',
    status: 'Active',
    lastAction: '2 replies queued · just now',
  },
];

export const AGENT_LABELS: Record<AgentKey, string> = {
  search: 'Search (Scrape)',
  profile: 'Profile',
  copywright: 'Copywright',
  responder: 'Responder (Chatbot)',
};

/* ------------------------------------------------------------------ */
/* CRM — mock data only                                                */
/* ------------------------------------------------------------------ */

const F_SEO: Finding = {
  area: 'SEO',
  severity: 'high',
  issue: 'Missing or too-short page title.',
  recommendation: 'Pitch on-page SEO: unique 50–60 char titles per page.',
};
const F_MOBILE: Finding = {
  area: 'Mobile',
  severity: 'high',
  issue: 'Not mobile-friendly (no viewport meta).',
  recommendation: 'Mobile-first redesign offer — most of their traffic is on phones.',
};
const F_SLOW: Finding = {
  area: 'Performance',
  severity: 'medium',
  issue: 'Homepage loads slowly (4.2s).',
  recommendation: 'Propose a performance audit: image optimisation, caching, CDN.',
};
const F_NO_SITE: Finding = {
  area: 'Web presence',
  severity: 'high',
  issue: 'Has no website at all.',
  recommendation: 'Pitch an end-to-end website: domain, landing pages, SEO setup and a booking/contact funnel.',
};

export const MOCK_LEADS: Lead[] = [
  {
    id: 'lead-1',
    company: 'Acme Robotics',
    industry: 'Industrial automation',
    website: 'acmerobotics.io',
    score: 91,
    source: 'Search · scraped 42 pages',
    discovered: '5 hours ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: 'info@acmerobotics.io',
    findings: [F_MOBILE, F_SLOW, F_SEO],
  },
  {
    id: 'lead-2',
    company: 'BlueRiver Finance',
    industry: 'Fintech lending',
    website: 'blueriver.finance',
    score: 88,
    source: 'Search · industry index',
    discovered: '8 hours ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: 'contact@blueriver.finance',
    findings: [F_SEO, F_SLOW],
  },
  {
    id: 'lead-3',
    company: 'Northwind Logistics',
    industry: 'Supply chain & freight',
    website: 'northwindlogistics.com',
    score: 84,
    source: 'Search · scraped 34 pages',
    discovered: '2 hours ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: '',
    findings: [F_MOBILE],
  },
  {
    id: 'lead-4',
    company: 'Orbit Health',
    industry: 'HealthTech SaaS',
    website: 'orbithealth.ai',
    score: 82,
    source: 'Search · partner directory',
    discovered: '1 day ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: 'hello@orbithealth.ai',
    findings: [F_SLOW, F_SEO],
  },
  {
    id: 'lead-5',
    company: 'Harbor & Co Catering',
    industry: 'Food & catering',
    website: '',
    score: 95,
    source: 'Search · no site found in index',
    discovered: '1 day ago',
    state: '',
    country: 'United States',
    hasWebsite: false,
    contactEmail: '',
    findings: [F_NO_SITE],
  },
  {
    id: 'lead-6',
    company: 'Vantage Retail Group',
    industry: 'E-commerce operations',
    website: 'vantage-retail.com',
    score: 71,
    source: 'Search · scraped 21 pages',
    discovered: '2 days ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: 'sales@vantage-retail.com',
    findings: [F_SEO],
  },
  {
    id: 'lead-7',
    company: 'Kestrel Manufacturing',
    industry: 'Precision parts',
    website: 'kestrel-mfg.com',
    score: 64,
    source: 'Search / Scrape',
    discovered: '2 days ago',
    state: '',
    country: 'United States',
    hasWebsite: true,
    contactEmail: 'office@kestrel-mfg.com',
    findings: [],
  },
];

export const MOCK_DRAFTS: EmailDraft[] = [
  {
    id: 'draft-1',
    company: 'Acme Robotics',
    toEmail: 'info@acmerobotics.io',
    subject: 'Quick idea to fix acme robotics',
    body:
      'Hi Acme Robotics team,\n\n' +
      'I was researching industrial automation companies and looked at acmerobotics.io — ' +
      'a couple of things stood out:\n\n' +
      '• Not mobile-friendly (no viewport meta) → Mobile-first redesign offer\n' +
      '• Homepage loads slowly (4.2s) → performance audit: images, caching, CDN\n\n' +
      'We help teams fix exactly this. Worth a 15-minute call next week?\n\nBest,\nNorthstar Growth Partners',
    findings: [F_MOBILE, F_SLOW],
    status: 'Draft',
    sentVia: '',
    error: '',
    lastActivity: '12 min ago',
  },
  {
    id: 'draft-2',
    company: 'Harbor & Co Catering',
    toEmail: '',
    subject: 'Getting Harbor & Co Catering online',
    body:
      'Hi Harbor & Co team,\n\nI couldn\'t find a working website for Harbor & Co Catering — which usually ' +
      'means customers searching for you end up with competitors instead.\n\nWe build fast, search-ready ' +
      'sites for catering businesses. Would a 15-minute call next week be useful?\n\nBest,\nNorthstar Growth Partners',
    findings: [F_NO_SITE],
    status: 'Draft',
    sentVia: '',
    error: '',
    lastActivity: '35 min ago',
  },
  {
    id: 'draft-3',
    company: 'BlueRiver Finance',
    toEmail: 'contact@blueriver.finance',
    subject: 'Quick idea to fix blueriver',
    body: 'Approved and delivered via the development console (SMTP not configured yet).',
    findings: [F_SEO],
    status: 'Sent',
    sentVia: 'console',
    error: '',
    lastActivity: '1 hour ago',
  },
];

export const MOCK_POTENTIAL: Potential[] = [
  {
    id: 'pot-1',
    company: 'Acme Robotics',
    opportunity: 'Pilot — automated outreach for 3 sales regions',
    value: '$48,000',
    stage: 'Proposal',
    owner: 'Copywright agent',
  },
  {
    id: 'pot-2',
    company: 'BlueRiver Finance',
    opportunity: 'Quarterly lead-generation campaign',
    value: '$120,000',
    stage: 'Qualified',
    owner: 'Profile agent',
  },
  {
    id: 'pot-3',
    company: 'Northwind Logistics',
    opportunity: 'Profile-enrichment retainer',
    value: '$24,000',
    stage: 'Negotiation',
    owner: 'Responder agent',
  },
  {
    id: 'pot-4',
    company: 'Helios Energy',
    opportunity: 'Content engine subscription',
    value: '$60,000',
    stage: 'Qualified',
    owner: 'Copywright agent',
  },
  {
    id: 'pot-5',
    company: 'Orbit Health',
    opportunity: 'Responder integration pilot',
    value: '$36,000',
    stage: 'Discovery',
    owner: 'Profile agent',
  },
];

export const MOCK_REPLIES: Reply[] = [
  {
    id: 'rep-1',
    company: 'Acme Robotics',
    contact: 'J. Meyer · Head of Growth',
    channel: 'Email',
    status: 'Replied',
    summary: 'Interested in a pilot — asked for pricing.',
    lastActivity: '18 min ago',
  },
  {
    id: 'rep-2',
    company: 'BlueRiver Finance',
    contact: 'S. Okafor · Ops Director',
    channel: 'LinkedIn',
    status: 'Meeting booked',
    summary: 'Intro call booked for Thursday 14:00.',
    lastActivity: '2 hours ago',
  },
  {
    id: 'rep-3',
    company: 'Orbit Health',
    contact: 'D. Lin · CTO',
    channel: 'Email',
    status: 'Awaiting',
    summary: 'Asked for security & compliance docs.',
    lastActivity: '1 day ago',
  },
  {
    id: 'rep-4',
    company: 'Vantage Retail Group',
    contact: 'P. Singh · CMO',
    channel: 'Email',
    status: 'Replied',
    summary: 'Requested a case study before deciding.',
    lastActivity: '1 day ago',
  },
  {
    id: 'rep-5',
    company: 'Kestrel Manufacturing',
    contact: 'R. Alvarez · Procurement',
    channel: 'Webchat',
    status: 'Awaiting',
    summary: 'Budget cycle question — draft pending.',
    lastActivity: '2 days ago',
  },
];

/* ------------------------------------------------------------------ */
/* Agents page — default configuration per agent                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_AGENT_CONFIGS: Record<AgentKey, AgentConfig> = {
  search: {
    db: { provider: 'mongodb' },
    api: { url: 'https://example.com/discovery-api', auth: 'Bearer ••••' },
    systemPrompt:
      'You are the Search (Scrape) agent in an autonomous marketing & sales pipeline.\n' +
      'Discover companies that match the ideal customer profile defined in Settings.\n' +
      'Scrape public pages, extract company name, website, industry and contact signals,\n' +
      'and emit each discovered company as a new LEAD for the pipeline.',
    negativePrompt:
      'Do not scrape gated, private or paywalled content.\n' +
      'Do not store personal data beyond business contact signals.\n' +
      'Do not invent companies or contacts that were not observed on the page.',
    model: 'GLM-4.6',
  },
  profile: {
    db: { provider: 'mongodb' },
    api: { url: 'https://example.com/enrichment-api', auth: 'Bearer ••••' },
    systemPrompt:
      'You are the Profile agent.\n' +
      'For every LEAD produced by Search (Scrape), build a structured company profile:\n' +
      'size, industry, tech stack, likely pain points and a 0–100 fit score.\n' +
      'Flag high-potential leads as POTENTIAL opportunities.',
    negativePrompt:
      'Do not infer sensitive attributes (health, politics, religion).\n' +
      'Do not overwrite Search source data — enrich it.\n' +
      'Do not assign a fit score without citing observed evidence.',
    model: 'GLM-4.6',
  },
  copywright: {
    db: { provider: 'mongodb' },
    api: { url: 'https://example.com/send-api', auth: 'Bearer ••••' },
    systemPrompt:
      'You are the Copywright agent.\n' +
      'Write a short, personalized first-touch email for each profiled lead,\n' +
      'referencing the company profile from the Profile agent.\n' +
      'One clear value proposition, one call to action, under 120 words.',
    negativePrompt:
      'No spam patterns: no "Dear Sir/Madam", no exclamation marks, no false urgency.\n' +
      'No attachments or links in first-touch messages.\n' +
      'Never mention that the message was generated by an AI.',
    model: 'GLM-4.6',
  },
  responder: {
    db: { provider: 'mongodb' },
    api: { url: 'https://example.com/inbound-api', auth: 'Bearer ••••' },
    systemPrompt:
      'You are the Responder (Chatbot) agent.\n' +
      'Handle replies from leads across email, LinkedIn and webchat.\n' +
      'Answer questions using the company profile and approved messaging,\n' +
      'book meetings when intent is clear, and escalate to a human when unsure.\n' +
      'Log every exchange under REPLY in the CRM.',
    negativePrompt:
      'Never promise pricing, discounts or SLAs without approval.\n' +
      'Do not argue with leads; de-escalate and offer a call instead.\n' +
      'Do not continue a thread after an explicit opt-out.',
    model: 'GLM-4.6',
  },
};

export const MODEL_OPTIONS = ['GLM-4.6', 'GPT-4o', 'Claude Sonnet 4.5', 'Gemini 2.5 Pro', 'Llama 3.3 70B', 'Custom'];

/* ------------------------------------------------------------------ */
/* Settings — defaults                                                 */
/* ------------------------------------------------------------------ */

export const DEFAULT_SETTINGS: SettingsState = {
  company: {
    name: 'Northstar Growth Partners',
    website: 'https://northstaargrowth.example.com',
    description:
      'B2B growth partner helping mid-market companies build predictable, AI-assisted outbound revenue engines.',
    services: ['Lead generation', 'Outbound copywriting', 'Sales automation', 'Pipeline consulting'],
  },
  aiKey: { provider: 'OpenAI', apiKey: '' },
  smtp: { host: '', port: '587', user: '', password: '', from: '' },
  runs: { enabled: true, frequency: '1h' },
  report: { email: '' },
};

/* ------------------------------------------------------------------ */
/* Chat — mock Responder behaviour (no LLM)                            */
/* ------------------------------------------------------------------ */

export const CHAT_INITIAL: ChatMessage[] = [
  {
    id: 1,
    from: 'ai',
    text: 'Responder online. I can summarize leads, draft outreach copy, or report on the last pipeline run. (Mock mode — no LLM connected yet.)',
    time: 'now',
  },
];

const FALLBACK_REPLIES = [
  'Logged. The orchestrator will fold this into the next pipeline run — Search will re-scan for matching companies and Profile will score anything new.',
  'Understood. I attached this to the current loop cycle; Copywright will regenerate the affected first-touch drafts before the next run.',
  'Noted. Nothing in the pipeline needs to change for this — I will surface it again if the next loop finds a matching lead.',
];

export function mockResponderReply(input: string, messageCount: number): string {
  const q = input.toLowerCase();

  if (/\b(hi|hello|hey)\b/.test(q)) {
    return 'Hello. The autonomous loop is running — 7 leads in CRM, 5 potential opportunities, 2 replies awaiting handling. What would you like to do?';
  }
  if (q.includes('lead') || q.includes('company') || q.includes('search') || q.includes('scrape')) {
    return 'Search (Scrape) discovered 3 new leads in the last run: Acme Robotics (91), BlueRiver Finance (88), Northwind Logistics (84). All three were enriched by Profile and queued for Copywright.';
  }
  if (q.includes('email') || q.includes('copy') || q.includes('pitch') || q.includes('draft') || q.includes('message')) {
    return 'Copywright drafted 5 first-touch emails in the last cycle. Example opening for Acme Robotics: "J. — your new palletizing line caught my attention; manufacturers your size usually recover automation costs in 9–14 months…". Want the full draft?';
  }
  if (q.includes('reply') || q.includes('repl') || q.includes('answer') || q.includes('respond')) {
    return 'Two replies are awaiting handling: D. Lin (Orbit Health) asked for security docs, and R. Alvarez (Kestrel) has a budget-cycle question. I can draft both responses for review.';
  }
  if (q.includes('run') || q.includes('schedule') || q.includes('frequent') || q.includes('next')) {
    return 'The orchestrator currently runs the full pipeline every hour. The next run is in 12 minutes; the loop will hand results from Responder back to Search for continuous discovery.';
  }
  if (q.includes('potential') || q.includes('opportunit') || q.includes('deal') || q.includes('value')) {
    return 'POTENTIAL currently holds 5 opportunities worth $288k combined. Largest: BlueRiver Finance — quarterly lead-gen campaign at $120k (Qualified).';
  }

  return FALLBACK_REPLIES[messageCount % FALLBACK_REPLIES.length];
}
