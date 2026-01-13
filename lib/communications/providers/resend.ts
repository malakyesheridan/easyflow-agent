type ResendSendParams = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
};

type ResendSendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function sendResendEmail(params: ResendSendParams): Promise<ResendSendResult> {
  if (!params.apiKey) return { ok: false, error: 'Missing RESEND_API_KEY' };
  if (!params.from) return { ok: false, error: 'Missing from email' };
  if (!params.to) return { ok: false, error: 'Missing recipient email' };

  const payload: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  };
  if (params.text) payload.text = params.text;
  if (params.replyTo) payload.reply_to = params.replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const error = json?.message ? String(json.message) : `Resend request failed (${res.status})`;
    return { ok: false, error };
  }

  const messageId = json?.id ? String(json.id) : null;
  return { ok: true, messageId };
}
