import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { Upload, Trash2, Sparkles, Lock } from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from '@/components/ui/AppToast';
import {
  useBranding,
  useUpdateBranding,
  useUploadLogo,
  useDeleteLogo,
  getLogoUrl,
  type BrandingConfig,
} from '@/features/branding/api';
import { useBrand, approxLuminance } from '@/components/BrandingProvider';

const FOOTER_MAX = 200;
const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_LOGO_BYTES = 1024 * 1024;

interface FormState {
  brand_name: string;
  accent_color: string;
  footer_text: string;
  email_footer_text: string;
}

function deriveForm(b: BrandingConfig | undefined): FormState {
  return {
    brand_name: b?.brand_name ?? '',
    accent_color: b?.accent_color ?? '#F26522',
    footer_text: b?.footer_text ?? '',
    email_footer_text: b?.email_footer_text ?? '',
  };
}

export function BrandingTab(): JSX.Element {
  const { isAgency, isLoading: planLoading } = usePlan();
  const { data: branding, isLoading: brandingLoading } = useBranding();
  const update = useUpdateBranding();
  const upload = useUploadLogo();
  const remove = useDeleteLogo();
  const brand = useBrand();

  const [form, setForm] = useState<FormState>(() => deriveForm(branding));
  const [logoBust, setLogoBust] = useState<number>(() => Date.now());
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate the form when the branding query resolves the first time.
  useEffect(() => {
    if (branding && !hydratedRef.current) {
      setForm(deriveForm(branding));
      hydratedRef.current = true;
    }
  }, [branding]);

  const previewLogoUrl = useMemo(() => {
    if (!branding?.has_logo) return null;
    return `${getLogoUrl()}?v=${logoBust}`;
  }, [branding?.has_logo, logoBust]);

  const luminance = approxLuminance(form.accent_color);
  const lowContrast =
    luminance !== null && (luminance < 0.3 || luminance > 0.85);

  // ----- agency gate -----
  if (planLoading || brandingLoading) {
    return (
      <div className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-2/60" />
      </div>
    );
  }

  if (!isAgency) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock size={16} className="text-text-dim" />
            Upgrade to Agency for white-label branding
          </CardTitle>
          <CardDescription>
            White-label your workspace with your own brand name, logo, accent
            color, and footer. Sub-clients automatically inherit your brand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="primary" asChild>
            <a href="/app/billing">Upgrade plan</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ----- inherited banner -----
  if (branding?.is_inherited) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Branding inherited from parent agency</CardTitle>
          <CardDescription>
            Your workspace shows the parent agency's brand. Contact your agency
            to change branding.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: brand.accentColor }}
            aria-hidden
          >
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt=""
                className="h-8 w-8 object-contain"
              />
            ) : (
              <Sparkles className="text-white" size={20} />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-text">{brand.name}</div>
            <div className="text-xs text-text-dim">{brand.footer}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----- form handlers -----
  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateFile(file: File): string | null {
    if (!ACCEPTED_MIME.includes(file.type)) {
      return 'Logo must be a PNG, JPEG, or SVG file.';
    }
    if (file.size > MAX_LOGO_BYTES) {
      return 'Logo must be 1MB or smaller.';
    }
    return null;
  }

  const handleLogoFile = useCallback(
    async (file: File) => {
      const err = validateFile(file);
      if (err) {
        toast.error(err);
        return;
      }
      try {
        await upload.mutateAsync(file);
        setLogoBust(Date.now());
        toast.success('Logo uploaded · reload to see across the app');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Logo upload failed.';
        toast.error(msg);
      }
    },
    [upload],
  );

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleLogoFile(file);
    }
    // Reset so the same file can be re-selected.
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleLogoFile(file);
  }

  async function handleRemoveLogo() {
    try {
      await remove.mutateAsync();
      setLogoBust(Date.now());
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo.');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        brand_name: form.brand_name.trim(),
        accent_color: form.accent_color,
        footer_text: form.footer_text,
        email_footer_text: form.email_footer_text,
      });
      toast.success('Branding updated · reload to see across the app');
    } catch {
      toast.error('Failed to save branding.');
    }
  }

  // ----- render -----
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Workspace branding · Agency tier
        </h2>
        <p className="text-sm text-text-dim">
          White-label the app for you and your sub-clients. Changes apply to
          everyone in your workspace tree.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Preview pane */}
        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
            <CardDescription>Reflects your current form values.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border-muted bg-surface-2/60 p-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg overflow-hidden"
                  style={{ backgroundColor: form.accent_color }}
                  aria-hidden
                >
                  {previewLogoUrl ? (
                    <img
                      src={previewLogoUrl}
                      alt=""
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <Sparkles className="text-white" size={18} />
                  )}
                </div>
                <div className="text-sm font-semibold text-text">
                  {form.brand_name || 'Your brand'}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: form.accent_color }}
                >
                  Primary action
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border-muted bg-transparent px-3 py-1.5 text-sm text-text"
                >
                  Secondary
                </button>
              </div>

              <div className="mt-6 border-t border-border-muted pt-3 text-xs text-text-dim">
                {form.footer_text || 'Footer text appears here'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Brand configuration</CardTitle>
            <CardDescription>
              Saved branding cascades to every user and sub-client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="brand-name">Brand name</Label>
                <Input
                  id="brand-name"
                  value={form.brand_name}
                  onChange={(e) => patchForm('brand_name', e.target.value)}
                  maxLength={60}
                  placeholder="Acme Reputation Co."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accent-color">Accent color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accent-color"
                    type="color"
                    value={form.accent_color}
                    onChange={(e) => patchForm('accent_color', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border border-border-muted bg-transparent"
                  />
                  <Input
                    value={form.accent_color}
                    onChange={(e) => patchForm('accent_color', e.target.value)}
                    maxLength={7}
                    className="font-mono"
                  />
                </div>
                {lowContrast ? (
                  <p className="text-xs text-accent3">
                    ⚠ This color may have low contrast against the dark/light UI
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed p-3 transition ${
                    dragging
                      ? 'border-accent bg-surface-2/60'
                      : 'border-border-muted bg-surface-2/30 hover:bg-surface-2/60'
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-3">
                    {previewLogoUrl ? (
                      <img
                        src={previewLogoUrl}
                        alt="Logo"
                        className="h-10 w-10 rounded-md object-contain bg-white/5 p-1"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border-muted bg-surface">
                        <Upload size={16} className="text-text-dim" />
                      </div>
                    )}
                    <div className="text-xs text-text-dim">
                      <div className="text-text">
                        {previewLogoUrl ? 'Replace logo' : 'Drag & drop or click to upload'}
                      </div>
                      <div>PNG, JPEG, or SVG · max 1MB</div>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MIME.join(',')}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {branding?.has_logo ? (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent3 hover:underline"
                  >
                    <Trash2 size={12} /> Remove logo
                  </button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="footer-text">Footer text</Label>
                <Textarea
                  id="footer-text"
                  value={form.footer_text}
                  onChange={(e) => patchForm('footer_text', e.target.value)}
                  maxLength={FOOTER_MAX}
                  rows={2}
                  placeholder="Powered by Acme"
                />
                <div className="text-right text-xs text-text-dim">
                  {form.footer_text.length} / {FOOTER_MAX}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-footer">Email footer text</Label>
                <Textarea
                  id="email-footer"
                  value={form.email_footer_text}
                  onChange={(e) =>
                    patchForm('email_footer_text', e.target.value)
                  }
                  maxLength={FOOTER_MAX}
                  rows={2}
                  placeholder="Sent via Acme · reply STOP to unsubscribe"
                />
                <div className="text-right text-xs text-text-dim">
                  {form.email_footer_text.length} / {FOOTER_MAX}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={update.isPending}
                >
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default BrandingTab;
