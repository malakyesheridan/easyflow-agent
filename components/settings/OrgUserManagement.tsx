'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, CollapsibleSection, Input, Select } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type OrgRoleOption = {
  id: string;
  key: string;
  name: string;
  isDefault: boolean;
};

type OrgMemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  userStatus: string;
  userCreatedAt: string;
  lastLoginAt: string | null;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
  membershipStatus: string;
  membershipCreatedAt: string;
  lastSeenAt: string | null;
  sessionsTotal: number;
  sessions30d: number;
};

type OrgInviteRow = {
  id: string;
  email: string;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
};

type OrgMembersPayload = {
  members: OrgMemberRow[];
  invites: OrgInviteRow[];
  roles: OrgRoleOption[];
};

type InviteResponse = {
  inviteId: string | null;
  inviteUrl: string;
  email: string;
  expiresAt: string;
};

const getApiErrorMessage = (payload: ApiResponse<any>): string | undefined => {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDateOnly(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRoleLabel(roleKey?: string | null, roleName?: string | null): string {
  const normalized = roleKey?.toLowerCase() ?? '';
  if (normalized === 'admin') return 'Principal';
  if (normalized === 'manager') return 'Team Lead';
  if (normalized === 'staff') return 'Agent';
  return roleName || roleKey || '-';
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    normalized === 'disabled' || normalized === 'inactive' || normalized === 'expired'
      ? 'muted'
      : normalized === 'invited' || normalized === 'pending'
        ? 'gold'
        : 'default';
  return <Badge variant={variant}>{formatStatusLabel(normalized)}</Badge>;
}

function isInviteExpired(invite: OrgInviteRow): boolean {
  const expiresAt = new Date(invite.expiresAt);
  return Number.isNaN(expiresAt.getTime()) ? false : expiresAt.getTime() < Date.now();
}

export default function OrgUserManagement({ orgId }: { orgId: string }) {
  const isMobile = useIsMobile();
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [invites, setInvites] = useState<OrgInviteRow[]>([]);
  const [roles, setRoles] = useState<OrgRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org-members?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<OrgMembersPayload>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to load org users');
      setMembers(json.data.members ?? []);
      setInvites(json.data.invites ?? []);
      setRoles(json.data.roles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load org users');
      setMembers([]);
      setInvites([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultRoleId = useMemo(() => {
    return (
      roles.find((role) => role.isDefault)?.id ||
      roles.find((role) => role.key === 'staff')?.id ||
      roles[0]?.id ||
      ''
    );
  }, [roles]);

  useEffect(() => {
    if (!inviteRoleId && defaultRoleId) {
      setInviteRoleId(defaultRoleId);
    }
  }, [defaultRoleId, inviteRoleId]);

  const pendingInvites = useMemo(() => {
    return invites.filter((invite) => invite.status === 'pending');
  }, [invites]);

  const inviteCounts = useMemo(() => {
    return {
      members: members.length,
      active: members.filter((member) => member.userStatus === 'active').length,
      invited: pendingInvites.length,
    };
  }, [members, pendingInvites.length]);

  const summaryLabel = useMemo(() => {
    if (loading) return 'Loading members...';
    return `${inviteCounts.members} members - ${inviteCounts.invited} invites`;
  }, [inviteCounts.invited, inviteCounts.members, loading]);

  const sendInvite = useCallback(
    async (payload: { inviteId?: string; email?: string; roleId?: string }) => {
      setInviteLoading(true);
      setInviteError(null);
      setInviteSuccess(null);
      try {
        const res = await fetch('/api/org-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, ...payload }),
        });
        const json = (await res.json()) as ApiResponse<InviteResponse>;
        const message = getApiErrorMessage(json);
        if (!res.ok || !json.ok) throw new Error(message || 'Failed to send invite');
        setInviteLink(json.data.inviteUrl);
        setInviteSuccess(`Invite ready for ${json.data.email}`);
        await load();
        return json.data.inviteUrl;
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
        return null;
      } finally {
        setInviteLoading(false);
      }
    },
    [load, orgId]
  );

  const sendInviteFromForm = useCallback(async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }
    const resolvedRoleId = inviteRoleId || defaultRoleId;
    if (!resolvedRoleId) {
      setInviteError('Role is required');
      return;
    }
    const inviteUrl = await sendInvite({
      email: inviteEmail.trim(),
      roleId: resolvedRoleId,
    });
    if (inviteUrl) {
      setInviteEmail('');
    }
  }, [defaultRoleId, inviteEmail, inviteRoleId, sendInvite]);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteSuccess('Invite link copied');
    } catch {
      setInviteError('Failed to copy invite link');
    }
  }, [inviteLink]);

  const renderMembers = () => {
    if (loading) return <p className="text-sm text-text-tertiary">Loading org members...</p>;
    if (members.length === 0) return <p className="text-sm text-text-tertiary">No members found.</p>;

    if (isMobile) {
      return (
        <div className="space-y-3">
          {members.map((member) => {
            const displayName = member.name || member.email;
            return (
              <div
                key={member.membershipId}
                className="rounded-md border border-border-subtle bg-bg-section/20 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{displayName}</p>
                    <p className="text-xs text-text-tertiary">{member.email}</p>
                  </div>
                  <StatusBadge status={member.userStatus} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-tertiary">
                  <div>
                    <span className="text-text-secondary">Role</span>
                    <div>{formatRoleLabel(member.roleKey, member.roleName)}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Last login</span>
                    <div>{formatDate(member.lastLoginAt)}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Last seen</span>
                    <div>{formatDate(member.lastSeenAt)}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Sessions (30d)</span>
                    <div>{member.sessions30d}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-text-tertiary">
                  Member since {formatDateOnly(member.membershipCreatedAt)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="rounded-md border border-border-subtle overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-section">
            <tr className="text-left text-xs text-text-tertiary">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Member since</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const displayName = member.name || member.email;
              return (
                <tr
                  key={member.membershipId}
                  className="border-t border-border-subtle hover:bg-bg-section/40"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{displayName}</div>
                    <div className="text-xs text-text-tertiary">{member.email}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatRoleLabel(member.roleKey, member.roleName)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={member.userStatus} />
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{formatDate(member.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-text-tertiary">{formatDate(member.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-text-tertiary">
                    <div className="text-text-secondary">30d: {member.sessions30d}</div>
                    <div className="text-xs">Total: {member.sessionsTotal}</div>
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">
                    {formatDateOnly(member.membershipCreatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <CollapsibleSection
      title="Manage your org"
      description="Invite team members and manage access across roles."
      summary={summaryLabel}
      storageKey="settings.section.manage-org"
      actions={
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Members', value: inviteCounts.members },
            { label: 'Active accounts', value: inviteCounts.active },
            { label: 'Pending invites', value: inviteCounts.invited },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-border-subtle bg-bg-section/20 px-4 py-3">
              <p className="text-xs text-text-tertiary">{stat.label}</p>
              <p className="text-lg font-semibold text-text-primary">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-border-subtle pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Invite a teammate</h3>
            <p className="text-xs text-text-tertiary mt-1">
              Generate an invite link and assign a role.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@company.com"
          />
          <Select label="Role" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
            <option value="">Select role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {formatRoleLabel(role.key, role.name)}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void sendInviteFromForm()} disabled={inviteLoading || !inviteEmail.trim()}>
            {inviteLoading ? 'Sending...' : 'Send invite'}
          </Button>
          {inviteLink && (
            <Button variant="secondary" onClick={() => void copyInviteLink()} disabled={inviteLoading}>
              Copy invite link
            </Button>
          )}
        </div>

        {inviteSuccess && (
          <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            {inviteSuccess}
          </div>
        )}
        {inviteError && (
          <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {inviteError}
          </div>
        )}

        {inviteLink && (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-section/10 p-3 text-xs text-text-tertiary">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{inviteLink}</span>
              <button
                className="text-xs text-text-secondary hover:text-text-primary"
                onClick={() => void copyInviteLink()}
              >
                Copy
              </button>
            </div>
          </div>
        )}
        </div>

        <div className="border-t border-border-subtle pt-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Members</h3>
            <p className="text-xs text-text-tertiary mt-1">Account status and activity across the team.</p>
          </div>
        </div>
        {renderMembers()}
        </div>

        <div className="border-t border-border-subtle pt-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Pending invites</h3>
            <p className="text-xs text-text-tertiary mt-1">Active invitations and expiry tracking.</p>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-text-tertiary">Loading invites...</p>
        ) : pendingInvites.length === 0 ? (
          <p className="text-sm text-text-tertiary">No pending invites.</p>
        ) : (
          <div className="space-y-2">
            {pendingInvites.map((invite) => {
              const expired = isInviteExpired(invite);
              return (
                <div
                  key={invite.id}
                  className="rounded-md border border-border-subtle bg-bg-section/20 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{invite.email}</p>
                      <p className="text-xs text-text-tertiary">
                        {formatRoleLabel(invite.roleKey, invite.roleName)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={expired ? 'expired' : invite.status} />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void sendInvite({ inviteId: invite.id })}
                        disabled={inviteLoading}
                      >
                        {inviteLoading ? 'Working...' : 'Resend link'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-text-tertiary">
                    Created {formatDate(invite.createdAt)} - Expires {formatDate(invite.expiresAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

      </div>
    </CollapsibleSection>
  );
}
