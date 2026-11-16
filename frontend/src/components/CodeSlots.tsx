import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { animate, motion, motionValue, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import './CodeSlots.css';

export type CodeSlotsStatus = 'idle' | 'error' | 'success';

export interface CodeSlotsProps {
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  status?: CodeSlotsStatus;
  mask?: boolean;
  caret?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  accentColor?: string;
  inkColor?: string;
  slotColor?: string;
  digitColor?: string;
  dangerColor?: string;
  slotSize?: number;
  gap?: number;
  radius?: number;
  bounce?: number;
  settle?: number;
  rise?: number;
  cascade?: number;
  ariaLabel?: string;
  className?: string;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const WASH_IN = 0.3;
const WASH_OUT = 0.2;
const SINK_DELAY = 0.06;
const SINK_STEP = 0.03;
const CHECK_DELAY = 0.28;
const CHECK_RISE = 8;
const SINK_FADE = 0.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const digitsOf = (raw: unknown) => String(raw ?? '').replace(/\D/g, '');
const toSlots = (raw: unknown, n: number): string[] => {
  const d = digitsOf(raw).slice(0, n);
  return Array.from({ length: n }, (_, i) => d[i] ?? '');
};
const firstEmptyOf = (slots: string[]) => {
  const i = slots.indexOf('');
  return i === -1 ? Math.max(0, slots.length - 1) : i;
};
const isFull = (slots: string[]) => slots.length > 0 && slots.every(Boolean);

const TickSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** Spring-animated OTP / verification slot input from React Bits. */
export function CodeSlots({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  mask = false,
  caret = true,
  disabled = false,
  autoFocus = false,
  accentColor = 'var(--accent, #f97316)',
  inkColor = 'var(--accent-strong, #c2410c)',
  slotColor = 'var(--panel-2, #f8f7f4)',
  digitColor = '#ffffff',
  dangerColor = 'var(--danger, #b91c1c)',
  slotSize = 44,
  gap = 8,
  radius = 12,
  bounce = 0.2,
  settle = 0.3,
  rise = 8,
  cascade = 20,
  ariaLabel = 'One-time code',
  className = '',
}: CodeSlotsProps) {
  const uid = useId();
  const reduce = !!useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<string[]>(() => toSlots(value ?? defaultValue, length));
  const [active, setActive] = useState<number>(() => firstEmptyOf(slots));
  const [focused, setFocused] = useState(false);
  const [veiled, setVeiled] = useState(status === 'success');
  const activeMv = useMotionValue(active);
  const openMv = useMotionValue(status === 'success' ? 1 : 0);
  const checkMv = useMotionValue(status === 'success' ? 1 : 0);
  const glide = useRef(new Set<number>());
  const target = useRef<number[]>([]);
  const draining = useRef(false);
  const drainTimer = useRef<number | undefined>(undefined);
  const statusRef = useRef<CodeSlotsStatus>(status);
  const emitted = useRef(digitsOf(value ?? defaultValue).slice(0, length));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const live = useRef({ settle, bounce, cascade, reduce });
  live.current = { settle, bounce, cascade, reduce };

  const springs = useMemo(
    () => ({
      mvs: Array.from({ length }, (_, i) => motionValue(slotsRef.current[i] ? 1 : 0)),
      drops: Array.from({ length }, () => motionValue(statusRef.current === 'success' ? 1 : 0)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length],
  );
  const { mvs, drops } = springs;
  const pitch = slotSize + gap;
  const height = Math.round(slotSize * 1.18);
  const washRadius = Math.min(radius, slotSize / 2);
  const sink = Math.round(height * 0.22);

  const drive = useCallback(
    (i: number, to: number, delayMs = 0) => {
      const mv = mvs[i];
      if (!mv) return;
      target.current[i] = to;
      const L = live.current;
      if (L.reduce) {
        mv.jump(to);
        return;
      }
      animate(mv, to, { type: 'spring', duration: L.settle, bounce: L.bounce, delay: delayMs / 1000 });
    },
    [mvs],
  );

  const land = useCallback(
    (i: number, delayMs = 0) => {
      if (mvs[i].get() > 0) mvs[i].jump(0);
      drive(i, 1, delayMs);
    },
    [mvs, drive],
  );

  const moveActive = useCallback(
    (next: number, crossed: number[]) => {
      crossed.forEach((j) => glide.current.add(j));
      activeMv.jump(next);
      setActive(next);
    },
    [activeMv],
  );

  const jumpActive = useCallback(
    (next: number) => {
      glide.current.clear();
      activeMv.jump(next);
      setActive(next);
    },
    [activeMv],
  );

  const caretX = useTransform(() => {
    const a = activeMv.get();
    let x = a * pitch;
    for (let j = 0; j < mvs.length; j++) {
      const h = clamp01(mvs[j].get());
      if (!glide.current.has(j)) continue;
      const to = target.current[j];
      if (to === undefined || h === clamp01(to)) {
        glide.current.delete(j);
        continue;
      }
      x += j < a ? -(1 - h) * pitch : h * pitch;
    }
    return Math.min(Math.max(x, 0), Math.max(0, mvs.length - 1) * pitch);
  });

  const caretTransform = useTransform(caretX, (x) => `translateX(${x}px)`);
  const washClip = useTransform(openMv, (o) => `inset(0 ${(1 - clamp01(o)) * 50}% round ${washRadius}px)`);
  const checkTransform = useTransform(
    checkMv,
    (c) => `translateY(${(1 - c) * CHECK_RISE}px) scale(${0.85 + 0.15 * Math.max(c, 0)})`,
  );
  const checkOpacity = useTransform(checkMv, clamp01);

  const commit = useCallback(
    (next: string[]) => {
      const prev = slotsRef.current;
      slotsRef.current = next;
      setSlots(next);
      const code = next.join('');
      emitted.current = code;
      onChange?.(code);
      if (!isFull(prev) && isFull(next)) onComplete?.(code);
    },
    [onChange, onComplete],
  );

  const insert = (raw: string, from = active) => {
    const digits = digitsOf(raw);
    if (!digits) return;
    const next = [...slotsRef.current];
    const crossed: number[] = [];
    const step = reduce ? 0 : cascade;
    let i = from;
    for (const ch of digits) {
      if (i >= length) break;
      next[i] = ch;
      land(i, (i - from) * step);
      crossed.push(i);
      i += 1;
    }
    if (!crossed.length) return;
    commit(next);
    moveActive(Math.min(i, length - 1), crossed);
  };

  const clearSlot = (i: number, stepBack = false) => {
    if (!slotsRef.current[i]) {
      if (stepBack) jumpActive(i);
      return;
    }
    const next = [...slotsRef.current];
    next[i] = '';
    drive(i, 0);
    commit(next);
    if (stepBack) moveActive(i, [i]);
  };

  const busy = disabled || draining.current || status === 'success';

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      insert(k);
    } else if (k === 'Backspace') {
      e.preventDefault();
      if (slots[active]) clearSlot(active);
      else if (active > 0) clearSlot(active - 1, true);
    } else if (k === 'Delete') {
      e.preventDefault();
      clearSlot(active);
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      jumpActive(Math.max(active - 1, 0));
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      jumpActive(Math.min(active + 1, length - 1));
    } else if (k === 'Home') {
      e.preventDefault();
      jumpActive(0);
    } else if (k === 'End') {
      e.preventDefault();
      jumpActive(length - 1);
    }
  };

  const onPaste = (e: ReactClipboardEvent<HTMLInputElement>) => {
    if (busy) return;
    e.preventDefault();
    insert(e.clipboardData.getData('text'));
  };

  const onInput = (e: FormEvent<HTMLInputElement>) => {
    if (busy) return;
    const d = digitsOf(e.currentTarget.value);
    e.currentTarget.value = '';
    if (!d) return;
    insert(d, d.length === 1 ? active : 0);
  };

  const onRowMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const row = rowRef.current;
    if (row && !draining.current && status !== 'success') {
      const rect = row.getBoundingClientRect();
      const zoom = rect.width / (row.offsetWidth || rect.width) || 1;
      const i = Math.floor((e.clientX - rect.left) / zoom / pitch);
      jumpActive(Math.max(0, Math.min(i, firstEmptyOf(slotsRef.current))));
    }
    inputRef.current?.focus();
  };

  useEffect(() => {
    glide.current.clear();
    target.current = [];
    const next = Array.from({ length }, (_, i) => slotsRef.current[i] ?? '');
    slotsRef.current = next;
    setSlots(next);
    jumpActive(firstEmptyOf(next));
    const code = next.join('');
    if (code !== emitted.current) {
      emitted.current = code;
      onChange?.(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  useEffect(() => {
    if (value === undefined) return;
    const clean = digitsOf(value).slice(0, length);
    if (clean === emitted.current) return;
    emitted.current = clean;
    const prev = slotsRef.current;
    const next = toSlots(clean, length);
    const hidden = statusRef.current === 'success';
    const landing: number[] = [];
    const leaving: number[] = [];
    next.forEach((ch, i) => {
      if (ch === prev[i]) return;
      (ch ? landing : leaving).push(i);
    });
    const step = live.current.reduce || hidden ? 0 : live.current.cascade;
    landing.forEach((i, k) => land(i, k * step));
    leaving.reverse().forEach((i, k) => {
      if (hidden) {
        target.current[i] = 0;
        mvs[i].jump(0);
        drops[i].jump(0);
      } else drive(i, 0, k * step);
    });
    slotsRef.current = next;
    setSlots(next);
    moveActive(firstEmptyOf(next), [...landing, ...leaving]);
    if (!isFull(prev) && isFull(next)) onComplete?.(clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  useEffect(() => {
    const was = statusRef.current;
    statusRef.current = status;
    const L = live.current;
    window.clearTimeout(drainTimer.current);

    if (status === 'success') {
      setVeiled(true);
      if (L.reduce) {
        openMv.jump(1);
        drops.forEach((d) => d.jump(1));
        checkMv.jump(1);
        return;
      }
      animate(openMv, 1, { duration: WASH_IN, ease: EASE_OUT });
      drops.forEach((d, k) =>
        animate(d, 1, { type: 'spring', duration: 0.3, bounce: 0, delay: SINK_DELAY + k * SINK_STEP }),
      );
      animate(checkMv, 1, { type: 'spring', duration: 0.35, bounce: L.bounce, delay: CHECK_DELAY });
      return;
    }

    if (was === 'success') {
      if (L.reduce) {
        openMv.jump(0);
        checkMv.jump(0);
        drops.forEach((d) => d.jump(0));
        setVeiled(false);
      } else {
        animate(checkMv, 0, { duration: 0.12 });
        animate(openMv, 0, { duration: WASH_OUT, ease: EASE_OUT }).then(() => setVeiled(false));
        drops.forEach((d) => animate(d, 0, { duration: 0.2 }));
      }
    }

    if (status === 'error') {
      const filled: number[] = [];
      for (let i = length - 1; i >= 0; i -= 1) {
        if (slotsRef.current[i]) filled.push(i);
      }
      if (!filled.length) return;
      draining.current = true;
      const step = L.reduce ? 0 : L.cascade;
      filled.forEach((i, k) => drive(i, 0, k * step));
      const totalMs = L.reduce ? 0 : (filled.length - 1) * step + Math.round(L.settle * 900);
      drainTimer.current = window.setTimeout(() => {
        draining.current = false;
        const cleared = Array.from({ length }, () => '');
        slotsRef.current = cleared;
        setSlots(cleared);
        emitted.current = '';
        jumpActive(0);
        onChange?.('');
        inputRef.current?.focus();
      }, totalMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, length]);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  useEffect(() => () => window.clearTimeout(drainTimer.current), []);

  const view = mask ? slots.map((c) => (c ? '•' : '')) : slots;

  return (
    <div
      className={`code-slots${className ? ` ${className}` : ''}`}
      style={
        {
          '--cs-accent': accentColor,
          '--cs-ink': inkColor,
          '--cs-slot': slotColor,
          '--cs-digit': digitColor,
          '--cs-danger': dangerColor,
          '--cs-size': `${slotSize}px`,
          '--cs-height': `${height}px`,
          '--cs-gap': `${gap}px`,
          '--cs-radius': `${Math.min(radius, slotSize / 2)}px`,
          '--cs-font': `${Math.round(slotSize * 0.5)}px`,
        } as CSSProperties
      }
    >
      <div
        ref={rowRef}
        className="code-slots__row"
        data-status={status}
        data-disabled={disabled ? '' : undefined}
        onMouseDown={onRowMouseDown}
      >
        <input
          ref={inputRef}
          className="code-slots__input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={ariaLabel}
          aria-describedby={`${uid}-count`}
          disabled={disabled}
          value=""
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {view.map((char, i) => (
          <Slot
            key={i}
            mv={mvs[i]}
            drop={drops[i]}
            char={char}
            active={focused && active === i && status === 'idle' && !disabled}
            rise={rise}
            sink={sink}
          />
        ))}
        {caret ? (
          <motion.span
            className="code-slots__caret"
            data-show={focused && !busy ? '' : undefined}
            style={{ transform: caretTransform }}
            aria-hidden="true"
          >
            <span className="code-slots__caret-line" />
          </motion.span>
        ) : null}
        {veiled ? (
          <motion.span className="code-slots__wash" style={{ clipPath: washClip }} aria-hidden="true">
            <motion.span className="code-slots__check" style={{ transform: checkTransform, opacity: checkOpacity }}>
              <TickSvg />
            </motion.span>
          </motion.span>
        ) : null}
      </div>
      <span id={`${uid}-count`} className="code-slots__sr" aria-live="polite">
        {status === 'success' ? 'Code accepted' : `${view.filter(Boolean).length} of ${length} digits entered`}
      </span>
    </div>
  );
}

function Slot({
  mv,
  drop,
  char,
  active,
  rise,
  sink,
}: {
  mv: MotionValue<number>;
  drop: MotionValue<number>;
  char: string;
  active: boolean;
  rise: number;
  sink: number;
}) {
  const [shown, setShown] = useState(char);
  if (char && char !== shown) setShown(char);
  const fill = useTransform(mv, (t) => `scale(${Math.max(t, 0)})`);
  const lift = useTransform([mv, drop], ([t, d]: number[]) => `translateY(${(1 - t) * rise + Math.max(d, 0) * sink}px)`);
  const ink = useTransform([mv, drop], ([t, d]: number[]) => clamp01(t) * (1 - clamp01(d / SINK_FADE)));
  return (
    <span
      className="code-slots__slot"
      data-active={active ? '' : undefined}
      data-filled={char ? '' : undefined}
      aria-hidden="true"
    >
      <motion.span className="code-slots__fill" style={{ transform: fill }} />
      {shown ? (
        <motion.span className="code-slots__digit" style={{ transform: lift, opacity: ink }}>
          {shown}
        </motion.span>
      ) : null}
    </span>
  );
}

export default CodeSlots;
