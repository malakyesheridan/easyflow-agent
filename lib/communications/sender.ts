type SenderIdentity = {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  usingDefaults: boolean;
  warnings: string[];
};

export function getAllowedFromDomains(): string[] {
  const raw = process.env.COMM_ALLOWED_FROM_DOMAINS ?? '';
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getDefaultSenderIdentity(): { fromName: string | null; fromEmail: string | null; replyTo: string | null } {
  const fromName = process.env.COMM_DEFAULT_FROM_NAME?.trim() || null;
  const fromEmail = process.env.COMM_DEFAULT_FROM_EMAIL?.trim() || null;
  const replyTo = process.env.COMM_DEFAULT_REPLY_TO?.trim() || null;
  return { fromName, fromEmail, replyTo };
}

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isAllowedFromEmail(email: string | null | undefined, allowedDomains: string[]): boolean {
  if (!email) return false;
  if (allowedDomains.length === 0) return true;
  const domain = String(email).split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return false;
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export function parseAdditionalEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => isValidEmail(value))
    .map((value) => value.toLowerCase());
}

export function resolveSenderIdentity(params: {
  orgName?: string | null;
  commFromName?: string | null;
  commFromEmail?: string | null;
  commReplyToEmail?: string | null;
}): SenderIdentity {
  const defaults = getDefaultSenderIdentity();
  const allowedDomains = getAllowedFromDomains();
  const warnings: string[] = [];

  const orgFromEmail = params.commFromEmail?.trim() || null;
  const orgFromName = params.commFromName?.trim() || null;
  const orgReplyTo = params.commReplyToEmail?.trim() || null;

  let fromEmail = orgFromEmail;
  let fromName = orgFromName;
  let replyTo = orgReplyTo ?? defaults.replyTo ?? null;
  let usingDefaults = false;

  if (fromEmail && !isAllowedFromEmail(fromEmail, allowedDomains)) {
    warnings.push('from_email_domain_not_allowed');
    fromEmail = null;
  }

  if (!fromEmail) {
    fromEmail = defaults.fromEmail ?? null;
    usingDefaults = true;
    if (fromEmail && !isAllowedFromEmail(fromEmail, allowedDomains)) {
      warnings.push('default_from_email_domain_not_allowed');
      fromEmail = null;
    }
  }

  if (!fromName) {
    fromName = defaults.fromName ?? null;
    if (fromName) usingDefaults = true;
  }

  if (!fromEmail) {
    warnings.push('from_email_missing');
  }

  return { fromName, fromEmail, replyTo, usingDefaults, warnings };
}
