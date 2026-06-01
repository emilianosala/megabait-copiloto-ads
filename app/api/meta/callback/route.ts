import { createSupabaseServer } from '@/lib/supabase-server';
import { exchangeCodeForToken } from '@/lib/meta-oauth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId:clientId
  const oauthError = searchParams.get('error');

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  const [userId, clientId] = state.split(':');
  if (!userId || !clientId) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);

    const { error: dbError } = await supabase
      .from('meta_connections')
      .upsert(
        { client_id: clientId, connected_by: user.id, access_token: accessToken },
        { onConflict: 'client_id' },
      );

    if (dbError) {
      console.error('Error guardando meta_connection:', dbError.message);
      return NextResponse.redirect(`${origin}/dashboard?meta=error`);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=connected`);
  } catch (err) {
    console.error('Error en Meta callback:', err);
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error`);
  }
}
