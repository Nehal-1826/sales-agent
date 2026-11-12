import { useRef, useState } from 'react';
import { Eye, Image as ImageIcon, Loader2, Trash2, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import {
  useCrmTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useCreateTemplateFromEml,
  useUploadTemplateLogo,
  useDeleteTemplateLogo,
  extractCrmError,
} from '../api';
import { CRM_TEMPLATE_VARIABLES } from '../types';
import { EmailPreview } from './EmailPreview';

export interface TemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manage the workspace's custom email templates: create one inline, upload a
 * `.html` / `.txt` file whose contents become the body, and delete custom
 * ones. Built-in templates are listed read-only (no delete). The picker in the
 * step editor reads the same list.
 */

/** Surface the backend's reason (415 wrong type, 413 too large) verbatim. */
function logoError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
}

/**
 * Logo upload / preview / remove for one custom template.
 *
 * The logo is embedded in sent email through the {{logo}} variable, so it is
 * served from a public URL — mail clients fetch images with no session, and
 * Gmail strips base64 data: URIs.
 */
function TemplateLogoControl({
  hasLogo,
  logoUrl,
  onUpload,
  onRemove,
  busy,
}: {
  hasLogo: boolean;
  logoUrl: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first so picking the same file twice still fires onChange.
          e.target.value = '';
          if (file) onUpload(file);
        }}
      />
      {hasLogo && logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-6 w-6 rounded border border-border-muted object-contain"
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        leftIcon={
          busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )
        }
        title={hasLogo ? 'Replace the logo shown in this template' : 'Add a logo to this template'}
      >
        {hasLogo ? 'Replace' : 'Logo'}
      </Button>
      {hasLogo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onRemove}
          title="Remove the logo from this template"
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}


export function TemplateManagerDialog({
  open,
  onOpenChange,
}: TemplateManagerDialogProps) {
  const templates = useCrmTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const fromEml = useCreateTemplateFromEml();
  const uploadLogo = useUploadTemplateLogo();
  const removeLogo = useDeleteTemplateLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setSubject('');
    setBody('');
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 200_000) {
      toast.error('File too large (max 200 KB).');
      return;
    }
    // .eml is a full MIME message, not markup — hand it to the server, which
    // picks the HTML part over the plain-text fallback and pulls the subject.
    if (/\.eml$/i.test(file.name)) {
      fromEml.mutate(file, {
        onSuccess: (tpl) => {
          setName(tpl.name);
          setSubject(tpl.subject);
          setBody(tpl.body);
          toast.success('Template created from .eml');
        },
        onError: (err) =>
          toast.error(extractCrmError(err, 'Could not read that .eml file')),
      });
      return;
    }
    const text = await file.text();
    setBody(text);
    if (!name) setName(file.name.replace(/\.(html?|txt)$/i, ''));
    toast.success('File loaded into the body.');
  };

  const onCreate = () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error('Name, subject and body are all required.');
      return;
    }
    createTemplate.mutate(
      { name: name.trim(), subject: subject.trim(), body, category: 'Custom' },
      {
        onSuccess: () => {
          toast.success('Template saved');
          reset();
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not save template')),
      },
    );
  };

  const onDelete = (id: string, label: string) => {
    deleteTemplate.mutate(id, {
      onSuccess: () => toast.success(`Deleted “${label}”`),
      onError: (err) => toast.error(extractCrmError(err, 'Could not delete template')),
    });
  };

  const builtins = (templates.data ?? []).filter((t) => t.is_builtin);
  const custom = (templates.data ?? []).filter((t) => !t.is_builtin);

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>Email templates</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody className="space-y-5">
          {/* New / upload */}
          <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text">New template</h4>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Upload className="h-3.5 w-3.5" />}
                onClick={() => fileRef.current?.click()}
              >
                Upload .html / .txt / .eml
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,.txt,.eml,text/html,text/plain,message/rfc822"
                className="hidden"
                onChange={(e) => void onUpload(e.target.files?.[0])}
              />
            </div>
            <FormField label="Name" htmlFor="tpl-name" required>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My cold intro"
              />
            </FormField>
            <FormField label="Subject" htmlFor="tpl-subject" required>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Quick question, {{first_name}}"
              />
            </FormField>
            <FormField label="Body" htmlFor="tpl-body" required>
              <Textarea
                id="tpl-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'Hi {{first_name}},\n\n…'}
              />
            </FormField>
            <p className="text-[11px] text-text-dim">
              Variables you can use:{' '}
              <span className="font-mono text-accent">
                {CRM_TEMPLATE_VARIABLES.join(' ')}
              </span>{' '}
              — filled per-lead at send time.
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onCreate}
                disabled={createTemplate.isPending}
                leftIcon={
                  createTemplate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : undefined
                }
              >
                {createTemplate.isPending ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          </div>

          {/* Your templates */}
          {custom.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Your templates
              </h4>
              {custom.map((t) => (
                <div key={t.id} className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-border-muted bg-surface p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{t.name}</p>
                      <p className="truncate text-xs text-text-dim">{t.subject}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPreviewId((p) => (p === t.id ? null : t.id))
                        }
                        leftIcon={<Eye className="h-3.5 w-3.5" />}
                      >
                        {previewId === t.id ? 'Hide' : 'View'}
                      </Button>
                      <TemplateLogoControl
                        hasLogo={Boolean(t.has_logo)}
                        logoUrl={t.logo_url ?? null}
                        onUpload={(file) =>
                          uploadLogo.mutate(
                            { id: t.id, file },
                            {
                              onSuccess: () => toast.success('Logo added to template'),
                              onError: (err) =>
                                toast.error(logoError(err, 'Could not upload logo')),
                            },
                          )
                        }
                        onRemove={() =>
                          removeLogo.mutate(t.id, {
                            onSuccess: () => toast.success('Logo removed'),
                            onError: () => toast.error('Could not remove logo'),
                          })
                        }
                        busy={uploadLogo.isPending || removeLogo.isPending}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(t.id, t.name)}
                        disabled={deleteTemplate.isPending}
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {previewId === t.id && (
                    <EmailPreview subject={t.subject} body={t.body} isHtml={false} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Built-in library (read-only) */}
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-dim">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Built-in library
            </h4>
            {builtins.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border-muted bg-surface p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{t.name}</p>
                    <p className="truncate text-xs text-text-dim">{t.subject}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewId((p) => (p === t.id ? null : t.id))}
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                    >
                      {previewId === t.id ? 'Hide' : 'View'}
                    </Button>
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Built-in
                    </span>
                  </div>
                </div>
                {previewId === t.id && (
                  <EmailPreview subject={t.subject} body={t.body} isHtml={false} />
                )}
              </div>
            ))}
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
