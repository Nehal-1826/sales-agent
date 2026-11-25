/**
 * "Enter as user" — a platform admin inside a customer's workspace.
 *
 * The admin's console opens /impersonate#t=<ticket> in a NEW tab. That tab
 * starts the ticket once and then signs every request with
 * `Authorization: Impersonation <ticket>`; it lasts 60 minutes. The ticket
 * lives in sessionStorage, which is per tab, so the admin's own tab is never
 * affected.
 *
 * This is the small public face of it — the types and the few helpers — so
 * pages need not import the internals of transport.ts, where the logic lives
 * (every request is built there).
 */

import type { Me } from './platform';

export {
  IMPERSONATION_ENDED_EVENT,
  endImpersonation,
  getImpersonationTicket,
  isImpersonatePath,
  isImpersonating,
  setImpersonationTicket,
  startImpersonation,
} from './transport';

/** What /api/auth/me/ adds while a ticket is in use. */
export interface ImpersonationSession {
  /** username of the platform admin who opened the tab */
  admin: string;
  /** the person entered: their own name, else their username */
  name: string;
  workspace: { id: number; name: string; slug: string };
  started_at: string;
  ends_at: string;
}

/** The person the impersonated tab is signed in as. */
export type ImpersonatedMe = Me & {
  impersonation: ImpersonationSession;
};

/** True when a profile really is the one seen through a ticket. The offline
 *  demo answers with a made-up profile, which is not the customer's. */
export function hasImpersonation(me: Me | null | undefined): me is ImpersonatedMe {
  const session = (me as Partial<ImpersonatedMe> | null | undefined)?.impersonation;
  return (
    !!session &&
    typeof session.admin === 'string' &&
    !!session.workspace &&
    typeof session.workspace.name === 'string' &&
    typeof session.ends_at === 'string'
  );
}
