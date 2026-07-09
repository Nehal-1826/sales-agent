import { useState } from 'react';
import { Shield, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/AppToast';

/**
 * Admin security panel — scaffolding only.
 *
 * Two toggles for the platform-wide 2FA gate. Both default OFF and are NOT
 * enforced anywhere yet (login flow remains unchanged). When the backend
 * wires `platform_settings.security_*` rows in a follow-up, swap the local
 * `useState` for the admin-settings query/mutation.
 */
interface SecurityPanelProps {
  delay?: number;
}

export function SecurityPanel({ delay = 0 }: SecurityPanelProps) {
  const [allowUserTotp, setAllowUserTotp] = useState(false);
  const [requireAdminTotp, setRequireAdminTotp] = useState(false);

  const onToggle = (next: boolean, kind: 'user' | 'admin') => {
    if (kind === 'user') setAllowUserTotp(next);
    else setRequireAdminTotp(next);
    toast.info(
      next
        ? '2FA enforcement lands in a future release — toggle saved locally for now.'
        : 'Disabled.',
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-dim" />
            Security
            <Badge variant="neutral">Scaffold</Badge>
          </CardTitle>
          <CardDescription>
            Two-factor authentication and session policy. Currently scaffolded —
            toggles are saved client-side until backend enforcement lands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border-muted bg-surface-2/30 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Allow users to enable 2FA</p>
              <p className="mt-1 text-xs text-text-dim">
                Surfaces a "Two-factor authentication" card on each user's
                workspace settings. Login flow is unchanged until the user
                opts in.
              </p>
            </div>
            <AppSwitch
              checked={allowUserTotp}
              onCheckedChange={(v) => onToggle(v, 'user')}
              aria-label="Allow users to enable 2FA"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border-muted bg-surface-2/30 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent3" />
                Require 2FA for super-admin login
              </p>
              <p className="mt-1 text-xs text-text-dim">
                Once enforcement is live, super-admins without an active TOTP
                enrolment will be redirected through setup before reaching
                /admin.
              </p>
            </div>
            <AppSwitch
              checked={requireAdminTotp}
              onCheckedChange={(v) => onToggle(v, 'admin')}
              aria-label="Require 2FA for super-admin login"
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
