import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !clientId) {
    return NextResponse.json({ connected: false });
  }

  const { data } = await supabase
    .from('meta_connections')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  return NextResponse.json({ connected: !!data });
}
