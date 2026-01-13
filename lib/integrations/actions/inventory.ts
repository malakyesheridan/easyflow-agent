type InventoryActionContext = {
  orgId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  integrationId: string;
  provider: string;
  credentials: Record<string, string>;
  idempotencyKey: string;
};

type InventoryResponse = { ok: boolean; error?: string; response?: unknown };

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeMaterials(value: unknown): Array<{ materialId: string; quantity?: number | null }> {
  if (!Array.isArray(value)) return [];
  const materials: Array<{ materialId: string; quantity?: number | null }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const materialId = typeof record.materialId === 'string' ? record.materialId : '';
    if (!materialId) continue;
    const quantity = typeof record.quantity === 'number' && Number.isFinite(record.quantity) ? record.quantity : null;
    materials.push({ materialId, quantity });
  }
  return materials;
}

export async function runInventoryAction(ctx: InventoryActionContext): Promise<InventoryResponse> {
  const eventPayload = (ctx.payload.event ?? ctx.payload) as Record<string, unknown>;
  const actionParams = (ctx.payload.action ?? {}) as Record<string, unknown>;

  const jobId = typeof eventPayload.jobId === 'string' ? eventPayload.jobId : undefined;
  const materialId = typeof eventPayload.materialId === 'string' ? eventPayload.materialId : undefined;
  const materialsFromAction = normalizeMaterials(actionParams.materials);
  const materialsFromEvent = normalizeMaterials(eventPayload.materials);
  const materialsFromAllocations = normalizeMaterials(eventPayload.materialAllocations);
  const materials =
    materialsFromAction.length > 0
      ? materialsFromAction
      : materialsFromEvent.length > 0
        ? materialsFromEvent
        : materialsFromAllocations;

  const apiKey = ctx.credentials.api_key || ctx.credentials.apiKey || '';
  const baseUrlRaw = ctx.credentials.base_url || ctx.credentials.baseUrl || '';
  const baseUrl = baseUrlRaw ? cleanBaseUrl(baseUrlRaw) : '';

  const payload = {
    eventType: ctx.eventType,
    actionType: ctx.actionType,
    idempotencyKey: ctx.idempotencyKey,
    orgId: ctx.orgId,
    jobId,
    materialId,
    materials,
    occurredAt: new Date().toISOString(),
  };

  if (!baseUrl) {
    return { ok: true, response: { simulated: true, payload } };
  }

  const endpointMap: Record<string, string | undefined> = {
    'inventory.reserve_stock': ctx.credentials.reserve_endpoint || ctx.credentials.reservePath,
    'inventory.deduct_stock': ctx.credentials.deduct_endpoint || ctx.credentials.deductPath,
    'inventory.sync_levels': ctx.credentials.sync_endpoint || ctx.credentials.syncPath,
  };

  const fallbackPath =
    ctx.actionType === 'inventory.reserve_stock'
      ? '/reserve'
      : ctx.actionType === 'inventory.deduct_stock'
        ? '/deduct'
        : '/sync';

  const endpoint = endpointMap[ctx.actionType] || `${baseUrl}${fallbackPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-TGW-Idempotency': ctx.idempotencyKey,
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `Inventory request failed (${res.status})`,
      response: { status: res.status, body: text.slice(0, 500) },
    };
  }

  return { ok: true, response: { status: res.status, body: text.slice(0, 500) } };
}
