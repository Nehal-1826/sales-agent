import { forwardRef, useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Manual scroll lock — belt-and-suspenders backup for Radix's built-in
 * `react-remove-scroll`. On some setups (Windows + certain trackpad
 * drivers + custom Tailwind classes), Radix's scroll-lock fails to
 * engage and wheel events bubble up to the page instead of being
 * captured by the dialog. This effect runs whenever an AppDialogContent
 * is mounted (which only happens while the dialog is open) and forces
 * `overflow: hidden` on <html> and <body>, restoring on unmount.
 *
 * Locks are reference-counted so nesting / stacking dialogs doesn't
 * unlock prematurely.
 */
let scrollLockCount = 0;
const scrollLockOriginals: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
} = { htmlOverflow: '', bodyOverflow: '', bodyPaddingRight: '' };

/**
 * Manual wheel + touch scroll for the dialog body — bulletproof version.
 *
 * Why the previous wrapper-bubble approach broke after one scroll:
 *   Radix's `react-remove-scroll` installs document-level listeners in
 *   the CAPTURE phase (fires before any bubble listener). It tracks an
 *   internal "scrolling in progress" shard. On the first wheel we called
 *   stopPropagation in the bubble phase, which prevented the library's
 *   bubble cleanup from running. The shard stayed stuck in "scrolling"
 *   state, and every subsequent wheel was short-circuited away from us.
 *
 * Fix: intercept at WINDOW level in the CAPTURE phase. Nothing can run
 * before a window capture listener — not document listeners, not
 * `react-remove-scroll`. We test `el.contains(target)` so we only
 * intercept events meant for the dialog body, and let everything else
 * flow normally.
 */
function useManualDialogScroll(elRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let touchStartY: number | null = null;

    const onWheel = (e: WheelEvent) => {
      const el = elRef.current;
      if (!el) return;
      // Only intercept events fired inside the dialog body.
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      // No overflow → no scroll to do. Let other handlers (scroll-lock,
      // etc.) handle the event so the page stays still.
      if (el.scrollHeight <= el.clientHeight) return;

      e.preventDefault();
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(maxScroll, el.scrollTop + e.deltaY));
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = elRef.current;
      if (!el) return;
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      touchStartY = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const el = elRef.current;
      if (!el) return;
      if (touchStartY === null) return;
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      if (el.scrollHeight <= el.clientHeight) return;

      const currentY = e.touches[0]?.clientY ?? touchStartY;
      const dy = touchStartY - currentY;
      e.preventDefault();
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(maxScroll, el.scrollTop + dy));
      touchStartY = currentY;
    };

    // CAPTURE phase on window — fires before document listeners and
    // before any element bubble listeners. react-remove-scroll cannot
    // get its hands on the event before we do.
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });

    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
    };
  }, [elRef]);
}

function useScrollLock() {
  useEffect(() => {
    if (scrollLockCount === 0) {
      const html = document.documentElement;
      const body = document.body;
      scrollLockOriginals.htmlOverflow = html.style.overflow;
      scrollLockOriginals.bodyOverflow = body.style.overflow;
      scrollLockOriginals.bodyPaddingRight = body.style.paddingRight;

      // Compensate for the scrollbar disappearing so layout doesn't shift.
      const scrollbarWidth = window.innerWidth - html.clientWidth;
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    scrollLockCount += 1;

    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        document.documentElement.style.overflow = scrollLockOriginals.htmlOverflow;
        document.body.style.overflow = scrollLockOriginals.bodyOverflow;
        document.body.style.paddingRight = scrollLockOriginals.bodyPaddingRight;
      }
    };
  }, []);
}

/**
 * Runs the page scroll-lock + the in-dialog wheel/touch handlers. Rendered as a
 * child of DialogPrimitive.Content, so it mounts ONLY while the dialog is open
 * and unmounts on close — releasing the lock and removing the window listeners.
 */
function DialogScrollManager({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  useScrollLock();
  useManualDialogScroll(scrollRef);
  return null;
}

/**
 * AppDialog — the shared popup primitive for every dialog in the app.
 *
 * Design system: **C — Stepper Sheet** (picked from
 * /admin-design-preview/popups). Sheet-style aesthetic — prominent top
 * handle, generous radius, slide-up entrance — with an optional stepper
 * row for multi-step flows.
 *
 *   ┌──────────────────────────────────────────┐
 *   │              ▬ pill handle               │  ← top sheet handle
 *   │                                          │
 *   │   ① ─ ② ─ ③   (optional stepper row)     │  ← AppDialogStepper
 *   │                                          │
 *   │   ◉  Title                            ×  │  ← accent-dot prefix
 *   │      Description copy.                   │
 *   │ ───────── soft hairline divider ──────── │
 *   │                                          │
 *   │   [body children]                        │
 *   │                                          │
 *   │ ───────── soft hairline divider ──────── │
 *   │             [cancel] [primary]           │  ← footer
 *   └──────────────────────────────────────────┘
 *
 * Visual moves:
 *   - Overlay: black radial vignette + faint accent wash + heavy backdrop blur.
 *   - Shell: rounded-[20px], surface gradient (top → bottom), brand-tinted
 *     drop shadow, 1px inset white highlight on the top edge.
 *   - Sheet handle: 44×3 pill at top center, accent-tinted gradient.
 *   - Animations: slide-up + zoom-in + fade — sheet rises from the bottom.
 *   - Title halo: soft radial accent glow behind the headline area.
 *   - Close: pill-shaped with accent ring on hover/focus.
 *
 * The legacy export surface (AppDialog, AppDialogContent, AppDialogHeader,
 * AppDialogTitle, AppDialogDescription, AppDialogBody, AppDialogFooter,
 * AppDialogTrigger, AppDialogClose) is preserved 1:1, so the 35 dialogs
 * that import it pick up the new look with zero edits. A new optional
 * `AppDialogStepper` is exported for multi-step popups (bulk-import,
 * onboarding, etc.).
 */

export const AppDialog = DialogPrimitive.Root;
export const AppDialogTrigger = DialogPrimitive.Trigger;
export const AppDialogPortal = DialogPrimitive.Portal;
export const AppDialogClose = DialogPrimitive.Close;

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

export const AppDialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function AppDialogOverlay({ className, style, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 backdrop-blur-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        className,
      )}
      style={{
        background:
          'radial-gradient(ellipse at center, hsl(0 0% 0% / 0.55) 0%, hsl(0 0% 0% / 0.78) 60%, hsl(0 0% 0% / 0.88) 100%), ' +
          'radial-gradient(ellipse at top, color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent) 0%, transparent 55%)',
        ...style,
      }}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Content shell
// ---------------------------------------------------------------------------

interface AppDialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showClose?: boolean;
  /**
   * Description text used by assistive tech and to register the
   * aria-describedby relation Radix expects. If you don't have a
   * meaningful description, leave this unset — we render a hidden default
   * so the runtime warning never fires.
   */
  description?: ReactNode;
}

export const AppDialogContent = forwardRef<HTMLDivElement, AppDialogContentProps>(
  function AppDialogContent(
    { className, children, showClose = true, description, style, ...props },
    ref,
  ) {
    // Scroll lock + the in-dialog wheel/touch handlers must engage ONLY while
    // the dialog is actually OPEN. They live in <DialogScrollManager>, which is
    // rendered inside DialogPrimitive.Content below — and Radix mounts Content
    // only when the dialog is open.
    //
    // Why this matters: this wrapper component is mounted even when the dialog
    // is CLOSED (e.g. <ConfirmDialogRoot> keeps one permanently mounted, and the
    // idiomatic `<AppDialog open={x}><AppDialogContent/>` keeps it mounted for as
    // long as the host renders it). When useScrollLock() ran here, at the top, a
    // closed dialog pinned <html>/<body> to overflow:hidden forever, so the whole
    // page could never scroll — invisible on mobile, which has no scrollbar.
    const scrollWrapperRef = useRef<HTMLDivElement>(null);

    return (
      <AppDialogPortal>
        <AppDialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // Position + sizing.
            //   Mobile (<sm): a bottom sheet flush to the bottom edge —
            //   thumb-reachable, matches the grab handle. Desktop (>=sm)
            //   restores the EXACT centered card, so >=640px is unchanged.
            'fixed bottom-0 inset-x-0 z-50 w-full',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2',
            // Shell — sheet-style with generous radius. Content itself
            // doesn't scroll; the inner wrapper does. overflow-hidden
            // clips the rounded corners cleanly over the scrolling inner.
            // Mobile: round only the top (flush bottom edge); desktop: all four.
            'overflow-hidden rounded-t-[20px] sm:rounded-[20px] border border-border-muted/80',
            'text-text',
            // Animations — slide-up + fade + zoom for a sheet-rising feel
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-3',
            'duration-200 ease-out',
            className,
          )}
          style={{
            // Layered surface:
            //   1) vertical gradient (surface → surface-2)
            //   2) inset white highlight on the very top edge
            //   3) accent-tinted drop shadow so dialog reads as lit
            background:
              'linear-gradient(180deg, var(--wp-surface, #16161d) 0%, var(--wp-surface-2, #1c1c25) 100%)',
            boxShadow:
              '0 1px 0 0 hsl(0 0% 100% / 0.07) inset, ' +
              '0 0 0 1px hsl(0 0% 100% / 0.02) inset, ' +
              '0 32px 80px -20px color-mix(in srgb, var(--wp-accent, #F26522) 38%, transparent), ' +
              '0 16px 40px -12px hsl(0 0% 0% / 0.6), ' +
              '0 2px 8px -2px hsl(0 0% 0% / 0.45)',
            ...style,
          }}
          {...props}
        >
          {/* Page scroll-lock + in-dialog wheel/touch handling. This subtree
              mounts only while the dialog is open, so the lock can never leak
              into the closed state and freeze page scrolling. */}
          <DialogScrollManager scrollRef={scrollWrapperRef} />
          {/* (1) Top sheet handle — the signature of Design C. Centered
              pill at the very top of the dialog. Accent-tinted gradient so
              the dialog reads as a "sheet you can grab". */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-3 h-[3px] w-11 -translate-x-1/2 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, var(--wp-accent, #F26522) 50%, transparent 100%)',
              boxShadow:
                '0 0 12px 0 color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)',
            }}
          />

          {/* (2) Soft radial halo behind the title region. Accent wash
              that bleeds out — sheet feels lit from the brand. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-36"
            style={{
              background:
                'radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 11%, transparent) 0%, transparent 70%)',
            }}
          />

          {/* Always-present screen-reader description. Radix wires the
              aria-describedby relation when it sees a Description child;
              without one it logs a warning in dev. */}
          <DialogPrimitive.Description className="sr-only">
            {description ?? 'Dialog'}
          </DialogPrimitive.Description>

          {/* Single scroll container. Header and Footer are now plain
              non-sticky blocks so they scroll with the content — this
              eliminates the sticky-stacking-context interactions that
              were preventing scroll engagement on some popups.
                - maxHeight bounds the dialog (caps at 85vh / 720px).
                - touch-action: pan-y allows vertical pan from trackpad.
                - overscroll-behavior: contain stops scroll bubble-out
                  to the page (which is locked anyway).
                - pt-7 leaves room below the sheet handle (top-3, 3px tall). */}
          <div
            ref={scrollWrapperRef}
            className="app-dialog-body relative px-6 pt-7 pb-6"
            style={{
              // dvh tracks the mobile browser's dynamic viewport (URL bar
              // showing/hidden); on desktop dvh == vh so this is unchanged.
              maxHeight: 'min(85dvh, 720px)',
              // Clear the iOS home indicator on the bottom sheet. env() is 0
              // on desktop, so the effective padding stays pb-6 there.
              paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
              overflowY: 'auto',
              overflowX: 'hidden',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {children}
          </div>

          {showClose ? (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center',
                'rounded-full border border-border-muted/60 bg-surface-2/70 text-text-dim',
                'transition-all duration-150',
                'hover:border-accent/60 hover:text-text hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--wp-accent,#F26522)_18%,transparent)]',
                'focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--wp-accent,#F26522)_30%,transparent)]',
              )}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.4} />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </AppDialogPortal>
    );
  },
);

// ---------------------------------------------------------------------------
// Header / Body / Footer
// ---------------------------------------------------------------------------

export function AppDialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Plain block at the top of the dialog body. No sticky positioning —
        // simple normal-flow header that scrolls with the content. This
        // eliminates the sticky-stacking-context interaction that was
        // breaking scroll engagement on some popups. pr-10 reserves room
        // for the close button. The after-divider is a soft gradient
        // hairline separating header from body.
        'mb-4 pb-3 pr-10 space-y-1.5',
        'after:mt-3 after:block after:h-px after:w-full',
        'after:bg-gradient-to-r after:from-transparent after:via-border-muted after:to-transparent',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AppDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  // Plain content container. The scrollable region is the outer wrapper
  // inside <AppDialogContent>; this just stacks the form rows.
  return <div className={cn('space-y-3', className)}>{children}</div>;
}

export function AppDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Plain block at the bottom of the dialog body. No sticky —
        // scrolls with content. Hairline divider above gives visual
        // separation from the body without needing a positioned bg.
        'mt-4 pt-3 flex items-center justify-end gap-2',
        'border-t border-border-muted/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title / Description
// ---------------------------------------------------------------------------

export const AppDialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function AppDialogTitle({ className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        'flex items-center gap-2.5 text-xl font-semibold tracking-tight text-text',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 flex-none rounded-full"
        style={{
          background: 'var(--wp-accent, #F26522)',
          boxShadow:
            '0 0 0 3px color-mix(in srgb, var(--wp-accent, #F26522) 22%, transparent), ' +
            '0 0 8px 0 color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)',
        }}
      />
      <span>{children}</span>
    </DialogPrimitive.Title>
  );
});

export const AppDialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function AppDialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('pl-4 text-sm leading-relaxed text-text-dim', className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Stepper — opt-in component for multi-step popups (Bulk import, future
// wizards). Single-step popups don't need to render this; Design C still
// reads correctly without it (sheet handle, surface gradient, slide-up).
// ---------------------------------------------------------------------------

export interface AppDialogStepperProps {
  /** Ordered list of step labels. The dot index matches the array index. */
  steps: string[];
  /** Zero-based index of the currently active step. */
  current: number;
  className?: string;
}

/**
 * Top-of-dialog stepper for multi-step flows. Render directly above the
 * <AppDialogHeader> inside <AppDialogContent>:
 *
 *   <AppDialogContent>
 *     <AppDialogStepper steps={['Upload', 'Preview', 'Commit']} current={1} />
 *     <AppDialogHeader>...</AppDialogHeader>
 *     <AppDialogBody>...</AppDialogBody>
 *     <AppDialogFooter>...</AppDialogFooter>
 *   </AppDialogContent>
 */
export function AppDialogStepper({ steps, current, className }: AppDialogStepperProps) {
  // Flatten into one flex row so every dot, label, and connector is a
  // direct child of the same flex container. `items-center` then aligns
  // all of them on the same Y baseline with no nested-wrapper drift.
  const nodes: ReactNode[] = [];
  steps.forEach((label, i) => {
    const isDone = i < current;
    const isActive = i === current;

    // Dot circle (numbered for active/future, ✓ for done)
    nodes.push(
      <span
        key={`d-${i}`}
        aria-hidden
        className={cn(
          'inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-semibold leading-none',
          !isDone && !isActive && 'border-border-muted text-text-dim',
          isActive && 'border-accent text-white',
          isDone && 'border-accent text-accent',
        )}
        style={
          isActive
            ? {
                background: 'var(--wp-accent, #F26522)',
                boxShadow:
                  '0 0 0 3px color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
              }
            : undefined
        }
      >
        {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
      </span>,
    );

    // Label
    nodes.push(
      <span
        key={`l-${i}`}
        className={cn(
          'text-sm font-semibold tracking-tight leading-none',
          !isDone && !isActive && 'text-text-dim',
          isActive && 'text-text',
          isDone && 'text-accent',
        )}
      >
        {label}
      </span>,
    );

    // Connector tail (skip after the last step). Solid 2px so it's
    // visually clear at a glance.
    if (i < steps.length - 1) {
      nodes.push(
        <span
          key={`t-${i}`}
          aria-hidden
          className="inline-block h-[2px] w-8 flex-none rounded-full"
          style={{
            background:
              isDone || isActive
                ? 'color-mix(in srgb, var(--wp-accent, #F26522) 65%, var(--wp-border, #2a2a2a))'
                : 'var(--wp-border, #2a2a2a)',
          }}
        />,
      );
    }
  });

  return (
    // Outer container: centers the stepper horizontally so it sits under
    // the sheet handle rather than left-aligned (which was clashing with
    // the title's left-aligned accent dot below).
    <div
      className={cn('shrink-0 mb-3 flex justify-center', className)}
      aria-label={`Step ${current + 1} of ${steps.length}`}
    >
      {/* Pill container groups the stepper as one cohesive element with
          its own background + border so it reads cleanly against the
          surface gradient and accent halo above. */}
      <div
        className={cn(
          'inline-flex items-center gap-3 rounded-full px-4 py-2',
          'border border-border-muted/60',
          'bg-[var(--wp-surface-2,#1a1a26)]/60 backdrop-blur-sm',
        )}
      >
        {nodes}
      </div>
    </div>
  );
}
