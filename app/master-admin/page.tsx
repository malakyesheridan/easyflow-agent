import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/ui/PageHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { getSessionContext } from '@/lib/auth/session';
import { getMasterAdminInsights, isMasterAdminEmail, MASTER_ADMIN_EMAIL } from '@/lib/admin/masterAdmin';

export const dynamic = 'force-dynamic';

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0';
  return new Intl.NumberFormat().format(value);
}

export default async function MasterAdminPage() {
  const cookie = headers().get('cookie') ?? '';
  if (!cookie) redirect('/login?next=/master-admin');

  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) redirect('/login?next=/master-admin');
  if (!isMasterAdminEmail(session.user.email)) notFound();

  const data = await getMasterAdminInsights();

  return (
    <PageContainer>
      <PageHeader
        title="Master Admin"
        subtitle={`Restricted to ${MASTER_ADMIN_EMAIL}. Snapshot generated ${formatDateTime(data.generatedAt)}.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Total users</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.usersTotal)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Active users</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.usersActive)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Invited users</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.usersInvited)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Disabled users</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.usersDisabled)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Logged in (7d)</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.usersLoggedIn7d)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Total orgs</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{formatNumber(data.summary.orgsTotal)}</p>
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card>
          <SectionHeader
            title="Global User Overview"
            subtitle="All users with status, org membership count, session footprint, and activity."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-text-tertiary">
                <tr className="border-b border-border-subtle">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Last login</th>
                  <th className="py-2 pr-3">Memberships</th>
                  <th className="py-2 pr-3">Sessions</th>
                  <th className="py-2 pr-3">Audit events (30d)</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-border-subtle/50 text-text-primary">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{user.name || 'Unnamed user'}</p>
                      <p className="text-xs text-text-tertiary">{user.email}</p>
                    </td>
                    <td className="py-2 pr-3">{user.status}</td>
                    <td className="py-2 pr-3">{formatDateTime(user.lastLoginAt)}</td>
                    <td className="py-2 pr-3">{formatNumber(user.memberships.length)}</td>
                    <td className="py-2 pr-3">
                      {formatNumber(user.sessions.active)} active / {formatNumber(user.sessions.total)} total
                    </td>
                    <td className="py-2 pr-3">{formatNumber(user.activity.auditEvents30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Org Page Totals"
            subtitle="Total records per org by page domain, across core modules."
          />
          <div className="mt-4 space-y-4">
            {data.orgPageTotals.map((org) => (
              <div key={org.orgId} className="rounded-lg border border-border-subtle p-4">
                <p className="text-sm font-semibold text-text-primary">{org.orgName}</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-text-tertiary">
                      <tr className="border-b border-border-subtle">
                        <th className="py-2 pr-3">Page</th>
                        <th className="py-2 pr-3">Route</th>
                        <th className="py-2 pr-3">Total records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.totals.map((total) => (
                        <tr key={`${org.orgId}-${total.pageKey}`} className="border-b border-border-subtle/40 text-text-primary">
                          <td className="py-2 pr-3">{total.pageLabel}</td>
                          <td className="py-2 pr-3">
                            <Link href={total.route} className="text-accent-gold hover:underline">
                              {total.route}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{formatNumber(total.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {data.users.map((user) => (
            <Card key={`detail-${user.id}`} padding="none">
              <details className="group">
                <summary className="cursor-pointer list-none px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{user.name || user.email}</p>
                      <p className="text-xs text-text-tertiary">{user.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-text-tertiary">
                      <span className="rounded border border-border-subtle px-2 py-1">status: {user.status}</span>
                      <span className="rounded border border-border-subtle px-2 py-1">
                        memberships: {formatNumber(user.memberships.length)}
                      </span>
                      <span className="rounded border border-border-subtle px-2 py-1">
                        sessions: {formatNumber(user.sessions.active)} active
                      </span>
                      <span className="rounded border border-border-subtle px-2 py-1">
                        audit(30d): {formatNumber(user.activity.auditEvents30d)}
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="space-y-5 border-t border-border-subtle px-6 py-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <p className="text-xs text-text-tertiary">User created</p>
                      <p className="mt-1 text-sm text-text-primary">{formatDateTime(user.createdAt)}</p>
                    </Card>
                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <p className="text-xs text-text-tertiary">Last login</p>
                      <p className="mt-1 text-sm text-text-primary">{formatDateTime(user.lastLoginAt)}</p>
                    </Card>
                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <p className="text-xs text-text-tertiary">Last session seen</p>
                      <p className="mt-1 text-sm text-text-primary">{formatDateTime(user.sessions.lastSeenAt)}</p>
                    </Card>
                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <p className="text-xs text-text-tertiary">Password reset requests</p>
                      <p className="mt-1 text-sm text-text-primary">
                        {formatNumber(user.security.passwordResetRequests)} ({formatNumber(user.security.passwordResetUsed)} used)
                      </p>
                    </Card>
                  </div>

                  <div>
                    <SectionHeader title="Memberships" subtitle="Org access, roles, and membership status." />
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-text-tertiary">
                          <tr className="border-b border-border-subtle">
                            <th className="py-2 pr-3">Org</th>
                            <th className="py-2 pr-3">Role</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Crew member</th>
                            <th className="py-2 pr-3">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {user.memberships.length === 0 ? (
                            <tr>
                              <td className="py-2 pr-3 text-text-tertiary" colSpan={5}>
                                No memberships.
                              </td>
                            </tr>
                          ) : (
                            user.memberships.map((membership) => (
                              <tr key={membership.membershipId} className="border-b border-border-subtle/40 text-text-primary">
                                <td className="py-2 pr-3">{membership.orgName}</td>
                                <td className="py-2 pr-3">{membership.roleName || membership.roleKey || 'No role'}</td>
                                <td className="py-2 pr-3">{membership.status}</td>
                                <td className="py-2 pr-3">{membership.crewMemberId || 'None'}</td>
                                <td className="py-2 pr-3">{formatDateTime(membership.createdAt)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <SectionHeader title="Top Audit Actions" subtitle="Most common actions for this user." />
                      <div className="mt-3 space-y-2 text-sm">
                        {user.activity.topActions.length === 0 ? (
                          <p className="text-text-tertiary">No audit actions logged.</p>
                        ) : (
                          user.activity.topActions.map((item) => (
                            <div key={`${user.id}-action-${item.action}`} className="flex items-center justify-between">
                              <span className="text-text-primary">{item.action}</span>
                              <span className="text-text-tertiary">{formatNumber(item.total)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>

                    <Card className="shadow-none ring-1 ring-border-subtle/60">
                      <SectionHeader title="Top Audit Entities" subtitle="Entity types this user touches most." />
                      <div className="mt-3 space-y-2 text-sm">
                        {user.activity.topEntities.length === 0 ? (
                          <p className="text-text-tertiary">No entity activity logged.</p>
                        ) : (
                          user.activity.topEntities.map((item) => (
                            <div key={`${user.id}-entity-${item.entityType}`} className="flex items-center justify-between">
                              <span className="text-text-primary">{item.entityType}</span>
                              <span className="text-text-tertiary">{formatNumber(item.total)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>

                  <div>
                    <SectionHeader
                      title="Module Contributions"
                      subtitle="User-linked records across pages (owner/creator/assignee/session actor)."
                    />
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-text-tertiary">
                          <tr className="border-b border-border-subtle">
                            <th className="py-2 pr-3">Page</th>
                            <th className="py-2 pr-3">Linkage</th>
                            <th className="py-2 pr-3">Table</th>
                            <th className="py-2 pr-3">Total</th>
                            <th className="py-2 pr-3">Org breakdown</th>
                          </tr>
                        </thead>
                        <tbody>
                          {user.moduleContributions.length === 0 ? (
                            <tr>
                              <td className="py-2 pr-3 text-text-tertiary" colSpan={5}>
                                No linked records found.
                              </td>
                            </tr>
                          ) : (
                            user.moduleContributions.map((item) => (
                              <tr key={`${user.id}-${item.key}`} className="border-b border-border-subtle/40 text-text-primary">
                                <td className="py-2 pr-3">
                                  <Link href={item.route} className="text-accent-gold hover:underline">
                                    {item.pageLabel}
                                  </Link>
                                </td>
                                <td className="py-2 pr-3">{item.linkageLabel}</td>
                                <td className="py-2 pr-3">{item.table}</td>
                                <td className="py-2 pr-3">{formatNumber(item.total)}</td>
                                <td className="py-2 pr-3 text-xs text-text-tertiary">
                                  {item.byOrg.map((byOrg) => `${byOrg.orgName}: ${formatNumber(byOrg.total)}`).join(' | ')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <SectionHeader
                      title="Org Snapshots"
                      subtitle="Per-org totals by page, alongside this user's owned/assigned share."
                    />
                    <div className="mt-3 space-y-3">
                      {user.orgInsights.length === 0 ? (
                        <p className="text-sm text-text-tertiary">No org-linked insights available.</p>
                      ) : (
                        user.orgInsights.map((orgInsight) => (
                          <div key={`${user.id}-${orgInsight.orgId}`} className="rounded-lg border border-border-subtle p-4">
                            <p className="text-sm font-semibold text-text-primary">{orgInsight.orgName}</p>
                            <div className="mt-3 overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="text-left text-text-tertiary">
                                  <tr className="border-b border-border-subtle">
                                    <th className="py-2 pr-3">Page</th>
                                    <th className="py-2 pr-3">Org total</th>
                                    <th className="py-2 pr-3">User-linked total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orgInsight.pageTotals.map((page) => {
                                    const owned =
                                      orgInsight.userOwnedTotals.find((item) => item.pageKey === page.pageKey)?.total ?? 0;
                                    return (
                                      <tr
                                        key={`${user.id}-${orgInsight.orgId}-${page.pageKey}`}
                                        className="border-b border-border-subtle/40 text-text-primary"
                                      >
                                        <td className="py-2 pr-3">
                                          <Link href={page.route} className="text-accent-gold hover:underline">
                                            {page.pageLabel}
                                          </Link>
                                        </td>
                                        <td className="py-2 pr-3">{formatNumber(page.total)}</td>
                                        <td className="py-2 pr-3">{formatNumber(owned)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>

        <Card>
          <SectionHeader title="Recent Audit Events" subtitle="Last 200 audit events across all orgs." />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-text-tertiary">
                <tr className="border-b border-border-subtle">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Org</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Entity</th>
                  <th className="py-2 pr-3">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAuditEvents.map((event) => (
                  <tr key={event.id} className="border-b border-border-subtle/40 text-text-primary">
                    <td className="py-2 pr-3">{formatDateTime(event.createdAt)}</td>
                    <td className="py-2 pr-3">{event.orgName}</td>
                    <td className="py-2 pr-3">
                      {event.actorName || event.actorEmail || event.actorUserId || 'System'}
                    </td>
                    <td className="py-2 pr-3">{event.action}</td>
                    <td className="py-2 pr-3">{event.entityType}</td>
                    <td className="py-2 pr-3">{event.entityId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
