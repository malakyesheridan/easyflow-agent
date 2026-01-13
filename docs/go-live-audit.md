# Go-Live Readiness Audit

Scope: Login/Auth, Onboarding, Org Structure + Permissions, Scale Readiness

## 1) Login / Auth
- PASS: Auth enforced on app routes; API routes are protected with explicit checks (public exceptions: auth endpoints and Stripe webhook).
- PASS: Session handling updated with expiry + refresh, secure cookie flags in production, and logout revocation.
- PASS: Password reset tokens are single-use with expiry; email delivery now supported via Resend (requires RESEND_API_KEY + COMM_DEFAULT_FROM_EMAIL).
- PASS: Invite tokens are single-use and email-matched; org scoping and expiry enforced.
- PASS: No sensitive server secrets found in client bundles (NEXT_PUBLIC used for client-only keys).
- PASS: Server-side RBAC now enforced for read/write job and schedule endpoints.
- PASS: Auth/API protection tests added (unauthenticated session, travel-time, root API, secure cookie flag).

## 2) Onboarding
- PASS: Session/org membership required before accessing core modules.
- PASS: Completion now validates job types, work templates, and active crew; timezone defaults to UTC when missing.
- PASS: Comm defaults reseeded on completion to ensure safe template/provider defaults.
- PASS: Onboarding remains idempotent (PATCH updates existing rows; templates/job types are updated in-place).
- PASS: Optional materials step can be skipped without breaking completion.

## 3) Org Structure + Permissions
- PASS: Tenant scoping verified on core queries (jobs, schedule assignments, operations map/intel, comms, audit logs).
- PASS: Role model is explicit and documented; server checks now enforce view/update/manage permissions.
- PASS: Crew membership is single per org membership (org_memberships.crew_member_id).
- PASS: Row scoping enforced across Jobs/Schedule/Operations/Notifications using centralized visibility helpers.
- PASS: Crew isolation enforced; crew-scoped users cannot read or mutate cross-crew jobs or schedules.
- PASS: Warehouse org role removed from config; legacy warehouse users are blocked at login pending admin reassignment.
- DECISION: Crew visibility policy locked to Option A. Admin/manager (org-wide) can see all jobs/schedule/operations; crew-scoped roles see only items assigned to their crew membership.
  - Example: Admin user -> sees all jobs.
  - Example: Crew user -> sees only jobs assigned to their crew.
- PASS: Audit trail captures job status changes, schedule changes, cost edits, and communications sent.
- PASS: Permissions matrix documented in docs/permissions-matrix.md.

## 4) Scale Readiness Smoke Tests
- PASS: Added seed script for 5 orgs / 200 crews / 10k jobs / 50k job events / 30 days schedule (scripts/seed-scale.ts).
- PASS: Added indexes for heavy tenant filters (jobs org_id+created_at, org_id+crew_id; sessions expires_at).
- PASS: Rate limiting applied to auth, webhooks, and message dispatch endpoints.
