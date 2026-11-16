/**
 * TS types matching backend `app/schemas/tools.py`.
 * Keep in sync with any schema changes.
 */

export type ContentMode = 'A' | 'B' | 'C' | 'D';

export interface PerProviderResult {
  inbox: number;
  promotions: number;
  spam: number;
  blocked: number;
}

export interface PlacementResults {
  inbox: number;
  promotions: number;
  spam: number;
  blocked: number;
  per_provider: {
    gmail: PerProviderResult;
    outlook: PerProviderResult;
    yahoo: PerProviderResult;
  };
}

export interface PlacementTest {
  test_id: string;
  mailbox_id: string;
  seed_count: number;
  results: PlacementResults;
  sent_at: string;
}

export interface PlacementTestListResponse {
  items: PlacementTest[];
  total: number;
}

export interface RunPlacementTestPayload {
  mailbox_id: string;
  subject: string;
  body: string;
  is_html?: boolean;
}

export interface SpamTrigger {
  type: 'word' | 'caps' | 'punct' | 'html' | 'shortener' | 'unsubscribe';
  word?: string | null;
  line?: string | null;
  severity: 'major' | 'minor';
}

export interface SpamScan {
  id: string;
  score: number;
  passed: boolean;
  triggers: SpamTrigger[];
  created_at: string;
}

export interface SpamScanListResponse {
  items: SpamScan[];
  total: number;
}

export interface RunSpamScanPayload {
  subject: string;
  body: string;
  is_html?: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  html: string;
  thumbnail: string | null;
  created_with_llm: boolean;
  created_at: string;
}

export interface TemplateListResponse {
  items: EmailTemplate[];
  total: number;
}

export interface CreateTemplatePayload {
  name: string;
  html: string;
  thumbnail?: string | null;
  created_with_llm?: boolean;
}

export interface UpdateTemplatePayload {
  name?: string;
  html?: string;
  thumbnail?: string | null;
}

export interface GenerateTemplatePayload {
  prompt: string;
}

export interface GenerateTemplateResponse {
  html: string;
}

export interface PreviewHtmlPayload {
  html: string;
}

export interface PreviewHtmlResponse {
  html: string;
}

export interface WarmupSample {
  subject: string;
  body: string;
  is_html: boolean;
  peer_email_mock: string;
}

export interface WarmupPreviewResult {
  samples: WarmupSample[];
}

export interface WarmupPreviewPayload {
  mailbox_id: string;
  count: number;
  mode: ContentMode;
}
