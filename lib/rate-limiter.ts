import { createClient } from '@supabase/supabase-js';

const LIMITS = {
  meta:   { calls: 20, windowSeconds: 60 },
  google: { calls: 15, windowSeconds: 60 },
} as const;

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Returns null if under limit, or a user-facing error message if limit exceeded.
 * Never throws — a rate limiter failure must not block the main flow.
 */
export async function checkRateLimit(
  organizationId: string,
  platform: keyof typeof LIMITS,
): Promise<string | null> {
  try {
    const { calls, windowSeconds } = LIMITS[platform];
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count } = await adminClient
      .from('api_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('platform', platform)
      .gte('created_at', windowStart);

    if ((count ?? 0) >= calls) {
      const platformName = platform === 'meta' ? 'Meta Ads' : 'Google';
      return `Límite de ${calls} consultas por minuto a ${platformName} alcanzado. Esperá unos segundos antes de consultar nuevamente. Esto es parte del sistema de protección de cuenta para evitar patrones que puedan generar alertas en las plataformas.`;
    }

    return null;
  } catch {
    return null;
  }
}
