**Admin/Crew Surface Audit (Phase 1)**

RBAC + visibility logic
- `lib/authz.ts` defines `RequestActor` and `VisibilityMode` (`orgWide` vs `crewScoped`).
- `getVisibilityMode(actor)` returns `orgWide` if actor has any of: `admin`, `manage_org`, `manage_roles`, `manage_staff`, `manage_schedule`, `manage_jobs`; otherwise `crewScoped`.
- `applyJobVisibility` enforces crew scoping using `crewId` for arrays or SQL (returns `false` for crew with no crewId).
- Write access checks: `assertJobWriteAccess` allows `orgWide` or matching crewId.

Mobile-only crew flow
- `components/common/AppShell.tsx` uses `useIsMobile()` + capability check to redirect crew roles to `/jobs/today` when on mobile and visiting `/` or `/dashboard`.
- `components/common/MobileNav.tsx` renders the mobile bottom nav (Today/Jobs/Map/Notifications/Profile) for all users.
- `/jobs/today` (`components/jobs/TodayJobsView.tsx`) is a mobile-first crew flow with bottom sheets for actions.

Existing mobile/desktop divergence
- `components/jobs/JobDetail.tsx` uses `useIsMobile()` to collapse/expand sections and hide many admin-only cards on mobile.
- `components/schedule/ScheduleView.tsx` renders `ScheduleMobileList` on mobile and full schedule editor on desktop.
- `components/operations/OperationsHub.tsx` has mobile/desktop headers but no role switch yet.

Admin-only screens (current structure; not consistently guarded)
- Admin-focused pages: `/dashboard`, `/schedule` (editor), `/crews`, `/warehouse`, `/announcements`, `/settings/*`, `/invoices/*`, `/operations/intelligence`.
- Settings subpages include communications and automations (`/settings/communications`, `/settings/automations`, `/settings/integrations`).

Crew-needed screens (current structure)
- `/jobs/today`, `/jobs` list, `/jobs/[id]` detail, `/operations/map`, `/notifications`, `/profile`.

Existing role-aware switches already used
- `AppShell` uses local `ORG_WIDE_CAPS` to infer “crew role” for mobile redirect.
- Several components gate actions by `capabilities` (e.g., `TodayJobsView`, `JobTimeEntriesCard`, `JobFinancialsCard`, settings views).
- Quick actions registry uses capability checks for availability.
