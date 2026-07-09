import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type Screen = 'login' | 'signup' | 'onboarding' | 'app';

type Nav = { screen: Screen; go: (s: Screen) => void; reset: (s: Screen) => void; back: () => boolean };
const NavCtx = createContext<Nav>({ screen: 'login', go: () => {}, reset: () => {}, back: () => false });

/** Tiny stack-based navigator — no native nav module needed. */
export function NavProvider({ children }: { children: ReactNode }) {
  // App opens straight at login (no marketing landing screen).
  const [stack, setStack] = useState<Screen[]>(['login']);
  const screen = stack[stack.length - 1]!;
  const go = useCallback((s: Screen) => setStack((p) => [...p, s]), []);
  const reset = useCallback((s: Screen) => setStack([s]), []);
  const back = useCallback(() => {
    let popped = false;
    setStack((p) => {
      if (p.length > 1) { popped = true; return p.slice(0, -1); }
      return p;
    });
    return popped;
  }, []);
  return <NavCtx.Provider value={{ screen, go, reset, back }}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);
