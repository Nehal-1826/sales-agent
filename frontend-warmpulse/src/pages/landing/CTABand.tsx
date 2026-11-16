import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';

export function CTABand() {
  const t = useT();
  return (
    <section className="relative w-full px-6 py-[100px]">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7 }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-accent/30 p-10 md:p-16"
      >
        {/* gradient background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(135deg, rgba(242, 101, 34,0.18) 0%, rgba(255, 138, 75,0.10) 50%, rgba(10,10,15,1) 100%)',
          }}
        />
        {/* soft rotating accent */}
        <motion.div
          aria-hidden="true"
          className="absolute -top-1/2 left-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(242, 101, 34,0.25), rgba(242, 101, 34,0) 60%)',
          }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-4xl font-extrabold leading-tight md:text-5xl">
            <span className="bg-gradient-to-br from-accent to-accent2 bg-clip-text text-transparent">
              {t('sections.ctaBand.heading')}
            </span>
          </h2>
          <p className="max-w-xl text-base text-text-dim md:text-lg">
            {t('sections.ctaBand.sub')}
          </p>
          <Button
            asChild
            size="lg"
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            <Link to="/signup">{t('sections.ctaBand.cta')}</Link>
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
