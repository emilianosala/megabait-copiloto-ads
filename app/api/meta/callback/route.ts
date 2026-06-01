import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForToken } from '@/lib/meta-oauth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId:clientId
  const oauthError = searchParams.get('error');

  if (oauthError || !code || !state) {
    console.error('[meta/callback] early fail — oauthError:', oauthError, 'code:', !!code, 'state:', !!state);
    return NextResponse.redirect(`${origin}/dashboard?meta=error&r=early`);
  }

  // state = userId + clientId (dos UUIDs de 36 chars, sin separador)
  console.error('[meta/callback] state length:', state.length, 'state:', state);
  if (state.length !== 72) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error&r=state${state.length}`);
  }
  const userId = state.slice(0, 36);
  const clientId = state.slice(36);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  console.error('[meta/callback] user:', user?.id, 'userId from state:', userId);
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error&r=auth`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);

    const admin = createSupabaseAdmin();
    const { error: dbError } = await admin
      .from('meta_connections')
      .upsert(
        { client_id: clientId, connected_by: user.id, access_token: accessToken },
        { onConflict: 'client_id' },
      );

    if (dbError) {
      console.error('Error guardando meta_connection:', dbError.message, dbError.code);
      return NextResponse.redirect(`${origin}/dashboard?meta=error&r=db&e=${encodeURIComponent(dbError.code ?? dbError.message.slice(0, 40))}`);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=connected`);
  } catch (err) {
    console.error('Error en Meta callback:', err);
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error`);
  }
}
