import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getAdAccounts } from '@/lib/meta-ads';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: connection } = await admin
    .from('meta_connections')
    .select('access_token')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: 'Meta Ads no conectado para este cliente' }, { status: 400 });
  }

  try {
    const accounts = await getAdAccounts(connection.access_token);
    return NextResponse.json(accounts);
  } catch (err: any) {
    console.error('[meta/accounts] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
