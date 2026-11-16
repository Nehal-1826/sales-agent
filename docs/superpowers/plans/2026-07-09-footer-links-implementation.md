# Footer with Terms & Privacy Links - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal footers with Terms of Service and Privacy Policy links to all public-facing pages and authenticated user panels.

**Architecture:** Inline footer components added to each layout/page. Fixed positioning at viewport bottom ensures consistent visibility. Uses existing design tokens for visual consistency.

**Tech Stack:** React (TSX), React Router (Link component), Tailwind CSS

## Global Constraints

- Use exact CSS classes from spec: `fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20`
- Footer must include: copyright with dynamic year, Privacy link (`/privacy`), Terms link (`/terms`)
- NO footer on: admin pages (`/admin/*`), design-preview routes, OAuth popup routes
- Fixed positioning - footer stays at viewport bottom
- Add bottom padding (`pb-16`) to content containers where needed to prevent overlap

---

## File Structure

The following files will be modified:

1. `frontend/src/pages/landing/NewHero.tsx` - Homepage footer
2. `frontend/src/pages/LoginPage.tsx` - Login page footer  
3. `frontend/src/pages/SignupPage.tsx` - Signup page footer
4. `frontend/src/pages/onboarding/OnboardingDashboard.tsx` - Onboarding footer
5. `frontend/src/components/layout/ClientLayout.tsx` - Authenticated app pages footer

Each file gets an inline footer component with the exact same structure.

---

### Task 1: Add footer to Homepage (NewHero.tsx)

**Files:**
- Modify: `frontend/src/pages/landing/NewHero.tsx:3515-3537`

**Interfaces:**
- Consumes: `Link` from `react-router-dom`
- Produces: Footer JSX rendered at bottom of page

The homepage already has a footer in the code (lines 3516-3537) but user reports it's not showing on live site. Verify the footer is correctly placed and rendered.

- [ ] **Step 1: Verify footer exists in code**

Run: Check that lines 3516-3537 contain the footer JSX
Expected: Footer with copyright and Privacy/Terms links

- [ ] **Step 2: Ensure footer is properly rendered**

Check that the footer is inside the main return statement and not conditionally rendered.

- [ ] **Step 3: Verify CSS classes are correct**

Ensure the footer uses: `fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20`

- [ ] **Step 4: Test locally**

Run: `cd frontend && pnpm dev`
Visit: `http://localhost:5173/`
Expected: Footer visible at bottom of homepage

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/landing/NewHero.tsx
git commit -m "fix: ensure footer renders on homepage"
```

---

### Task 2: Add footer to LoginPage

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `Link` from `react-router-dom` (already imported)
- Produces: Wrapped JSX with footer at bottom

LoginPage currently returns `<> <AuthCard /> ... </>`. Need to wrap in a container with bottom padding and add footer.

- [ ] **Step 1: Write footer JSX**

Add this footer before the closing `</>`:

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

- [ ] **Step 2: Wrap content in container with bottom padding**

Wrap the existing `<>...</>` content in a div with bottom padding:

```tsx
return (
  <div className="min-h-screen pb-16">
    <AuthCard ... />
    <TotpDialog ... />
    <footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
        <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-text">Privacy</Link>
          <Link to="/terms" className="hover:text-text">Terms</Link>
        </div>
      </div>
    </footer>
  </div>
);
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Test locally**

Visit: `http://localhost:5173/login`
Expected: Footer visible at bottom, content not overlapping

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add footer to login page"
```

---

### Task 3: Add footer to SignupPage

**Files:**
- Modify: `frontend/src/pages/SignupPage.tsx`

**Interfaces:**
- Consumes: `Link` from `react-router-dom` (already imported)
- Produces: Wrapped JSX with footer at bottom

SignupPage returns `<AuthCard />` directly. Need to wrap in container with bottom padding and add footer.

- [ ] **Step 1: Wrap content and add footer**

Replace the return statement to:

```tsx
return (
  <div className="min-h-screen pb-16">
    <AuthCard
      heading={t('auth.signup.heading')}
      subheading={t('auth.signup.subheading')}
      social={<Button ... />}
      footer={<><Link to="/login">...</Link></>}
    >
      <form>...</form>
    </AuthCard>
    <footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
        <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-text">Privacy</Link>
          <Link to="/terms" className="hover:text-text">Terms</Link>
        </div>
      </div>
    </footer>
  </div>
);
```

Find the exact return statement location and wrap it appropriately.

- [ ] **Step 2: Verify build**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Test locally**

Visit: `http://localhost:5173/signup`
Expected: Footer visible at bottom

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SignupPage.tsx
git commit -m "feat: add footer to signup page"
```

---

### Task 4: Add footer to OnboardingDashboard

**Files:**
- Modify: `frontend/src/pages/onboarding/OnboardingDashboard.tsx`

**Interfaces:**
- Consumes: `Link` from 'react-router-dom' (already imported)
- Produces: Footer added to main container

OnboardingDashboard returns `<div className="onb-shell">...</div>`. Add footer before the closing `</div>`.

- [ ] **Step 1: Add footer to onb-shell**

Add before the closing `</div>` of the main return (around line 1334):

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

- [ ] **Step 2: Add bottom padding to main content**

Add `pb-16` to the `<main className="onb-body">` element:

```tsx
<main className="onb-body pb-16">
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Test onboarding flow**

Visit: `http://localhost:5173/onboarding` (after login)
Expected: Footer visible, content not overlapping at bottom

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/onboarding/OnboardingDashboard.tsx
git commit -m "feat: add footer to onboarding pages"
```

---

### Task 5: Add footer to ClientLayout

**Files:**
- Modify: `frontend/src/components/layout/ClientLayout.tsx`

**Interfaces:**
- Consumes: `Link` from 'react-router-dom' (already imported at line 2)
- Produces: Footer rendered for all /app/* routes

ClientLayout returns a shell with `ClientPillSidebar` and main content. Add footer as a sibling to main.

- [ ] **Step 1: Add footer to ClientLayout**

The current structure is:
```tsx
<div className="admin-shell client-shell">
  <div className="admin-shell__atmosphere">...</div>
  <ClientPillSidebar />
  <main className="admin-shell__main">
    {showBanner ? <DnsGateBanner /> : null}
    <PageTransition>...</PageTransition>
  </main>
</div>
```

Add the footer right after the `</main>` closing tag:

```tsx
<div className="admin-shell client-shell">
  <div className="admin-shell__atmosphere">...</div>
  <ClientPillSidebar />
  <main className="admin-shell__main">
    {showBanner ? <DnsGateBanner /> : null}
    <PageTransition>...</PageTransition>
  </main>
  <footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
    <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
      <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
      <div className="flex items-center gap-4">
        <Link to="/privacy" className="hover:text-text">Privacy</Link>
        <Link to="/terms" className="hover:text-text">Terms</Link>
      </div>
    </div>
  </footer>
</div>
```

- [ ] **Step 2: Add bottom padding to main content**

Modify the main className to include bottom padding:

```tsx
<main className="admin-shell__main pb-16">
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Test client pages**

Visit: `http://localhost:5173/app/dashboard` (after login)
Expected: Footer visible on all /app/* pages

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/ClientLayout.tsx
git commit -m "feat: add footer to authenticated client pages"
```

---

### Task 6: Comprehensive testing

**Files:**
- No file modifications
- Test: All modified pages

**Interfaces:**
- Consumes: All previous tasks
- Produces: Verification report

- [ ] **Step 1: Build frontend**

Run: `cd frontend && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Check homepage**

Visit: `http://localhost:5173/`
Verify: Footer visible, links work

- [ ] **Step 3: Check login page**

Visit: `http://localhost:5173/login`
Verify: Footer visible, content not overlapping

- [ ] **Step 4: Check signup page**

Visit: `http://localhost:5173/signup`
Verify: Footer visible, content not overlapping

- [ ] **Step 5: Check onboarding**

Login → Visit: `http://localhost:5173/onboarding`
Verify: Footer visible throughout onboarding flow

- [ ] **Step 6: Check client pages**

Visit: `http://localhost:5173/app/dashboard`, `/app/mailboxes`, etc.
Verify: Footer visible on all authenticated pages

- [ ] **Step 7: Verify admin pages have NO footer**

Login as super_admin → Visit: `http://localhost:5173/admin/dashboard`
Verify: NO footer on admin pages (as per spec exclusion)

- [ ] **Step 8: Test responsive**

Test on mobile viewport (375px width)
Verify: Footer responsive, text doesn't wrap awkwardly

- [ ] **Step 9: Test footer links**

Click Privacy link → Should go to `/privacy`
Click Terms link → Should go to `/terms`

- [ ] **Step 10: Commit final changes**

```bash
git add .
git commit -m "test: verify footer implementation across all pages"
```

---

## Testing Checklist

After implementation, verify:

- [ ] Footer visible on homepage (`/`)
- [ ] Footer visible on login page (`/login`)
- [ ] Footer visible on signup page (`/signup`)
- [ ] Footer visible on onboarding (`/onboarding*`)
- [ ] Footer visible on all /app/* pages
- [ ] Footer NOT visible on /admin/* pages
- [ ] Privacy link navigates to `/privacy`
- [ ] Terms link navigates to `/terms`
- [ ] Footer stays fixed when scrolling
- [ ] Footer doesn't overlap page content
- [ ] Responsive on mobile (text doesn't wrap awkwardly)
- [ ] Copyright year is current

---

## Notes

- All footers use identical structure for consistency
- Fixed positioning (`fixed bottom-0`) ensures footer is always visible
- `z-20` keeps footer above content but below modals (which typically use z-50)
- Bottom padding (`pb-16`) on content containers prevents overlap
- `backdrop-blur-xl` creates the glass effect over scrolling content
