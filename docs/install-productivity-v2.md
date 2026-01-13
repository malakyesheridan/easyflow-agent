# Install Productivity v2

## Data model

- Job outputs (jobs table):
  - `planned_m2`, `variation_m2`, `claimed_m2`, `accepted_m2`, `rework_m2`
  - `accepted_m2_approved_by`, `accepted_m2_approved_at`
- Time entries (job_hours_logs table):
  - `start_time`, `end_time`, `minutes`, `bucket`, `delay_reason`, `note`
  - Buckets: INSTALL, SETUP, PACKDOWN, WAITING, ADMIN, TRAVEL, REWORK
  - Waiting reasons: ACCESS_KEYS_NOT_READY, DELIVERY_LATE_OR_WRONG, WEATHER, EQUIPMENT_LIFT_CRANE_WAIT, SAFETY_PERMIT_INDUCTION, CLIENT_CHANGE_SCOPE, REWORK_DEFECT_FIX, OTHER_WITH_NOTE
- Complexity inputs (jobs table):
  - `complexity_access_difficulty`, `complexity_height_lift_requirement`, `complexity_panel_handling_size`,
    `complexity_site_constraints`, `complexity_detailing_complexity` (1-5)
- Quality inputs (jobs table):
  - `quality_defect_count`, `quality_callback_flag`, `quality_missing_docs_flag`, `quality_safety_flag`
- Org settings:
  - `quality_callback_days` (default 30)

## Metrics and formulas

Person-minute buckets:

- `install_person_minutes` = sum(minutes where bucket=INSTALL)
- `onsite_person_minutes` = sum(minutes where bucket in {INSTALL, SETUP, PACKDOWN, WAITING, ADMIN, REWORK})
- `crew_install_window_minutes` = minutes between earliest INSTALL start_time and latest INSTALL end_time

Output:

- `accepted_m2_net` = max(accepted_m2 - rework_m2, 0)
- All rates use accepted_m2_net

Rates:

- NIR = accepted_m2_net / install_person_minutes
- STR = accepted_m2_net / onsite_person_minutes
- CIR = accepted_m2_net / crew_install_window_minutes
- CA-NIR = NIR / complexity_multiplier
- QA-NIR = NIR * quality_multiplier
- CQA-NIR = (NIR / complexity_multiplier) * quality_multiplier

Employee attribution (period totals):

- For each job: `employee_m2_share = accepted_m2_net * (employee_install_minutes / total_install_minutes)`
- `employee_NIR(period) = sum(employee_m2_share) / sum(employee_install_minutes)`

Quality scoring:

- Default 100, subtract for:
  - defect count
  - callback flag
  - rework_m2 > 0
  - missing docs flag
  - safety flag

Quality multipliers:

- 95-100 -> 1.00
- 90-94 -> 0.97
- 80-89 -> 0.90
- <80 -> 0.75

Complexity multipliers:

- 1.0 -> 1.00
- 2.0 -> 1.10
- 3.0 -> 1.25
- 4.0 -> 1.45
- 5.0 -> 1.75
- Linear interpolation for fractional scores

## Where to edit weights and multipliers

- `lib/metrics/installProductivity.ts`
  - `DEFAULT_COMPLEXITY_WEIGHTS`
  - `DEFAULT_QUALITY_PENALTIES`
  - `DEFAULT_THRESHOLDS`
  - `computeComplexityMultiplier`
  - `computeQualityMultiplier`

## Rollout plan

1. Install productivity v2 is enabled by default for all orgs.
2. Collect bucketed time entries and QA acceptance data.
3. Use manager flags to clean up mis-bucketed or unbucketed time.
4. Compare legacy rate (m2/min) to v2 metrics for a validation period.
5. Deprecate legacy reports once v2 confidence is high.
