import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Monitor, Smartphone, Copy, Image as ImageIcon, Upload, Building2 } from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import { api } from '@/lib/api';
import { useBranding } from '@/features/branding/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useGenerateTemplate,
  useSanitizeHtml,
  useTemplates,
  useUpdateTemplate,
} from '@/features/tools/api';
import type { EmailTemplate } from '@/features/tools/types';

const BLANK_HTML = `<!doctype html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <h1>New template</h1>
  <p>Write your email here.</p>
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</body></html>`;

/** Merge variables users can insert — a real, working feature for Pro+. */
const MERGE_VARS = ['{{first_name}}', '{{company}}', '{{sender_name}}', '{{unsubscribe_url}}'];

export function TemplateDesigner() {
  const { isPro, isProPlus, isAgency } = usePlan();
  // Tier presentation: chips (Pro+), device-frame preview (Pro Plus+),
  // duplicate + premium header (Agency).
  const showVars = isPro; // isPro = "Pro and above"
  const showDeviceFrame = isProPlus;
  const showDuplicate = isAgency;

  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const branding = useBranding();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const templatesQ = useTemplates();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const deleteMut = useDeleteTemplate();
  const generateMut = useGenerateTemplate();
  const sanitizeMut = useSanitizeHtml();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('Untitled template');
  const [html, setHtml] = useState(BLANK_HTML);
  const [sanitized, setSanitized] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [prompt, setPrompt] = useState('');

  const sanitizeRef = useRef(sanitizeMut);
  sanitizeRef.current = sanitizeMut;

  // Debounced sanitize for preview.
  useEffect(() => {
    const timer = setTimeout(() => {
      sanitizeRef.current
        .mutateAsync({ html })
        .then((res) => setSanitized(res.html))
        .catch(() => setSanitized(html));
    }, 500);
    return () => clearTimeout(timer);
  }, [html]);

  const loadTemplate = (t: EmailTemplate) => {
    setActiveId(t.id);
    setName(t.name);
    setHtml(t.html);
    setDirty(false);
  };

  const newTemplate = () => {
    setActiveId(null);
    setName('Untitled template');
    setHtml(BLANK_HTML);
    setDirty(false);
  };

  const handleSave = async () => {
    try {
      if (activeId) {
        await updateMut.mutateAsync({ id: activeId, payload: { name, html } });
        toast.success('Template updated');
      } else {
        const created = await createMut.mutateAsync({ name, html });
        setActiveId(created.id);
        toast.success('Template created');
      }
      setDirty(false);
    } catch {
      toast.error('Save failed');
    }
  };

  const handleDelete = async () => {
    if (!activeId) return;
    try {
      await deleteMut.mutateAsync(activeId);
      toast.success('Template deleted');
      newTemplate();
      setShowDelete(false);
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleGenerate = async () => {
    // Use a local id, not the `activeId` state — setActiveId() won't have
    // applied within this same async run, so reading `activeId` here would be
    // stale (null) and produce POST .../templates//generate-llm → 404.
    let id = activeId;
    if (!id) {
      // Need a template to attach AI generation to — create one first.
      try {
        const created = await createMut.mutateAsync({ name, html });
        id = created.id;
        setActiveId(created.id);
      } catch {
        toast.error('Could not create template before generation');
        return;
      }
    }
    try {
      const res = await generateMut.mutateAsync({
        id,
        payload: { prompt },
      });
      setHtml(res.html);
      setDirty(true);
      setShowGenerate(false);
      setPrompt('');
      toast.success('Generated');
    } catch {
      toast.error('Generation failed');
    }
  };

  const insertVar = (v: string) => {
    setHtml((prev) => `${prev}${v}`);
    setDirty(true);
  };

  const insertLogoTag = (dataUri: string) => {
    setHtml(
      (prev) =>
        `${prev}\n<img src="${dataUri}" alt="logo" style="max-width:200px;height:auto;display:block;margin:12px 0;" />`,
    );
    setDirty(true);
    toast.success('Logo inserted');
  };

  const readAsDataUri = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const onLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 1_000_000) {
      toast.error('Image too large — keep logos under 1 MB so emails stay light');
      return;
    }
    try {
      insertLogoTag(await readAsDataUri(file));
    } catch {
      toast.error('Could not read image');
    }
  };

  const insertWorkspaceLogo = async () => {
    try {
      const res = await api.get('/workspace/branding/logo', { responseType: 'blob' });
      insertLogoTag(await readAsDataUri(res.data as Blob));
    } catch {
      toast.error('No workspace logo found — upload one in Workspace → Branding');
    }
  };

  const onTemplateFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error('Could not read file');
      return;
    }
    let nextHtml = text;
    if (lower.endsWith('.txt')) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      nextHtml = `<!doctype html>\n<html><body style="font-family:sans-serif;padding:24px;white-space:pre-wrap;">${escaped}</body></html>`;
    } else if (lower.endsWith('.eml')) {
      // Extract the HTML part of a raw .eml; fall back to the whole body.
      const match = text.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i);
      nextHtml = match?.[1]?.trim() || text;
    }
    // .html / .htm / .mjml load as-is.
    setHtml(nextHtml);
    setName(file.name.replace(/\.[^.]+$/, '') || 'Imported template');
    setActiveId(null);
    setDirty(true);
    toast.success(`Imported ${file.name}`);
  };

  const handleDuplicate = async () => {
    try {
      const created = await createMut.mutateAsync({ name: `${name} (copy)`, html });
      setActiveId(created.id);
      setName(created.name);
      setDirty(false);
      toast.success('Template duplicated');
    } catch {
      toast.error('Duplicate failed');
    }
  };

  const templates = templatesQ.data?.items ?? [];

  const tierTitle = isAgency
    ? 'Template Studio'
    : isProPlus
      ? 'Template Lab'
      : isPro
        ? 'Template Designer'
        : 'Template Designer';

  return (
    <div className="space-y-4">
      <header
        className={
          isAgency
            ? 'relative overflow-hidden rounded-2xl border border-border-muted p-5'
            : 'rounded-2xl border border-border-muted bg-surface-2/40 p-5'
        }
      >
        {isAgency && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 140% at 10% -20%, color-mix(in srgb, var(--wp-accent) 24%, transparent), transparent 60%)',
            }}
          />
        )}
        <div className="relative">
          <h1
            className={
              isAgency
                ? 'bg-gradient-to-r from-accent via-accent4 to-accent3 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent'
                : 'text-xl font-bold tracking-tight text-text'
            }
          >
            {tierTitle}
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            Compose, preview, and save your warmup email templates.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Templates</CardTitle>
          <Button variant="ghost" size="sm" onClick={newTemplate}>
            New
          </Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {templatesQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : templates.length === 0 ? (
            <EmptyState title="No templates" description="Create one to get started." />
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => loadTemplate(t)}
                className={`w-full truncate rounded-lg border px-3 py-2 text-left text-xs ${
                  activeId === t.id
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border-muted bg-surface text-text-dim hover:border-accent'
                }`}
              >
                {t.name}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="max-w-xs"
            />
            <div className="ml-auto flex gap-2">
              <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                {activeId ? 'Save' : 'Save as'}
              </Button>
              <Button variant="secondary" onClick={() => setShowGenerate(true)}>
                Generate with AI
              </Button>
              {showDuplicate && activeId ? (
                <Button variant="outline" onClick={handleDuplicate} disabled={createMut.isPending}>
                  <Copy className="h-4 w-4" /> Duplicate
                </Button>
              ) : null}
              {activeId ? (
                <Button variant="danger" onClick={() => setShowDelete(true)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
          {dirty ? <p className="text-xs text-accent3">Unsaved changes</p> : null}
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onLogoFile(f);
                e.target.value = '';
              }}
            />
            <input
              ref={templateInputRef}
              type="file"
              accept=".html,.htm,.txt,.mjml,.eml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onTemplateFile(f);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => logoInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4" /> Insert logo
            </Button>
            {isAgency && branding.data?.has_logo && (
              <Button variant="ghost" size="sm" onClick={insertWorkspaceLogo}>
                <Building2 className="h-4 w-4" /> Workspace logo
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => templateInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import template
            </Button>
            <span className="text-xs text-text-dim">.html · .htm · .txt · .mjml · .eml</span>
          </div>
          {showVars && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-dim">Insert variable:</span>
              {MERGE_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVar(v)}
                  className="rounded-full border border-border-muted bg-surface px-2.5 py-1 font-mono text-[11px] text-accent transition-colors hover:bg-accent/10"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="HTML editor">
              <Textarea
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value);
                  setDirty(true);
                }}
                rows={22}
                className="font-mono text-xs"
              />
            </FormField>
            <FormField label="Live preview">
              {showDeviceFrame && (
                <div className="mb-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDevice('desktop')}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                      device === 'desktop'
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-muted text-text-dim hover:text-text'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setDevice('mobile')}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                      device === 'mobile'
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-muted text-text-dim hover:text-text'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> Mobile
                  </button>
                </div>
              )}
              <div className="flex h-[460px] justify-center overflow-hidden rounded-lg border border-border-muted bg-white">
                <iframe
                  title="Template preview"
                  srcDoc={sanitized || html}
                  sandbox=""
                  className="h-full"
                  style={{ width: showDeviceFrame && device === 'mobile' ? 390 : '100%' }}
                />
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <AppDialog open={showGenerate} onOpenChange={setShowGenerate}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Generate with </AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the email you want..."
            />
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => setShowGenerate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateMut.isPending || prompt.trim().length < 3}
            >
              {generateMut.isPending ? 'Generating...' : 'Generate'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={showDelete} onOpenChange={setShowDelete}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Delete template?</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <p className="text-sm text-text-dim">
              This action cannot be undone. The template will be permanently deleted.
            </p>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleteMut.isPending}>
              Delete
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
      </div>
    </div>
  );
}
