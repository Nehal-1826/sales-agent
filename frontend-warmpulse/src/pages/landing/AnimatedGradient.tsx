import { motion } from 'framer-motion';

/**
 * Slow-rotating, slow-breathing gradient blob used behind the hero.
 * Rendered as two overlapping radial blobs for a richer edge blend.
 * pointer-events-none so it never blocks interaction.
 *
 * A parent that wants parallax can wrap this in a GSAP-driven
 * translate (see Hero.tsx).
 */
export function AnimatedGradient() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* primary accent blob */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(242, 101, 34,0.35), rgba(242, 101, 34,0) 60%)',
        }}
        animate={{ rotate: [0, 360], scale: [1, 1.08, 1] }}
        transition={{
          rotate: { duration: 60, ease: 'linear', repeat: Infinity },
          scale: { duration: 12, ease: 'easeInOut', repeat: Infinity },
        }}
      />
      {/* secondary cyan blob */}
      <motion.div
        className="absolute left-[60%] top-[40%] h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 70% 70%, rgba(255, 138, 75,0.25), rgba(255, 138, 75,0) 60%)',
        }}
        animate={{ rotate: [360, 0], scale: [1.05, 0.95, 1.05] }}
        transition={{
          rotate: { duration: 80, ease: 'linear', repeat: Infinity },
          scale: { duration: 14, ease: 'easeInOut', repeat: Infinity },
        }}
      />
      {/* warm highlight */}
      <motion.div
        className="absolute left-[25%] top-[75%] h-[450px] w-[450px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,107,74,0.18), rgba(255,107,74,0) 60%)',
        }}
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, ease: 'easeInOut', repeat: Infinity }}
      />
    </div>
  );
}
