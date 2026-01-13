export function shouldSkipStripePaymentUpdate(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'succeeded';
}
