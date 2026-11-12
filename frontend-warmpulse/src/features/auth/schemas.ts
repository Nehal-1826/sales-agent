import { z } from 'zod';

/**
 * Shared auth form schemas.
 *
 * NOTE: password rules mirror backend (§12 of the spec): min 8 chars, must contain
 * at least one letter and one digit. We intentionally keep symbol/uppercase as
 * *strength hints only* — not required — so the strength meter has headroom
 * without blocking legitimate signups.
 */

const passwordRule = z
  .string()
  .min(8, 'Must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a number');

export const signupSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: passwordRule,
});

export type SignupFormValues = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  // Only used after the server asks for 2FA. Zod doesn't block empty here;
  // the form component enforces a 6-digit submit guard when visible.
  totp_code: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === '' || /^\d{6}$/.test(v), {
      message: 'Enter the 6-digit code',
    }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Pure strength scoring — visual only. Not a gate.
 * 0 empty, 1 length, 2 +digit, 3 +upper&lower, 4 +symbol.
 */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (pw.length >= 8) score = 1;
  if (score >= 1 && /\d/.test(pw)) score = 2;
  if (score >= 2 && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score = 3;
  if (score >= 3 && /[^A-Za-z0-9]/.test(pw)) score = 4;
  return score;
}
