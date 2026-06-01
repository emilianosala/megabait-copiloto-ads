import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !clientId) {
    return NextResponse.json({ connected: false });
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from('google_connections')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  return NextResponse.json({ connected: !!data });
}
