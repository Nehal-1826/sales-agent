import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import './AnimatedList.css';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type AnimatedListAnimation = 'pop' | 'slide' | 'fade' | 'none';
export type AnimatedListTheme = 'dark' | 'light';

export interface AnimatedListObjectItem {
  id?: Key;
  icon?: ReactNode;
  image?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}

export type AnimatedListItem = string | AnimatedListObjectItem;

export interface AnimatedListProps<T = AnimatedListItem> {
  items?: T[];
  onItemSelect?: (item: T, index: number) => void;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  initialSelectedIndex?: number;
  selectOnHover?: boolean;
  enableArrowNavigation?: boolean;
  loop?: boolean;
  animation?: AnimatedListAnimation;
  animateOnce?: boolean;
  stagger?: number;
  showGradients?: boolean;
  fadeSize?: number;
  displayScrollbar?: boolean;
  frame?: boolean;
  theme?: AnimatedListTheme;
  accentColor?: string;
  radius?: number;
  gap?: number;
  width?: number | string;
  maxHeight?: number | string;
  className?: string;
  listClassName?: string;
  itemClassName?: string | ((item: T, index: number, selected: boolean) => string);
  asList?: boolean;
  interactiveRows?: boolean;
  getItemKey?: (item: T, index: number) => Key;
  style?: CSSProperties;
}

const THEMES: Record<AnimatedListTheme, Record<string, string>> = {
  dark: {
    '--al-frame': 'rgba(20, 18, 26, 0.56)',
    '--al-frame-edge': 'rgba(255, 255, 255, 0.12)',
    '--al-frame-highlight': 'rgba(255, 255, 255, 0.18)',
    '--al-frame-shadow': 'var(--shadow-lg)',
    '--al-tile': 'linear-gradient(155deg, rgba(255, 255, 255, 0.085) 0%, rgba(255, 255, 255, 0.03) 100%)',
    '--al-tile-edge': 'rgba(255, 255, 255, 0.12)',
    '--al-tile-highlight': 'rgba(255, 255, 255, 0.18)',
    '--al-tile-shadow': '0 4px 12px -4px rgba(0, 0, 0, 0.45)',
    '--al-well': 'rgba(249, 115, 22, 0.18)',
    '--al-well-ink': '#fdba74',
    '--al-ink': '#f5f2ed',
    '--al-muted': '#c6bfb4',
    '--al-thumb': 'rgba(245, 242, 237, 0.22)',
    '--al-ring': 'rgba(251, 146, 60, 0.52)',
    '--al-ring-fill': 'rgba(249, 115, 22, 0.12)',
    '--al-hover': 'brightness(1.12)',
    '--al-press': 'brightness(0.92)',
    '--al-active': 'brightness(1.15)',
  },
  light: {
    '--al-frame': 'rgba(248, 247, 244, 0.88)',
    '--al-frame-edge': 'var(--border, #e3dfd7)',
    '--al-frame-highlight': 'rgba(255, 255, 255, 0.95)',
    '--al-frame-shadow': 'var(--shadow)',
    '--al-tile': 'linear-gradient(180deg, #ffffff 0%, #faf9f6 100%)',
    '--al-tile-edge': 'var(--border, #e3dfd7)',
    '--al-tile-highlight': '#ffffff',
    '--al-tile-shadow': '0 2px 8px -4px rgba(31, 27, 22, 0.12)',
    '--al-well': 'var(--accent-soft, #ffe8d6)',
    '--al-well-ink': 'var(--accent-strong, #c2410c)',
    '--al-ink': 'var(--text, #1f1b16)',
    '--al-muted': 'var(--text-2, #5c564d)',
    '--al-thumb': 'rgba(31, 27, 22, 0.16)',
    '--al-ring': 'rgba(249, 115, 22, 0.42)',
    '--al-ring-fill': 'rgba(249, 115, 22, 0.04)',
    '--al-hover': 'brightness(0.985)',
    '--al-press': 'brightness(0.95)',
    '--al-active': 'none',
  },
};

const iconBase = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

const SampleFolder = () => (
  <svg {...iconBase}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6.5Z" />
  </svg>
);

const SampleFile = () => (
  <svg {...iconBase}>
    <path d="M6 3.5h8.5L19 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
    <path d="M14.5 3.5V8H19" />
  </svg>
);

const DEFAULT_ITEMS: AnimatedListObjectItem[] = [
  { icon: <SampleFolder />, title: 'Brand assets', description: '24 files', meta: '2m' },
  { icon: <SampleFile />, title: 'Launch hero.png', description: '2.4 MB', meta: '18m' },
  { icon: <SampleFile />, title: 'Product tour.mp4', description: '148 MB', meta: '1h' },
  { icon: <SampleFile />, title: 'Pricing notes', description: '1,240 words', meta: '3h' },
];

const HIDDEN: Record<Exclude<AnimatedListAnimation, 'none'>, { above: string; below: string }> = {
  pop: { above: 'translate3d(0, -12px, 0) scale(0.92)', below: 'translate3d(0, 12px, 0) scale(0.92)' },
  slide: { above: 'translate3d(0, -24px, 0) scale(0.98)', below: 'translate3d(0, 24px, 0) scale(0.98)' },
  fade: { above: 'translate3d(0, -4px, 0)', below: 'translate3d(0, 4px, 0)' },
};

const SPRING =
  'linear(0, 0.0603, 0.2033, 0.3821, 0.5633, 0.7258, 0.8584, 0.9574, 1.0242, 1.0634, 1.0809, 1.0828, 1.0747, 1.0613, 1.046, 1.0313, 1.0186, 1.0085, 1.0012, 0.9965, 0.994, 0.9931, 0.9933, 0.9941, 0.9953, 0.9966, 0.9978, 0.9988, 1)';

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const FADE_MASK = (() => {
  const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  const top = steps.map((t) => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(var(--al-fade-top) * ${t})`);
  const bottom = [...steps]
    .reverse()
    .map((t) => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) calc(100% - var(--al-fade-bottom) * ${t})`);
  return `linear-gradient(to bottom, ${[...top, ...bottom].join(', ')})`;
})();

const size = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

interface EngineHandle {
  place: (snap: boolean) => void;
  syncRing: () => void;
  updateFades: () => void;
  sync: () => void;
}

/** Spring-animated list with scroll reveal, edge fades, and sliding highlight ring (React Bits). */
export function AnimatedList<T = AnimatedListItem>({
  items = DEFAULT_ITEMS as unknown as T[],
  onItemSelect,
  renderItem,
  initialSelectedIndex = -1,
  selectOnHover = true,
  enableArrowNavigation = true,
  loop = false,
  animation = 'pop',
  animateOnce = false,
  stagger = 0.05,
  showGradients = true,
  fadeSize = 56,
  displayScrollbar = true,
  frame = true,
  theme = 'dark',
  accentColor,
  radius = 12,
  gap = 8,
  width = 420,
  maxHeight = 440,
  className = '',
  listClassName = '',
  itemClassName = '',
  asList = false,
  interactiveRows = false,
  getItemKey,
  style,
}: AnimatedListProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const engineRef = useRef<EngineHandle | null>(null);
  const keyboardRef = useRef(false);
  const navigatingRef = useRef(false);
  const [selected, setSelected] = useState(initialSelectedIndex);
  const baseId = useId();

  const settings = {
    items,
    onItemSelect,
    selected,
    selectOnHover,
    enableArrowNavigation,
    loop,
    animation,
    animateOnce,
    stagger,
    showGradients,
    fadeSize,
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    const ring = ringRef.current;
    if (!root || !viewport || !track || !indicator || !ring) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const springEase =
      typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)')
        ? SPRING
        : 'cubic-bezier(0.34, 1.4, 0.64, 1)';
    const transition = reduced
      ? 'none'
      : `transform 520ms ${springEase}, opacity 260ms cubic-bezier(0.22, 1, 0.36, 1), filter 160ms ease`;
    const motion = { y: 0, h: 0, vy: 0, vh: 0, ty: 0, th: 0, ready: false };
    const fades = { top: '', bottom: '' };
    let boxes: ([number, number] | null)[] = [];
    let current: AnimatedListAnimation | null = null;
    let entered = false;
    let engaged = false;
    let pointer = [0, 0];
    let raf = 0;
    let last = 0;

    const mode = (): AnimatedListAnimation => {
      const chosen = settingsRef.current.animation;
      if (chosen === 'none' || !HIDDEN[chosen]) return 'none';
      return reduced ? 'none' : chosen;
    };

    const apply = (element: HTMLElement, state: 'in' | 'above' | 'below') => {
      element.dataset.state = state;
      const pose = current && current !== 'none' && state !== 'in' ? HIDDEN[current][state] : '';
      element.style.transform = pose;
      element.style.opacity = pose ? '0' : '';
    };

    const syncRing = () => {
      const item = itemRefs.current[settingsRef.current.selected];
      if (!item) return;
      const state = (item.dataset.state as 'in' | 'above' | 'below' | undefined) || 'in';
      if (state === ring.dataset.state) return;
      ring.style.transitionDelay = item.style.transitionDelay;
      apply(ring, state);
    };

    const write = () => {
      indicator.style.transform = `translate3d(0, ${motion.y.toFixed(2)}px, 0)`;
      indicator.style.height = `${motion.h.toFixed(2)}px`;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const omega = 30;
      const zeta = 0.78;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        motion.vy += (omega * omega * (motion.ty - motion.y) - 2 * zeta * omega * motion.vy) * h;
        motion.vh += (omega * omega * (motion.th - motion.h) - 2 * zeta * omega * motion.vh) * h;
        motion.y += motion.vy * h;
        motion.h += motion.vh * h;
      }
      const moving =
        Math.abs(motion.ty - motion.y) > 0.05 ||
        Math.abs(motion.th - motion.h) > 0.05 ||
        Math.abs(motion.vy) + Math.abs(motion.vh) > 0.5;
      if (!moving) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
      }
      write();
      if (moving) raf = requestAnimationFrame(frame);
    };

    const place = (snap: boolean) => {
      const item = itemRefs.current[settingsRef.current.selected];
      if (!item) {
        indicator.style.opacity = '0';
        motion.ready = false;
        return;
      }
      indicator.style.opacity = '1';
      motion.ty = item.offsetTop;
      motion.th = item.offsetHeight;
      if (snap || reduced || !motion.ready) {
        motion.y = motion.ty;
        motion.h = motion.th;
        motion.vy = motion.vh = 0;
        motion.ready = true;
        write();
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const updateFades = () => {
      const s = settingsRef.current;
      const span = Math.max(1, s.fadeSize);
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const top = s.showGradients ? Math.min(span, Math.max(0, scrollTop)) : 0;
      const bottom = s.showGradients ? Math.min(span, Math.max(0, scrollHeight - clientHeight - scrollTop)) : 0;
      const nextTop = `${top.toFixed(1)}px`;
      const nextBottom = `${bottom.toFixed(1)}px`;
      if (nextTop !== fades.top) {
        fades.top = nextTop;
        viewport.style.setProperty('--al-fade-top', nextTop);
      }
      if (nextBottom !== fades.bottom) {
        fades.bottom = nextBottom;
        viewport.style.setProperty('--al-fade-bottom', nextBottom);
      }
    };

    const measure = () => {
      const offset = track.offsetTop;
      boxes = itemRefs.current.map((item) => (item ? [offset + item.offsetTop, item.offsetHeight] : null));
    };

    const reveal = (entrance: boolean) => {
      if (!entered) return;
      const s = settingsRef.current;
      const top = viewport.scrollTop;
      const view = viewport.clientHeight;
      let order = 0;
      itemRefs.current.forEach((item, index) => {
        const box = boxes[index];
        if (!item || !box) return;
        const start = box[0] - top;
        const overlap = Math.min(view, start + box[1]) - Math.max(0, start);
        const hidden =
          current !== 'none' &&
          overlap < Math.min(box[1], view) * 0.5 &&
          !(s.animateOnce && item.dataset.seen);
        const state: 'in' | 'above' | 'below' = hidden
          ? start + box[1] / 2 < view / 2
            ? 'above'
            : 'below'
          : 'in';
        if (state === item.dataset.state) return;
        const delay = entrance && !hidden ? (order++ * Math.max(0, s.stagger)).toFixed(3) : 0;
        item.style.transitionDelay = delay ? `${delay}s, ${delay}s, 0s` : '';
        if (!hidden) item.dataset.seen = 'true';
        apply(item, state);
      });
      syncRing();
    };

    const sync = () => {
      const s = settingsRef.current;
      itemRefs.current.length = s.items.length;
      const activeItems = itemRefs.current.filter((el): el is HTMLElement => Boolean(el));
      const next = mode();
      const changed = next !== current;
      const restyle = changed ? activeItems : activeItems.filter((item) => !item.dataset.state);
      current = next;
      if (current === 'none') entered = true;
      if (restyle.length) {
        const elements = changed ? [...restyle, ring] : restyle;
        for (const element of elements) element.style.transition = 'none';
        for (const item of restyle) {
          const prevState = (item.dataset.state as 'in' | 'above' | 'below' | undefined) || 'below';
          apply(item, current === 'none' ? 'in' : prevState);
        }
        if (changed) {
          const selState =
            (itemRefs.current[s.selected]?.dataset.state as 'in' | 'above' | 'below' | undefined) || 'in';
          apply(ring, selState);
        }
        void root.offsetHeight;
        for (const element of elements) element.style.transition = transition;
      }
      measure();
      reveal(restyle.length > 0);
    };

    sync();

    const gate =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries, observer) => {
              if (!entries.some((entry) => entry.isIntersecting)) return;
              observer.disconnect();
              if (entered) return;
              entered = true;
              measure();
              reveal(true);
            },
            { rootMargin: '0px 0px -6% 0px' },
          );
    if (!entered) {
      if (gate) gate.observe(root);
      else {
        entered = true;
        reveal(true);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      place(true);
      updateFades();
      measure();
      reveal(false);
    });
    resizeObserver.observe(viewport);
    resizeObserver.observe(track);

    const onScroll = () => {
      updateFades();
      reveal(false);
    };

    const onKey = (event: KeyboardEvent) => {
      const s = settingsRef.current;
      if (!s.enableArrowNavigation || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      const focused = active === viewport;
      const idle = !active || active === document.body || active === document.documentElement;
      if (!focused && !(engaged && idle)) return;
      const count = s.items.length;
      if (!count) return;
      const index = s.selected;
      let next: number | null = null;
      if (event.key === 'ArrowDown') next = index < 0 ? 0 : index + 1;
      else if (event.key === 'ArrowUp') next = index < 0 ? count - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else if ((event.key === 'Enter' || (focused && event.key === ' ')) && index >= 0 && index < count) {
        event.preventDefault();
        s.onItemSelect?.(s.items[index], index);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      next = s.loop ? (next + count) % count : Math.min(count - 1, Math.max(0, next));
      keyboardRef.current = true;
      navigatingRef.current = true;
      setSelected(next);
    };

    const onPointerMove = (event: PointerEvent) => {
      const moved = event.clientX !== pointer[0] || event.clientY !== pointer[1];
      pointer = [event.clientX, event.clientY];
      if (!navigatingRef.current || !moved) return;
      navigatingRef.current = false;
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null;
      if (item && root.contains(item) && settingsRef.current.selectOnHover) setSelected(Number(item.dataset.index));
    };

    const onEnter = () => {
      engaged = true;
    };
    const onLeave = () => {
      engaged = false;
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointermove', onPointerMove);

    updateFades();
    place(true);
    syncRing();

    engineRef.current = { place, syncRing, updateFades, sync };

    return () => {
      cancelAnimationFrame(raf);
      gate?.disconnect();
      resizeObserver.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointermove', onPointerMove);
      engineRef.current = null;
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    engineRef.current?.sync();
  }, [items, animation]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.place(false);
    engine.syncRing();
    if (!keyboardRef.current) return;
    keyboardRef.current = false;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const item = itemRefs.current[selected];
    if (!viewport || !track || !item) return;
    const top = track.offsetTop + item.offsetTop;
    const bottom = top + item.offsetHeight;
    const room = Math.max(0, (viewport.clientHeight - item.offsetHeight) / 2);
    const margin = Math.min(showGradients ? Math.max(12, fadeSize) : 12, room);
    if (top < viewport.scrollTop + margin) {
      viewport.scrollTo({ top: Math.max(0, top - margin), behavior: 'smooth' });
    } else if (bottom > viewport.scrollTop + viewport.clientHeight - margin) {
      viewport.scrollTo({ top: bottom - viewport.clientHeight + margin, behavior: 'smooth' });
    }
  }, [selected, fadeSize, showGradients]);

  useEffect(() => {
    engineRef.current?.updateFades();
  }, [showGradients, fadeSize, maxHeight, gap]);

  const hover = (index: number) => {
    if (!navigatingRef.current) setSelected(index);
  };

  const choose = (item: T, index: number, event: ReactMouseEvent<HTMLElement>) => {
    setSelected(index);
    if (!onItemSelect) return;
    if (event.target instanceof Element) {
      const innerInteractive = event.target.closest('button, a, input, textarea, select, label, summary');
      if (innerInteractive && innerInteractive !== event.currentTarget && event.currentTarget.contains(innerInteractive)) {
        return;
      }
    }
    onItemSelect(item, index);
  };

  const unbounded = maxHeight === 'none';
  const TrackTag = asList ? 'ul' : 'div';
  const ItemTag = asList ? 'li' : 'div';
  const IndicatorTag = asList ? 'li' : 'span';
  const selectableListbox = Boolean(onItemSelect) && !interactiveRows;

  return (
    <div
      ref={rootRef}
      className={`animated-list${frame ? ' animated-list--framed' : ''} ${className}`.trim()}
      data-animated={animation !== 'none' ? '' : undefined}
      style={
        {
          ...(THEMES[theme] ?? THEMES.dark),
          '--al-radius': `${Math.max(0, radius)}px`,
          '--al-gap': `${Math.max(0, gap)}px`,
          '--al-width': size(width),
          '--al-accent': accentColor || 'var(--al-ink)',
          ...(accentColor
            ? {
                '--al-ring': accentColor,
                '--al-ring-fill': `color-mix(in srgb, ${accentColor} 8%, transparent)`,
              }
            : {}),
          ...style,
        } as CSSProperties
      }
    >
      <div
        ref={viewportRef}
        className={`animated-list__viewport${displayScrollbar ? '' : ' animated-list__viewport--bare'}${unbounded ? ' animated-list__viewport--unbounded' : ''}`}
        role={selectableListbox ? 'listbox' : undefined}
        tabIndex={selectableListbox ? 0 : undefined}
        aria-activedescendant={
          selectableListbox && selected >= 0 && selected < items.length ? `${baseId}-${selected}` : undefined
        }
        onPointerLeave={() => {
          if (selectOnHover && !interactiveRows) return;
        }}
        style={{
          maxHeight: unbounded ? undefined : size(maxHeight),
          maskImage: showGradients && !unbounded ? FADE_MASK : undefined,
          WebkitMaskImage: showGradients && !unbounded ? FADE_MASK : undefined,
        }}
      >
        <TrackTag
          ref={trackRef as React.RefObject<HTMLUListElement & HTMLDivElement>}
          className={`animated-list__track ${listClassName}`.trim()}
        >
          {items.map((item, index) => {
            const entry: AnimatedListObjectItem =
              item !== null && typeof item === 'object'
                ? (item as unknown as AnimatedListObjectItem)
                : { title: String(item) };
            const isSelected = index === selected;
            const customItemClass =
              typeof itemClassName === 'function' ? itemClassName(item, index, isSelected) : itemClassName;
            const key = getItemKey ? getItemKey(item, index) : (entry.id ?? index);
            return (
              <ItemTag
                key={key}
                ref={(element: HTMLElement | null) => {
                  itemRefs.current[index] = element;
                }}
                id={`${baseId}-${index}`}
                className={`animated-list__item${interactiveRows ? ' animated-list__item--interactive' : ''} ${customItemClass}`.trim()}
                role={selectableListbox ? 'option' : undefined}
                aria-selected={selectableListbox ? isSelected : undefined}
                data-index={index}
                data-selected={isSelected ? '' : undefined}
                onPointerEnter={selectOnHover ? () => hover(index) : undefined}
                onClick={(e: ReactMouseEvent<HTMLElement>) => choose(item, index, e)}
              >
                {renderItem ? (
                  renderItem(item, index, isSelected)
                ) : (
                  <>
                    {(entry.image || entry.icon) && (
                      <span className="animated-list__lead">
                        {entry.image ? <img src={entry.image} alt="" draggable={false} /> : entry.icon}
                      </span>
                    )}
                    <span className="animated-list__text">
                      <span className="animated-list__title">{entry.title}</span>
                      {entry.description && (
                        <span className="animated-list__description">{entry.description}</span>
                      )}
                    </span>
                    {entry.meta && <span className="animated-list__meta">{entry.meta}</span>}
                  </>
                )}
                <span className="animated-list__rim" aria-hidden="true" />
              </ItemTag>
            );
          })}
          <IndicatorTag
            ref={indicatorRef as React.RefObject<HTMLLIElement & HTMLSpanElement>}
            className="animated-list__indicator"
            aria-hidden="true"
          >
            <span ref={ringRef} className="animated-list__ring" />
          </IndicatorTag>
        </TrackTag>
      </div>
      {frame && <span className="animated-list__frame-rim" aria-hidden="true" />}
    </div>
  );
}

export default AnimatedList;
