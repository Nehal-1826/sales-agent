import { TutorialPanel } from '@/pages/onboarding/TutorialPanels';
import {
  AppDialog,
  AppDialogContent,
} from '@/components/ui/AppDialog';
import { useUpdateWorkspaceProfile } from './api';

interface AcademyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoCrmEnabled: boolean;
  onToggleAutoCrm: (enabled: boolean) => void;
}

export function AcademyModal({ open, onOpenChange, autoCrmEnabled, onToggleAutoCrm }: AcademyModalProps) {
  const updateProfile = useUpdateWorkspaceProfile();

  const handleFinish = async () => {
    try {
      await updateProfile.mutateAsync({
        auto_crm_enabled: autoCrmEnabled,
      });
      onOpenChange(false);
    } catch {
      // fallback if settings fails
      onOpenChange(false);
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent 
        className="max-w-xl p-0 overflow-hidden border-none bg-transparent shadow-none"
      >
        <TutorialPanel 
          autoCrmEnabled={autoCrmEnabled}
          onToggleAutoCrm={onToggleAutoCrm}
          onFinish={handleFinish}
        />
      </AppDialogContent>
    </AppDialog>
  );
}
