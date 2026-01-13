# Automation Builder QA

Manual checklist
- Create a custom rule, run dry-run, enable, trigger a matching event, verify a run row plus action steps and comm outbox entries.
- Idempotency: replay the same event payload/entity id and confirm no duplicate comm outbox is created.
- Non-idempotent events: emit the same trigger with a new timestamp/bucket and confirm a new run occurs.
- Rate limiting: emit >20 events in an hour (or >200/day) and confirm runs are logged as rate_limited.
- Provider gating: disable email/SMS providers and confirm enable is blocked with a clear error.
- Kill switch: enable org_settings.automations_disabled and confirm no runtime runs are created.
- RLS: non-admin cannot create/update/enable; admins can; cross-org access is denied.
