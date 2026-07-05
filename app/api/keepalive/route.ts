import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// Keepalive público para monitores externos (UptimeRobot).
//
// Supabase (free tier) pausa el proyecto tras ~7 días de inactividad de la BASE
// de datos, no del sitio web. Por eso este endpoint hace una consulta mínima
// REAL a la DB en cada request: eso es lo que cuenta como actividad y evita la
// pausa. Un endpoint que solo devuelve "ok" sin tocar la base NO serviría.
//
// Es público a propósito: UptimeRobot pega un GET sin credenciales. No expone
// datos (solo devuelve { ok, timestamp }); la consulta es un SELECT id LIMIT 1.
//
// force-dynamic evita que Next cachee la respuesta. Si se cacheara, UptimeRobot
// recibiría una respuesta guardada y la DB nunca se tocaría → el keepalive no
// cumpliría su función.
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.from('clients').select('id').limit(1);

  if (error) {
    console.error('[keepalive] Consulta a Supabase falló:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
