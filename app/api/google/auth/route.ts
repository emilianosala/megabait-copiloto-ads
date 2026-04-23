import { createSupabaseServer } from '@/lib/supabase-server';
import { createOAuthClient, GOOGLE_ADS_SCOPES } from '@/lib/google-oauth';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const client = createOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_ADS_SCOPES,
    // prompt: 'consent' fuerza que Google devuelva siempre un refresh_token,
    // incluso si el usuario ya autorizó la app antes.
    prompt: 'consent',
    state: user.id,
  });

  return NextResponse.redirect(url);
}
