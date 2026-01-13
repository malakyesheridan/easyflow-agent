import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { buildDailyCrewDigestPreviews } from '@/lib/communications/digest';
import { withCommOrgScope } from '@/lib/communications/scope';
import { commTemplates } from '@/db/schema/comm_templates';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { renderEmailHtml, renderTemplate } from '@/lib/communications/renderer';

const DAILY_DIGEST_EVENT_KEY = 'daily_crew_digest';

export const POST = withRoute(async (req: Request) => {
  const url = new URL(req.url);
  const searchOrgId = url.searchParams.get('orgId');
  const queryDate = url.searchParams.get('date');
  const queryIncludeTomorrow = url.searchParams.get('includeTomorrow');
  const querySendEmpty = url.searchParams.get('sendEmpty');
  const queryCrewId = url.searchParams.get('crewId');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const orgId = typeof body?.orgId === 'string' ? body.orgId : searchOrgId;
  const date = typeof body?.date === 'string' ? body.date : queryDate;
  const includeTomorrow =
    typeof body?.includeTomorrow === 'boolean' ? body.includeTomorrow : queryIncludeTomorrow === 'true';
  const sendEmpty = typeof body?.sendEmpty === 'boolean' ? body.sendEmpty : querySendEmpty === 'true';
  const crewId = typeof body?.crewId === 'string' ? body.crewId : queryCrewId;
  const normalizedCrewId = crewId && crewId !== 'all' ? crewId : null;

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const previewData = await buildDailyCrewDigestPreviews({
    orgId: context.data.orgId,
    date: date ?? undefined,
    includeTomorrow,
    sendEmpty,
    crewId: normalizedCrewId ?? undefined,
  });

  return await withCommOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (db) => {
    const [template] = await db
      .select()
      .from(commTemplates)
      .where(
        and(
          eq(commTemplates.orgId, context.data.orgId),
          eq(commTemplates.key, DAILY_DIGEST_EVENT_KEY),
          eq(commTemplates.channel, 'email')
        )
      )
      .orderBy(desc(commTemplates.version))
      .limit(1);

    if (!template) return err('NOT_FOUND', 'Template not found');

    const [orgRow] = await db
      .select({ name: orgs.name, commFromEmail: orgSettings.commFromEmail })
      .from(orgs)
      .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
      .where(eq(orgs.id, context.data.orgId))
      .limit(1);

    const actor = {
      name: context.data.session.user.name ?? context.data.session.user.email,
      role: context.data.actor.roleKey,
      email: context.data.session.user.email,
    };

    const previews = previewData.previews.map((row) => {
      const variables: Record<string, any> = {
        org: {
          name: orgRow?.name ?? 'Organisation',
          email: orgRow?.commFromEmail ?? null,
        },
        actor,
        recipient: {
          name: row.crewName,
          email: row.email,
        },
        digest: row.digest,
        now: new Date().toISOString(),
      };

      const subjectResult = template.subject ? renderTemplate(template.subject, variables) : null;
      const bodyTextResult = renderTemplate(template.body, variables);
      const htmlResult = template.bodyHtml
        ? renderTemplate(template.bodyHtml, variables)
        : { rendered: renderEmailHtml(bodyTextResult.rendered), missing: [] as string[] };

      return {
        crewId: row.crewId,
        crewName: row.crewName,
        email: row.email,
        totalJobs: row.totalJobs,
        digest: {
          date: row.digest.date,
          dayName: row.digest.dayName,
          dateLabel: row.digest.dateLabel,
          totalJobs: row.digest.totalJobs,
        },
        subject: subjectResult?.rendered ?? null,
        bodyText: bodyTextResult.rendered,
        bodyHtml: htmlResult.rendered,
        missingVars: Array.from(
          new Set([...(subjectResult?.missing ?? []), ...bodyTextResult.missing, ...htmlResult.missing])
        ),
      };
    });

    return ok({
      baseDayKey: previewData.baseDayKey,
      timeZone: previewData.timeZone,
      previews,
      skipped: previewData.skipped,
    });
  });
});
