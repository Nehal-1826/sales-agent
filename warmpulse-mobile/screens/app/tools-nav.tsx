/**
 * Tool navigation — sub-screen routing within the Tools section.
 *
 * A simple stack: tools list → tool detail screen. Back button returns to the
 * list. This lives outside the global nav so each tool can focus on its job.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToolScreen = 'placement' | 'spam' | 'dns' | 'template' | 'preview' | null;

type ToolNavContextValue = {
  active: ToolScreen;
  open: (screen: ToolScreen) => void;
  close: () => void;
};

const ToolNavContext = createContext<ToolNavContextValue>({
  active: null,
  open: () => {},
  close: () => {},
});

export function ToolNavProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ToolScreen>(null);

  const open = useCallback((screen: ToolScreen) => {
    setActive(screen);
  }, []);

  const close = useCallback(() => {
    setActive(null);
  }, []);

  return <ToolNavContext.Provider value={{ active, open, close }}>{children}</ToolNavContext.Provider>;
}

export function useToolNav(): ToolNavContextValue {
  return useContext(ToolNavContext);
}

// Re-export for AppShell
export { ToolScreens } from './tools/ToolScreens';
