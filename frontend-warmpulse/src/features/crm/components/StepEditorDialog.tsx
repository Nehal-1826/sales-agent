import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Sparkles, Type, Code, Wand2 } from 'lucide-react';
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
  useAddStep,
  useUpdateStep,
  useCrmTemplates,
  useAiDraft,
  extractCrmError,
} from '../api';
import { useTemplates as useDesignerTemplates } from '@/features/tools/api';
import {
  CRM_TEMPLATE_VARIABLES,
  type CrmSequenceStep,
  type CrmStepContentMode,
} from '../types';
import { EmailPreview } from './EmailPreview';

const stepSchema = z.object({
  delay_days: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole days only')
    .min(0, 'Must be ≥ 0')
    .max(365, 'Too far out'),
  subject: z.string().trim().min(1, 'Subject is required').max(200, 'Too long'),
  body: z.string().trim().min(1, 'Write the email body'),
  ai_prompt: z.string().trim().max(2000).optional(),
});
type StepForm = z.infer<typeof stepSchema>;

const DEFAULTS: StepForm = { delay_days: 1, subject: '', body: '', ai_prompt: '' };

const MODES: { id: CrmStepContentMode; label: string; icon: typeof Type }[] = [
  { id: 'text', label: 'Plain text', icon: Type },
  { id: 'html', label: 'Designer HTML', icon: Code },
  { id: 'ai', label: 'AI per-lead', icon: Wand2 },
];

export interface StepEditorDialogProps {
  sequenceId: string;
  campaignId: string;
  /** Pass a step to edit it; omit / null to add a new one. */
  step?: CrmSequenceStep | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Add / edit a single sequence step. A step can send plain text, a designer
 * HTML template, or AI-written-per-lead content. `delay_days` is the wait
 * before the email goes out.
 */
export function StepEditorDialog({
  sequenceId,
  campaignId,
  step,
  open,
  onOpenChange,
}: StepEditorDialogProps) {
  const addStep = useAddStep();
  const updateStep = useUpdateStep();
  const templates = useCrmTemplates();
  const designer = useDesignerTemplates();
  const aiDraft = useAiDraft();
  const editing = !!step;

  const [mode, setMode] = useState<CrmStepContentMode>('text');
  const [textTemplateId, setTextTemplateId] = useState('');
  const [designerId, setDesignerId] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StepForm>({
    resolver: zodResolver(stepSchema),
    defaultValues: DEFAULTS,
  });

  const watched = watch();

  // Picking a CRM text template copies its subject + body into the step.
  const applyTextTemplate = (id: string) => {
    setTextTemplateId(id);
    const tpl = (templates.data ?? []).find((t) => t.id === id);
    if (!tpl) return;
    setValue('subject', tpl.subject, { shouldValidate: true });
    setValue('body', tpl.body, { shouldValidate: true });
  };

  // Picking a designer template copies its HTML into the body.
  const applyDesigner = (id: string) => {
    setDesignerId(id);
    const tpl = (designer.data?.items ?? []).find((t) => t.id === id);
    if (!tpl) return;
    setValue('body', tpl.html, { shouldValidate: true });
    if (!watched.subject) setValue('subject', tpl.name, { shouldValidate: true });
  };

  const runAiDraft = () => {
    const prompt = mode === 'ai' ? watched.ai_prompt : watched.subject || watched.body;
    if (!prompt || !prompt.trim()) {
      toast.error('Type a short description first, then Generate.');
      return;
    }
    aiDraft.mutate(prompt.trim(), {
      onSuccess: (res) => {
        if (!res.generated) {
          toast.error('AI is not configured on this server.');
          return;
        }
        setValue('subject', res.subject, { shouldValidate: true });
        setValue('body', res.body, { shouldValidate: true });
        toast.success('Draft generated — edit as you like.');
      },
      onError: (err) => toast.error(extractCrmError(err, 'Could not generate draft')),
    });
  };

  useEffect(() => {
    if (open) {
      setTextTemplateId('');
      setDesignerId('');
      setShowPreview(false);
      setMode(step?.content_mode ?? 'text');
      reset(
        step
          ? {
              delay_days: step.delay_days,
              subject: step.subject,
              body: step.body,
              ai_prompt: step.ai_prompt ?? '',
            }
          : DEFAULTS,
      );
    }
  }, [open, step, reset]);

  const pending = addStep.isPending || updateStep.isPending;

  const close = (v: boolean) => {
    if (!v) {
      addStep.reset();
      updateStep.reset();
    }
    onOpenChange(v);
  };

  const onSubmit = (values: StepForm) => {
    if (mode === 'ai' && !(values.ai_prompt && values.ai_prompt.trim())) {
      toast.error('Describe what the AI should write for each lead.');
      return;
    }
    const payload = {
      delay_days: values.delay_days,
      subject: values.subject,
      body: values.body,
      content_mode: mode,
      ai_prompt: mode === 'ai' ? (values.ai_prompt ?? '') : null,
    };
    if (step) {
      updateStep.mutate(
        { id: step.id, sequenceId, payload },
        {
          onSuccess: () => {
            toast.success('Step updated');
            close(false);
          },
          onError: (err) => toast.error(extractCrmError(err, 'Could not save step')),
        },
      );
    } else {
      addStep.mutate(
        { sequenceId, campaignId, payload },
        {
          onSuccess: () => {
            toast.success('Step added');
            close(false);
          },
          onError: (err) => toast.error(extractCrmError(err, 'Could not add step')),
        },
      );
    }
  };

  const selectCls =
    'w-full rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent/50';

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>{editing ? 'Edit step' : 'Add a step'}</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody className="space-y-4">
            <FormField
              label="Wait (days)"
              htmlFor="se-delay"
              required
              error={errors.delay_days?.message}
              hint="Days to wait before this email is sent. Use 0 to send immediately."
            >
              <Input
                id="se-delay"
                type="number"
                min={0}
                step={1}
                placeholder="3"
                {...register('delay_days')}
              />
            </FormField>

            {/* Content type toggle */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-dim">Content type</p>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border-muted bg-surface-2/40 p-1">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMode(m.id);
                        setShowPreview(false);
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-accent text-bg'
                          : 'text-text-dim hover:text-text'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Text mode: CRM template picker + AI generate */}
            {mode === 'text' && (
              <FormField
                label="Start from a template"
                htmlFor="se-template"
                hint="Pick a ready-made or saved template, or generate one with AI. You can still edit after."
              >
                <div className="flex gap-2">
                  <select
                    id="se-template"
                    value={textTemplateId}
                    onChange={(e) => applyTextTemplate(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Write from scratch…</option>
                    <optgroup label="Built-in library">
                      {(templates.data ?? [])
                        .filter((t) => t.is_builtin)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </optgroup>
                    {(templates.data ?? []).some((t) => !t.is_builtin) && (
                      <optgroup label="Your templates">
                        {(templates.data ?? [])
                          .filter((t) => !t.is_builtin)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={runAiDraft}
                    disabled={aiDraft.isPending}
                    leftIcon={
                      aiDraft.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    AI
                  </Button>
                </div>
              </FormField>
            )}

            {/* Designer HTML mode: pick a Tools designer template */}
            {mode === 'html' && (
              <FormField
                label="Designer template"
                htmlFor="se-designer"
                hint="Sends as your designed HTML email. Build templates on the Tools page. Variables below are still filled per lead."
              >
                <select
                  id="se-designer"
                  value={designerId}
                  onChange={(e) => applyDesigner(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Choose a designer template…</option>
                  {(designer.data?.items ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.created_with_llm ? ' (AI-designed)' : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {/* AI per-lead mode: the prompt */}
            {mode === 'ai' && (
              <FormField
                label="AI instructions"
                htmlFor="se-aiprompt"
                hint="AI writes a fresh email for each lead from this. If AI is ever unavailable, the subject + body below are sent as fallback."
              >
                <Textarea
                  id="se-aiprompt"
                  rows={3}
                  placeholder="Write a friendly intro offering a 15-min call about improving their cold-email deliverability."
                  {...register('ai_prompt')}
                />
              </FormField>
            )}

            <FormField
              label="Subject"
              htmlFor="se-subject"
              required
              error={errors.subject?.message}
            >
              <Input
                id="se-subject"
                placeholder="Following up, {{first_name}}"
                {...register('subject')}
              />
            </FormField>
            <FormField
              label={mode === 'html' ? 'HTML body' : mode === 'ai' ? 'Fallback body' : 'Body'}
              htmlFor="se-body"
              required
              error={errors.body?.message}
            >
              <Textarea
                id="se-body"
                rows={mode === 'html' ? 6 : 8}
                placeholder={
                  mode === 'html'
                    ? '<html>…</html> — usually filled by picking a designer template above'
                    : 'Hi {{first_name}},\n\nJust wanted to circle back on…'
                }
                {...register('body')}
              />
            </FormField>

            <div className="flex items-center justify-between">
              <p className="flex items-start gap-1.5 text-[11px] text-text-dim">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                <span>
                  Variables:{' '}
                  <span className="font-mono text-accent">
                    {CRM_TEMPLATE_VARIABLES.join(' ')}
                  </span>
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview((v) => !v)}
                leftIcon={
                  showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />
                }
              >
                {showPreview ? 'Hide preview' : 'Preview'}
              </Button>
            </div>

            {showPreview && (
              <EmailPreview
                subject={watched.subject}
                body={watched.body}
                isHtml={mode === 'html'}
              />
            )}
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              leftIcon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {pending
                ? editing
                  ? 'Saving…'
                  : 'Adding…'
                : editing
                  ? 'Save step'
                  : 'Add step'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
