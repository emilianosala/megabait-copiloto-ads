import { createClient } from '@supabase/supabase-js';

export interface AuditEntry {
  userId: string;
  clientId: string;
  platform: 'meta' | 'google';
  toolName?: string;
  endpoint: string;
  requestParams?: Record<string, unknown>;
  responseOk: boolean;
  responseStatus?: number;
  errorMessage?: string;
  triggeredBy?: 'tool_use' | 'system_prompt' | 'manual';
}

// Service role client — bypasa RLS para inserts desde el servidor.
// Nunca exponer este cliente al browser.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function logApiCall(entry: AuditEntry): Promise<void> {
  try {
    await adminClient.from('api_audit_log').insert({
      user_id: entry.userId,
      client_id: entry.clientId,
      platform: entry.platform,
      tool_name: entry.toolName,
      endpoint: entry.endpoint,
      request_params: entry.requestParams ?? null,
      response_ok: entry.responseOk,
      response_status: entry.responseStatus ?? null,
      error_message: entry.errorMessage ?? null,
      triggered_by: entry.triggeredBy ?? 'tool_use',
    });
  } catch (err) {
    // El log nunca debe romper la funcionalidad principal
    console.error('[AuditLog] Error al registrar llamada a API:', err);
  }
}
