export type SmsStubResult = {
  status: 'suppressed';
  reason: string;
};

export async function sendSmsStub(): Promise<SmsStubResult> {
  return { status: 'suppressed', reason: 'sms_provider_not_configured' };
}
