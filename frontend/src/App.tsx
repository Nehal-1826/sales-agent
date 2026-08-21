import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SplashScreen } from '@/components/SplashScreen';
import { PageLoader } from '@/components/loaders';

/**
 * Minimal route-level error boundary. If a lazy chunk fails to evaluate or
 * a render throws, we'd otherwise see a fully blank screen (Suspense fallback
 * is a 200px empty div — no error context). This boundary surfaces the actual
 * error message + a "Reload" button so the user can recover and we can see
 * what went wrong without opening DevTools.
 */
interface RouteErrorBoundaryState {
  err: Error | null;
}
class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[RouteErrorBoundary] caught error', err, info);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm">
          <h2 className="text-base font-semibold text-rose-300">Something broke while loading this page</h2>
          <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs text-rose-200">
            {this.state.err.message}
          </pre>
          <button
            type="button"
            onClick={() => {
              this.setState({ err: null });
              window.location.reload();
            }}
            className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

// Layouts — eager so the chrome paints instantly while inner pages stream in.
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';

// Critical entry page — eager so the marketing homepage paints instantly.
import { NewLandingPage } from '@/pages/NewLandingPage';
import { MobileHeroPreview } from '@/pages/MobileHeroPreview';
import { MobileCrmPreview } from '@/pages/MobileCrmPreview';
import { MobileDashboardPreview } from '@/pages/MobileDashboardPreview';
import { MobileProductPreview } from '@/pages/MobileProductPreview';
import { MobilePeerPreview } from '@/pages/MobilePeerPreview';
import { MobileHowItWorksPreview } from '@/pages/MobileHowItWorksPreview';
import { MobilePricingPreview } from '@/pages/MobilePricingPreview';

// Login / Signup are lazy: both statically pull in the Firebase Auth SDK
// (~200 KB), which we do NOT want in the initial bundle for visitors who
// land on the homepage. Splitting them keeps Firebase off the critical path.
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const ImpersonateBootstrap = lazy(() => import('@/pages/ImpersonateBootstrap').then((m) => ({ default: m.ImpersonateBootstrap })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const VerifyEmailPendingPage = lazy(() => import('@/pages/VerifyEmailPendingPage'));

/* ---------------------------------------------------------------------------
   Every other page is lazy.

   Before: 80+ page modules eagerly imported into the initial bundle. The
   browser had to parse + execute the entire admin tree, design-preview
   pages, and onboarding before the first route could render.

   After: each route is its own chunk. Vite splits by dynamic import, so
   /login loads only the login + landing + shared deps; /app/dashboard
   only adds the dashboard chunk; /admin/* only loads admin chunks when
   a super_admin actually hits the admin section.

   The top progress bar (<RouteLoader />) gives users perceived progress
   while the chunk fetches.
--------------------------------------------------------------------------- */

// Public / legal
const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const HowItWorksPage = lazy(() => import('@/pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

// Design preview (super_admin-only / internal — biggest bundle saving)
const AdminDesignPreview = lazy(() => import('@/pages/admin-preview/AdminDesignPreview').then((m) => ({ default: m.AdminDesignPreview })));
const MainDashboardDesigns = lazy(() => import('@/pages/admin-preview/MainDashboardDesigns').then((m) => ({ default: m.MainDashboardDesigns })));
const UserDesigns = lazy(() => import('@/pages/admin-preview/UserDesigns').then((m) => ({ default: m.UserDesigns })));
const PeerInboxDesigns = lazy(() => import('@/pages/admin-preview/PeerInboxDesigns').then((m) => ({ default: m.PeerInboxDesigns })));
const PoolRoutingDesigns = lazy(() => import('@/pages/admin-preview/PoolRoutingDesigns').then((m) => ({ default: m.PoolRoutingDesigns })));
const PlatformAnalyticsDesigns = lazy(() => import('@/pages/admin-preview/PlatformAnalyticsDesigns').then((m) => ({ default: m.PlatformAnalyticsDesigns })));
const LlmUsageDesigns = lazy(() => import('@/pages/admin-preview/LlmUsageDesigns').then((m) => ({ default: m.LlmUsageDesigns })));
const PlansDesigns = lazy(() => import('@/pages/admin-preview/PlansDesigns').then((m) => ({ default: m.PlansDesigns })));
const BillingDesigns = lazy(() => import('@/pages/admin-preview/BillingDesigns').then((m) => ({ default: m.BillingDesigns })));
const SystemHealthDesigns = lazy(() => import('@/pages/admin-preview/SystemHealthDesigns').then((m) => ({ default: m.SystemHealthDesigns })));
const AuditLogDesigns = lazy(() => import('@/pages/admin-preview/AuditLogDesigns').then((m) => ({ default: m.AuditLogDesigns })));
const AdminSettingsDesigns = lazy(() => import('@/pages/admin-preview/AdminSettingsDesigns').then((m) => ({ default: m.AdminSettingsDesigns })));
const PopupDesigns = lazy(() => import('@/pages/admin-preview/PopupDesigns').then((m) => ({ default: m.PopupDesigns })));
const ClientDashboardDesigns = lazy(() => import('@/pages/client-design-preview/ClientDashboardDesigns').then((m) => ({ default: m.ClientDashboardDesigns })));
const ClientMailboxesDesigns = lazy(() => import('@/pages/client-design-preview/ClientMailboxesDesigns').then((m) => ({ default: m.ClientMailboxesDesigns })));
const ClientActivityDesigns = lazy(() => import('@/pages/client-design-preview/ClientActivityDesigns').then((m) => ({ default: m.ClientActivityDesigns })));
const ClientAnalyticsDesigns = lazy(() => import('@/pages/client-design-preview/ClientAnalyticsDesigns').then((m) => ({ default: m.ClientAnalyticsDesigns })));
const ClientReputationDesigns = lazy(() => import('@/pages/client-design-preview/ClientReputationDesigns').then((m) => ({ default: m.ClientReputationDesigns })));
const ClientToolsDesigns = lazy(() => import('@/pages/client-design-preview/ClientToolsDesigns').then((m) => ({ default: m.ClientToolsDesigns })));
const ClientReportsDesigns = lazy(() => import('@/pages/client-design-preview/ClientReportsDesigns').then((m) => ({ default: m.ClientReportsDesigns })));
const ClientWorkspaceDesigns = lazy(() => import('@/pages/client-design-preview/ClientWorkspaceDesigns').then((m) => ({ default: m.ClientWorkspaceDesigns })));
const ClientBillingDesigns = lazy(() => import('@/pages/client-design-preview/ClientBillingDesigns').then((m) => ({ default: m.ClientBillingDesigns })));
const ClientSettingsDesigns = lazy(() => import('@/pages/client-design-preview/ClientSettingsDesigns').then((m) => ({ default: m.ClientSettingsDesigns })));
const ProDesignPicker = lazy(() => import('@/pages/client-design-preview/ProDesignPicker').then((m) => ({ default: m.ProDesignPicker })));
const ProDashboardPicker = lazy(() => import('@/pages/client-design-preview/ProDashboardPicker').then((m) => ({ default: m.ProDashboardPicker })));
const ProMailboxPicker = lazy(() => import('@/pages/client-design-preview/ProMailboxPicker').then((m) => ({ default: m.ProMailboxPicker })));
const ProActivityPicker = lazy(() => import('@/pages/client-design-preview/ProActivityPicker').then((m) => ({ default: m.ProActivityPicker })));
const ProAnalyticsPicker = lazy(() => import('@/pages/client-design-preview/ProAnalyticsPicker').then((m) => ({ default: m.ProAnalyticsPicker })));
const ProReputationPicker = lazy(() => import('@/pages/client-design-preview/ProReputationPicker').then((m) => ({ default: m.ProReputationPicker })));
const ProToolsPicker = lazy(() => import('@/pages/client-design-preview/ProToolsPicker').then((m) => ({ default: m.ProToolsPicker })));
const ProReportsPicker = lazy(() => import('@/pages/client-design-preview/ProReportsPicker').then((m) => ({ default: m.ProReportsPicker })));
const ProWorkspacePicker = lazy(() => import('@/pages/client-design-preview/ProWorkspacePicker').then((m) => ({ default: m.ProWorkspacePicker })));
const ProWorkspaceFinal = lazy(() => import('@/pages/client-design-preview/ProWorkspaceFinal').then((m) => ({ default: m.ProWorkspaceFinal })));
const ProBillingPicker = lazy(() => import('@/pages/client-design-preview/ProBillingPicker').then((m) => ({ default: m.ProBillingPicker })));
const ProSettingsPicker = lazy(() => import('@/pages/client-design-preview/ProSettingsPicker').then((m) => ({ default: m.ProSettingsPicker })));

// Integrated Pro app preview — sidebar + topbar + outlet wrapping the 10 locked designs
const ProApp = lazy(() => import('@/pages/client-design-preview/ProApp').then((m) => ({ default: m.ProApp })));
const ProAppDashboard = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppDashboard').then((m) => ({ default: m.ProAppDashboard })));
const ProAppMailboxes = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppMailboxes').then((m) => ({ default: m.ProAppMailboxes })));
const ProAppActivity = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppActivity').then((m) => ({ default: m.ProAppActivity })));
const ProAppAnalytics = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppAnalytics').then((m) => ({ default: m.ProAppAnalytics })));
const ProAppReputation = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppReputation').then((m) => ({ default: m.ProAppReputation })));
const ProAppTools = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppTools').then((m) => ({ default: m.ProAppTools })));
const ProAppReports = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppReports').then((m) => ({ default: m.ProAppReports })));
const ProAppWorkspace = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppWorkspace').then((m) => ({ default: m.ProAppWorkspace })));
const ProAppBilling = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppBilling').then((m) => ({ default: m.ProAppBilling })));
const ProAppSettings = lazy(() => import('@/pages/client-design-preview/pro-app/ProAppSettings').then((m) => ({ default: m.ProAppSettings })));

// Onboarding
const OnboardingWizard = lazy(() => import('@/pages/onboarding/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })));
const OnboardingDashboard = lazy(() => import('@/pages/onboarding/OnboardingDashboard').then((m) => ({ default: m.OnboardingDashboard })));

// Same-origin landing page for the mailbox-connect OAuth popup. The
// backend's mailbox-callback forwards the popup here with the result
// payload base64-encoded in the URL fragment — this route owns
// `postMessage` to the opener and `window.close()`.
const OauthPopupDone = lazy(() => import('@/pages/OauthPopupDone').then((m) => ({ default: m.OauthPopupDone })));

// Client pages
const DashboardPage = lazy(() => import('@/pages/client/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MailboxesPage = lazy(() => import('@/pages/client/MailboxesPage').then((m) => ({ default: m.MailboxesPage })));
const MailboxDrillIn = lazy(() => import('@/pages/client/mailboxes/MailboxDrillIn').then((m) => ({ default: m.MailboxDrillIn })));
const WarmupActivityPage = lazy(() => import('@/pages/client/WarmupActivityPage').then((m) => ({ default: m.WarmupActivityPage })));
const AnalyticsPage = lazy(() => import('@/pages/client/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const ToolsPage = lazy(() => import('@/pages/client/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const ToolsIndex = lazy(() => import('@/pages/client/tools/ToolsIndex').then((m) => ({ default: m.ToolsIndex })));
const PlacementTester = lazy(() => import('@/pages/client/tools/PlacementTester').then((m) => ({ default: m.PlacementTester })));
const SpamScanner = lazy(() => import('@/pages/client/tools/SpamScanner').then((m) => ({ default: m.SpamScanner })));
const TemplateDesigner = lazy(() => import('@/pages/client/tools/TemplateDesigner').then((m) => ({ default: m.TemplateDesigner })));
const WarmupPreview = lazy(() => import('@/pages/client/tools/WarmupPreview').then((m) => ({ default: m.WarmupPreview })));
const NotificationsPage = lazy(() => import('@/pages/client/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ReportsPage = lazy(() => import('@/pages/client/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const CrmPage = lazy(() => import('@/pages/client/CrmPage').then((m) => ({ default: m.CrmPage })));
const WorkspacePage = lazy(() => import('@/pages/client/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));
const BillingPage = lazy(() => import('@/pages/client/BillingPage').then((m) => ({ default: m.BillingPage })));
const SettingsPage = lazy(() => import('@/pages/client/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const JulexPage = lazy(() => import('@/pages/client/integrations/JulexPage').then((m) => ({ default: m.JulexPage })));

// Admin pages
const AdminDashboardPage = lazy(() => import('@/pages/admin/DashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const RevengePage = lazy(() => import('@/pages/admin/RevengePage').then((m) => ({ default: m.RevengePage })));
const AdminCrmPage = lazy(() => import('@/pages/admin/CrmManagementPage').then((m) => ({ default: m.CrmManagementPage })));
const PeerInboxesPage = lazy(() => import('@/pages/admin/PeerInboxesPage').then((m) => ({ default: m.PeerInboxesPage })));
const PoolRoutingPage = lazy(() => import('@/pages/admin/PoolRoutingPage').then((m) => ({ default: m.PoolRoutingPage })));
const PlatformAnalyticsPage = lazy(() => import('@/pages/admin/PlatformAnalyticsPage').then((m) => ({ default: m.PlatformAnalyticsPage })));
const LlmUsagePage = lazy(() => import('@/pages/admin/LlmUsagePage').then((m) => ({ default: m.LlmUsagePage })));
const PlansPage = lazy(() => import('@/pages/admin/PlansPage').then((m) => ({ default: m.PlansPage })));
const AddonsPage = lazy(() => import('@/pages/admin/AddonsPage').then((m) => ({ default: m.AddonsPage })));
const SystemHealthPage = lazy(() => import('@/pages/admin/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const AdminReportsPage = lazy(() => import('@/pages/admin/ReportsPage').then((m) => ({ default: m.AdminReportsPage })));
const AdminBillingPage = lazy(() => import('@/pages/admin/BillingPage').then((m) => ({ default: m.BillingPage })));
const AdminSettingsPage = lazy(() => import('@/pages/admin/SettingsPage').then((m) => ({ default: m.AdminSettingsPage })));

/**
 * Suspense fallback while a lazy route chunk fetches — a centered warm
 * "Orbital Pulse" loading animation (PageLoader), alongside the RouteLoader
 * progress bar pinned to the top of the viewport.
 */
function RouteSuspenseFallback() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PageLoader inline label="Loading…" />
    </div>
  );
}

export default function App() {
  return (
    <>
      {/* Brand splash on app boot — self-hides after its entrance animation. */}
      <SplashScreen />
      {/* Persistent impersonation banner — self-hides unless an admin is
          impersonating. Sits above all routed content (client + admin). */}
      <ImpersonationBanner />
      {/* Promo banner when a newer Android app version is published. */}
      <AppUpdateBanner />
      <RouteErrorBoundary>
      <Suspense fallback={<RouteSuspenseFallback />}>
        <Routes>
        {/* New hero takes over the root — bypasses PublicLayout chrome. */}
        <Route path="/" element={<NewLandingPage />} />
        <Route path="/mobile-hero-preview" element={<MobileHeroPreview />} />
        <Route path="/mobile-crm-preview" element={<MobileCrmPreview />} />
        <Route path="/mobile-dashboard-preview" element={<MobileDashboardPreview />} />
        <Route path="/mobile-product-preview" element={<MobileProductPreview />} />
        <Route path="/mobile-peer-preview" element={<MobilePeerPreview />} />
        <Route path="/mobile-howitworks-preview" element={<MobileHowItWorksPreview />} />
        <Route path="/mobile-pricing-preview" element={<MobilePricingPreview />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/old" element={<LandingPage />} />

        {/* Design preview pages — used during the redesign to pick layouts. */}
        <Route path="/admin-design-preview" element={<AdminDesignPreview />} />
        <Route path="/admin-design-preview/dashboards" element={<MainDashboardDesigns />} />
        <Route path="/admin-design-preview/users" element={<UserDesigns />} />
        <Route path="/admin-design-preview/peer-inboxes" element={<PeerInboxDesigns />} />
        <Route path="/admin-design-preview/pool-routing" element={<PoolRoutingDesigns />} />
        <Route path="/admin-design-preview/platform-analytics" element={<PlatformAnalyticsDesigns />} />
        <Route path="/admin-design-preview/llm-usage" element={<LlmUsageDesigns />} />
        <Route path="/admin-design-preview/plans" element={<PlansDesigns />} />
        <Route path="/admin-design-preview/billing" element={<BillingDesigns />} />
        <Route path="/admin-design-preview/system-health" element={<SystemHealthDesigns />} />
        <Route path="/admin-design-preview/audit-log" element={<AuditLogDesigns />} />
        <Route path="/admin-design-preview/admin-settings" element={<AdminSettingsDesigns />} />
        <Route path="/admin-design-preview/popups" element={<PopupDesigns />} />
        <Route path="/client-design-preview/dashboards/starter" element={<ClientDashboardDesigns />} />
        <Route path="/client-design-preview/mailboxes/starter" element={<ClientMailboxesDesigns />} />
        <Route path="/client-design-preview/activity/starter" element={<ClientActivityDesigns />} />
        <Route path="/client-design-preview/analytics/starter" element={<ClientAnalyticsDesigns />} />
        <Route path="/client-design-preview/reputation/starter" element={<ClientReputationDesigns />} />
        <Route path="/client-design-preview/tools/starter" element={<ClientToolsDesigns />} />
        <Route path="/client-design-preview/reports/starter" element={<ClientReportsDesigns />} />
        <Route path="/client-design-preview/workspace/starter" element={<ClientWorkspaceDesigns />} />
        <Route path="/client-design-preview/billing/starter" element={<ClientBillingDesigns />} />
        <Route path="/client-design-preview/settings/starter" element={<ClientSettingsDesigns />} />
        <Route path="/client-design-preview/pro" element={<ProDesignPicker />} />
        <Route path="/client-design-preview/dashboards/pro" element={<ProDashboardPicker />} />
        <Route path="/client-design-preview/mailboxes/pro" element={<ProMailboxPicker />} />
        <Route path="/client-design-preview/activity/pro" element={<ProActivityPicker />} />
        <Route path="/client-design-preview/analytics/pro" element={<ProAnalyticsPicker />} />
        <Route path="/client-design-preview/reputation/pro" element={<ProReputationPicker />} />
        <Route path="/client-design-preview/tools/pro" element={<ProToolsPicker />} />
        <Route path="/client-design-preview/reports/pro" element={<ProReportsPicker />} />
        <Route path="/client-design-preview/workspace/pro" element={<ProWorkspacePicker />} />
        <Route path="/client-design-preview/workspace/pro/final" element={<ProWorkspaceFinal />} />
        <Route path="/client-design-preview/billing/pro" element={<ProBillingPicker />} />
        <Route path="/client-design-preview/settings/pro" element={<ProSettingsPicker />} />

        {/* Integrated Pro app preview — sidebar/topbar shell over all 10 locked designs */}
        <Route path="/client-design-preview/pro-app" element={<ProApp />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ProAppDashboard />} />
          <Route path="mailboxes" element={<ProAppMailboxes />} />
          <Route path="activity" element={<ProAppActivity />} />
          <Route path="analytics" element={<ProAppAnalytics />} />
          <Route path="reputation" element={<ProAppReputation />} />
          <Route path="tools" element={<ProAppTools />} />
          <Route path="reports" element={<ProAppReports />} />
          <Route path="workspace" element={<ProAppWorkspace />} />
          <Route path="billing" element={<ProAppBilling />} />
          <Route path="settings" element={<ProAppSettings />} />
        </Route>

        {/* Auth pages — full-bleed split layout, bypass PublicLayout chrome. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/impersonate" element={<ImpersonateBootstrap />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email-pending" element={<VerifyEmailPendingPage />} />

        {/* OAuth popup last-leg landing. Unauthenticated — the popup
            from /onboarding races back here with the result in the URL
            fragment. No layout chrome; the route itself owns
            postMessage to the opener + window.close(). */}
        <Route path="/oauth/popup-done" element={<OauthPopupDone />} />

        {/* Public (legal) */}
        <Route element={<PublicLayout />}>
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Route>

        {/* Onboarding dashboard — full-bleed, bypasses chrome. The dashboard
            handles every phase inline (plan → checkout → volume → provider →
            credentials → DNS → start). */}
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <OnboardingDashboard />
            </AuthGuard>
          }
        />

        {/* Legacy wizard URLs (e.g. /onboarding/connect, /onboarding/dns) —
            all redirect to /onboarding via the wizard component itself. We
            deliberately render WITHOUT the old OnboardingLayout chrome so
            users never see the green/teal legacy header even for a frame. */}
        <Route
          path="/onboarding/:step"
          element={
            <AuthGuard>
              <OnboardingWizard />
            </AuthGuard>
          }
        />

        {/* Authenticated client */}
        <Route path="/app" element={<ClientLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="mailboxes" element={<MailboxesPage />}>
            <Route path=":id" element={<MailboxDrillIn />} />
          </Route>
          <Route path="activity" element={<WarmupActivityPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          {/* Health/Reputation section removed — redirect stale links to dashboard. */}
          <Route path="reputation" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="tools" element={<ToolsPage />}>
            <Route index element={<ToolsIndex />} />
            <Route path="placement" element={<PlacementTester />} />
            <Route path="spam" element={<SpamScanner />} />
            <Route path="templates" element={<TemplateDesigner />} />
            <Route path="preview" element={<WarmupPreview />} />
          </Route>
          <Route path="reports" element={<ReportsPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Integrations — one shared page for every plan tier. */}
          <Route path="integrations/julex" element={<JulexPage />} />
        </Route>

        {/* Admin (super_admin only) */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="revenge" element={<RevengePage />} />
          <Route path="crm" element={<AdminCrmPage />} />
          <Route path="peer-inboxes" element={<PeerInboxesPage />} />
          <Route path="pool-routing" element={<PoolRoutingPage />} />
          <Route path="platform-analytics" element={<PlatformAnalyticsPage />} />
          <Route path="llm-usage" element={<LlmUsagePage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="addons" element={<AddonsPage />} />
          <Route path="system-health" element={<SystemHealthPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="billing" element={<AdminBillingPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  );
}
