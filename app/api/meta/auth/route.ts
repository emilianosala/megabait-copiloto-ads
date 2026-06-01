import { createSupabaseServer } from '@/lib/supabase-server';
import { getMetaAuthUrl } from '@/lib/meta-oauth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // state = userId:clientId — se verifica en el callback (anti-CSRF)
  const url = getMetaAuthUrl(`${user.id}:${clientId}`);
  return NextResponse.redirect(url);
}
