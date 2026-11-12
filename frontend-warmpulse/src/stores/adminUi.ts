import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AdminUiState {
  railCollapsed: boolean;
  toggleRail: () => void;
  setRailCollapsed: (v: boolean) => void;
  godMode: boolean;
  toggleGodMode: () => void;
}

/**
 * Admin shell UI prefs. Persisted so the rail's collapsed state survives
 * reloads. Mirrors the persistence approach used by `stores/ui.ts` and
 * `stores/auth.ts` (zustand `persist` + `createJSONStorage(localStorage)`
 * + `partialize`).
 */
export const useAdminUi = create<AdminUiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setRailCollapsed: (v) => set(() => ({ railCollapsed: v })),
      godMode: false,
      toggleGodMode: () => set((state) => ({ godMode: !state.godMode })),
    }),
    {
      name: 'warmpulse.adminUi',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        railCollapsed: state.railCollapsed,
        godMode: state.godMode 
      }),
    },
  ),
);
