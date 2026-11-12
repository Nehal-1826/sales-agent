/**
 * Public add-ons — the pricing page's add-on strip (publicPlans' sibling).
 *
 * Reads `GET /api/addons` (unauthenticated), which returns only active
 * catalogue rows in the public shape: {id, key, name, description,
 * price_cents, price_display}. Add-ons are purchased in-app behind auth, so
 * this is marketing data only — the strip renders no buy button.
 *
 * Distinct from billing's ['addons'] key (auth'd /payments/addons, which
 * carries the per-caller ``owned`` flag) — sharing a key would mix shapes
 * in the React Query cache and crash consumers.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shape returned by GET /api/addons (PublicAddonOut). */
export interface PublicAddon {
  id: string;
  key: string;
  name: string;
  description: string;
  price_cents: number;
  price_display: string;
}

async function fetchPublicAddons(): Promise<PublicAddon[]> {
  const { data } = await api.get<PublicAddon[] | { addons: PublicAddon[] }>('/addons');
  const raw = Array.isArray(data) ? data : Array.isArray(data?.addons) ? data.addons : [];
  return raw;
}

/**
 * Fetch active add-ons. Returns `data: undefined` while loading or on error
 * so callers can render nothing — the strip only appears when add-ons exist.
 */
export function usePublicAddons() {
  return useQuery({
    queryKey: ['public-addons'],
    queryFn: fetchPublicAddons,
    retry: 0,
    staleTime: 60 * 1000,
  });
}
