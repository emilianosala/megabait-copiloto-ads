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
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  // state = userId + clientId (dos UUIDs de 36 chars, sin separador)
  if (state.length !== 72) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }
  const userId = state.slice(0, 36);
  const clientId = state.slice(36);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error`);
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
      console.error('Error guardando meta_connection:', dbError.message);
      return NextResponse.redirect(`${origin}/dashboard?meta=error`);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=connected`);
  } catch (err) {
    console.error('Error en Meta callback:', err);
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error`);
  }
}
