# Install Productivity Audit (Current System)

Date: 2026-01-08

## Current calculation formulas

- Crew install stats (`lib/mutations/crew_install_stats.ts`)
  - For completed jobs updated in the last 90 days:
    - `job_m2` = sum of `material_usage_logs.quantity_used` where unit is square meters.
    - `job_minutes` = sum of `job_hours_logs.minutes`.
    - For each crew member on the job: `m2_share = job_m2 * (crew_minutes / job_minutes)`.
    - Totals are accumulated into 7d/30d/90d buckets based on `jobs.updated_at`.
    - `m2_per_minute` = `m2_total / minutes_total` per window.
- Install time estimate (`app/api/install-time-estimate/route.ts`)
  - `job_total_m2` from planned allocations or usage (see below).
  - `crew_speed` selected from install stats (prefers 30d, then 90d, then 7d).
  - `base_minutes = job_total_m2 / crew_speed.m2_per_minute`.
  - Optional multipliers from install modifiers are applied to `base_minutes`.

## Where m2 comes from today

- Planned m2: `job_material_allocations.planned_quantity` joined to `materials.unit`, filtered to square meter units (`lib/queries/install_time.ts`).
- Used m2: `material_usage_logs.quantity_used` joined to `materials.unit`, filtered to square meter units.
- Install stats use used m2 only (`lib/mutations/crew_install_stats.ts`).
- Install estimate uses planned m2 if available, otherwise used m2.

## Where job duration comes from today

- Manual job hours logs: `job_hours_logs.minutes` (integer minutes).
- These minutes are the only source for install stats and crew speed.
- No per-entry start/end timestamps or bucket classification exist.

## How employees are assigned to jobs today

- Employees are `crew_members`.
- Jobs have `crew_id` and can be scheduled via `schedule_assignments` by crew.
- Install stats attribute minutes to `job_hours_logs.crew_member_id` entries.

## Existing time tracking data

- `job_hours_logs` table stores `org_id`, `job_id`, `crew_member_id`, `minutes`, `note`, `created_at`.
- UI: `JobHoursCard` (Job detail) posts to `/api/job-hours` to log minutes.
- No bucket enum, delay reason, or rework category is tracked.

## Existing QA / signoff / rework representations

- No accepted/claimed/rework m2 fields.
- No QA approval metadata.
- No explicit rework tracking or quality scoring.
- Task templates include a "defect" flow, but it is not tied to output or productivity.

## Existing UI screens and API endpoints involved

- UI:
  - `components/jobs/JobHoursCard.tsx` for manual minutes.
  - `components/crews/CrewDetailView.tsx` and `components/dashboard/DashboardView.tsx` for install speed KPIs.
  - `components/schedule/ScheduleJobModal.tsx` for install time estimates.
- API:
  - `GET/POST /api/job-hours` for manual minutes.
  - `GET /api/crew-install-stats` for crew speed stats.
  - `GET /api/install-time-estimate` for schedule planning.
- Data access:
  - `lib/mutations/crew_install_stats.ts` (recompute logic).
  - `lib/queries/install_time.ts` (m2 totals).

## Gaps vs required v2 system

- No job-level output fields (`planned_m2`, `variation_m2`, `claimed_m2`, `accepted_m2`, `rework_m2`).
- No audit trail for claimed/accepted changes.
- No person-minute bucketed time tracking (INSTALL/SETUP/PACKDOWN/WAITING/ADMIN/TRAVEL/REWORK).
- No waiting delay reason or required notes for "other".
- No install window computation from time entries.
- No complexity or quality scoring fields.
- No rework tracking in minutes or m2 that reduces accepted output.
- No complexity/quality adjusted metrics.
- No anti-gaming flags or manager review UI.
- No feature flag for staged rollout.

