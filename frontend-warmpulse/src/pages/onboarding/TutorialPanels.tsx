import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Zap, 
  Target, 
  Info,
  Sparkles,
  Search,
  Mail,
  Lock
} from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import { useT } from '@/lib/i18n';
import '@/pages/landing/hero-theme.css';

interface TutorialPanelProps {
  onFinish: (autoCrm: boolean) => void;
  autoCrmEnabled: boolean;
  onToggleAutoCrm: (enabled: boolean) => void;
}

export function TutorialPanel({ onFinish, autoCrmEnabled, onToggleAutoCrm }: TutorialPanelProps) {
  const t = useT();
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Automated CRM (Sent-folder import + reply tracking) is a Pro Plus / Agency
  // capability. Below that, only Manual mode is selectable.
  const { isProPlus } = usePlan();

  const advance = () => setStep(s => Math.min(s + 1, totalSteps));
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="onb-side__card"
      style={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}
    >
      <div className="onb-side__panel-head">
        <span className="onb-side__panel-eyebrow">{t('onb.tutorial.eyebrow')}</span>
        <h4 className="onb-side__title">
          {step === 1 && t('onb.tutorial.step1Title')}
          {step === 2 && t('onb.tutorial.step2Title')}
          {step === 3 && t('onb.tutorial.step3Title')}
        </h4>
      </div>

      <div style={{ flex: 1, position: 'relative', marginTop: 16 }}>
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <p className="text-sm text-text-dim leading-relaxed">
                {t('onb.tutorial.step1Desc')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-surface-2 border border-border-muted">
                  <Zap size={16} className="text-accent mb-2" />
                  <div className="text-xs font-bold text-text uppercase tracking-wider">{t('onb.tutorial.autoPilotTitle')}</div>
                  <p className="text-[11px] text-text-dim mt-1">{t('onb.tutorial.autoPilotDesc')}</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2 border border-border-muted">
                  <Target size={16} className="text-blue-400 mb-2" />
                  <div className="text-xs font-bold text-text uppercase tracking-wider">{t('onb.tutorial.inboxFocusTitle')}</div>
                  <p className="text-[11px] text-text-dim mt-1">{t('onb.tutorial.inboxFocusDesc')}</p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <p className="text-sm text-text-dim leading-relaxed">
                {t('onb.tutorial.step2Desc')}
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="h-5 w-5 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold">1</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text uppercase">{t('onb.tutorial.rampTitle')}</div>
                    <p className="text-[11px] text-text-dim">{t('onb.tutorial.rampDesc')}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-5 w-5 rounded-full bg-blue-400/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold">2</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text uppercase">{t('onb.tutorial.networkTitle')}</div>
                    <p className="text-[11px] text-text-dim">{t('onb.tutorial.networkDesc')}</p>
                  </div>
                </li>
              </ul>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-accent" />
                  <span className="text-sm font-bold text-text">{t('onb.tutorial.crmTitle')}</span>
                </div>
                <p className="text-xs text-text-dim leading-relaxed">
                  {t('onb.tutorial.crmDesc')}
                </p>
                
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => isProPlus && onToggleAutoCrm(true)}
                    disabled={!isProPlus}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      !isProPlus
                        ? 'bg-surface-2 border-border-muted text-text-dim opacity-60 cursor-not-allowed'
                        : autoCrmEnabled
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-surface-2 border-border-muted text-text-dim'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isProPlus ? <Search size={14} /> : <Lock size={14} />}
                      <div className="text-left">
                        <div className="text-[11px] font-bold uppercase">
                          {isProPlus ? t('onb.tutorial.autoModeRec') : t('onb.tutorial.autoModePro')}
                        </div>
                        <div className="text-[10px] opacity-80">
                          {isProPlus
                            ? t('onb.tutorial.autoModeDescRec')
                            : t('onb.tutorial.autoModeDescPro')}
                        </div>
                      </div>
                    </div>
                    {isProPlus && autoCrmEnabled && <CheckCircle2 size={14} />}
                  </button>

                  <button
                    onClick={() => onToggleAutoCrm(false)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      !autoCrmEnabled 
                        ? 'bg-white/10 border-white/40 text-text' 
                        : 'bg-surface-2 border-border-muted text-text-dim'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail size={14} />
                      <div className="text-left">
                        <div className="text-[11px] font-bold uppercase">{t('onb.tutorial.manualModeLabel')}</div>
                        <div className="text-[10px] opacity-80">{t('onb.tutorial.manualModeDesc')}</div>
                      </div>
                    </div>
                    {!autoCrmEnabled && <CheckCircle2 size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 px-3 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Info size={12} className="shrink-0 mt-0.5" />
                <p className="text-[10px]">
                  {isProPlus
                    ? t('onb.tutorial.infoWorkspace')
                    : t('onb.tutorial.infoManualCrm')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 pt-4 border-t border-border-muted flex items-center justify-between">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div 
              key={i} 
              className={`h-1 rounded-full transition-all ${
                i + 1 === step ? 'w-4 bg-accent' : 'w-1 bg-border-muted'
              }`} 
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 1 && (
            <button onClick={goBack} className="onb-side__switch" style={{ margin: 0 }}>
              <ArrowLeft size={13} strokeWidth={2.2} />
              {t('onb.tutorial.back')}
            </button>
          )}
          <button
            onClick={step === totalSteps ? () => onFinish(autoCrmEnabled) : advance}
            className="onb-side__inline-cta"
            style={{ margin: 0 }}
          >
            {step === totalSteps ? t('onb.tutorial.finish') : t('onb.tutorial.continue')}
            <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
