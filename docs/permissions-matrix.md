# Permissions Matrix (Default Roles)

This document reflects the default role capabilities seeded in the database.
Roles and capabilities are configurable per organization, but server-side checks
enforce the capabilities listed here.

## Capability Summary

- admin: manage_org, manage_roles, manage_templates, manage_announcements, manage_staff, manage_schedule, manage_jobs
- manager: manage_templates, manage_announcements, manage_staff, manage_schedule, manage_jobs
- staff: view_schedule, view_jobs, update_jobs

## Visibility Policy (Option A)

Org-wide visibility is granted to roles with any of these capabilities: admin, manage_org, manage_roles, manage_staff,
manage_schedule, or manage_jobs. All other roles are crew-scoped and must only see jobs/schedule/operations assigned to
their crew membership.

| Role key (default) | Visibility mode | Notes |
| --- | --- | --- |
| admin | orgWide | Includes admin capability. |
| manager | orgWide | Has manage_schedule/manage_jobs. |
| staff | crewScoped | View/update only. |

Notes:
- Default role keys are seeded at signup (admin, manager, staff). Orgs may add custom roles that inherit
  visibility based on the capability rule above.
- Crew member roles (e.g., installer, supervisor, apprentice, warehouse, admin) live on `crew_members` and do not
  determine visibility mode; visibility uses org role capabilities + crew membership.
- The legacy `warehouse` org role is deprecated and blocked at login. Admins must reassign affected users.

## Action Matrix

| Action | Admin | Manager | Staff |
| --- | --- | --- | --- |
| Manage org settings | Yes | No | No |
| Manage roles | Yes | No | No |
| Manage staff (crew) | Yes | Yes | No |
| Manage schedule (create/update assignments) | Yes | Yes | No |
| View schedule | Yes | Yes | Yes |
| Manage jobs (create/update/delete) | Yes | Yes | No |
| Update jobs (progress, notes, tasks, photos, docs, hours) | Yes | Yes | Yes |
| View jobs | Yes | Yes | Yes |
| Manage templates (job types, work templates) | Yes | Yes | No |
| Manage announcements and comm templates | Yes | Yes | No |
| Manage materials | Yes | Yes | No |
| View audit logs | Yes | No | No |
| Operations map/intelligence view | Yes | Yes | Yes |
| Operations map/intelligence actions (ack/assign/resolve) | Yes | Yes | No |

## Notes

- Operations map/intelligence view requires view_schedule or view_jobs.
- Operations map/intelligence actions require manage_schedule or manage_jobs.
- Financial endpoints (job costs, profitability, payments) require manage_jobs.
