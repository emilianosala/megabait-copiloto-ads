import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdAccounts } from '@/lib/meta-ads';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from('meta_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: 'Meta Ads no conectado' }, { status: 400 });
  }

  try {
    const accounts = await getAdAccounts(connection.access_token);
    return NextResponse.json(accounts);
  } catch (err: any) {
    console.error('[meta/accounts] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
