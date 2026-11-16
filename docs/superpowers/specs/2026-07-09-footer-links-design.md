# Footer with Terms & Privacy Links - Design Spec

**Date:** 2026-07-09
**Status:** Approved

## Overview

Add minimal footers with Terms of Service and Privacy Policy links to all public-facing pages and authenticated user panels. Footers should be fixed at the viewport bottom for consistent visibility.

## Requirements

### 1. Component Design

A minimal inline footer with:

```tsx
<footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
  <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
    <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
    <div className="flex items-center gap-4">
      <Link to="/privacy" className="hover:text-text">Privacy</Link>
      <Link to="/terms" className="hover:text-text">Terms</Link>
    </div>
  </div>
</footer>
```

**Key attributes:**
- Copyright notice with dynamic year
- Two navigation links: `/privacy` and `/terms`
- Fixed positioning at viewport bottom (`fixed bottom-0`)
- Semi-transparent background with backdrop blur (`bg-bg/90 backdrop-blur-xl`)
- Border-top separator (`border-t border-white/[0.06]`)
- Z-index 20 to stay above content but below modals

### 2. Styling Tokens

Uses existing design tokens:
- `border-white/[0.06]` - subtle border
- `bg-bg/90` - 90% opacity background
- `text-text-dim` - muted text color
- `hover:text-text` - hover state brightens links

### 3. Pages Requiring Footer

| File | Route | Type |
|------|-------|------|
| `frontend/src/pages/landing/NewHero.tsx` | `/` | Homepage |
| `frontend/src/pages/LoginPage.tsx` | `/login` | Auth |
| `frontend/src/pages/SignupPage.tsx` | `/signup` | Auth |
| `frontend/src/pages/onboarding/OnboardingDashboard.tsx` | `/onboarding*` | Onboarding |
| `frontend/src/components/layout/ClientLayout.tsx` | `/app/*` | Authenticated user panel |

### 4. Exclusions

**No footer needed for:**
- Admin pages (`/admin/*`) - `AdminLayout.tsx`
- Design-preview routes (`/admin-design-preview/*`, `/client-design-preview/*`)
- OAuth popup routes

### 5. Content Padding

Since footer is fixed at bottom (~40px height), page content may need bottom padding to prevent content from being hidden. Apply `pb-16` or similar to content containers where needed.

## Implementation Notes

1. **Homepage (`NewHero.tsx`)**: Add footer at the end of the component, before the closing `</div>`

2. **Auth pages (`LoginPage.tsx`, `SignupPage.tsx`)**: Wrap existing content in a container with bottom padding, add footer at bottom

3. **Onboarding (`OnboardingDashboard.tsx`)**: Add footer to the main container, ensure content has bottom padding

4. **ClientLayout**: Add footer inside the `admin-shell__main` container or as a sibling to the main element

5. **Import requirements**: Each file needs `import { Link } from 'react-router-dom'`

## Testing Checklist

- [ ] Footer visible on homepage
- [ ] Footer visible on login page
- [ ] Footer visible on signup page
- [ ] Footer visible on onboarding pages
- [ ] Footer visible on all /app/* pages (dashboard, mailboxes, etc.)
- [ ] Footer NOT visible on /admin/* pages
- [ ] Privacy link navigates to `/privacy`
- [ ] Terms link navigates to `/terms`
- [ ] Footer stays fixed when scrolling
- [ ] Footer doesn't overlap page content
- [ ] Responsive on mobile (text doesn't wrap awkwardly)

## Open Questions

None - spec is complete.
