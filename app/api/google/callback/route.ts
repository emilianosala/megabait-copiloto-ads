import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getClientForUser } from '@/lib/organizations';
import { createOAuthClient } from '@/lib/google-oauth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId:clientId
  const oauthError = searchParams.get('error');

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  // state = userId + clientId (dos UUIDs de 36 chars, sin separador)
  if (state.length !== 72) {
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }
  const userId = state.slice(0, 36);
  const clientId = state.slice(36);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?google=error`);
  }

  const admin = createSupabaseAdmin();

  // El cliente al que se quiere colgar la conexión tiene que ser de la org del usuario.
  if (!(await getClientForUser(admin, user.id, clientId, 'id'))) {
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  const oauthClient = createOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.refresh_token) {
    // Puede ocurrir si el usuario ya autorizó antes y Google no emite un nuevo
    // refresh_token. El prompt: 'consent' en /auth debería prevenirlo.
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?google=no_refresh_token`);
  }

  const { error } = await admin
    .from('google_connections')
    .upsert(
      { client_id: clientId, connected_by: user.id, refresh_token: tokens.refresh_token },
      { onConflict: 'client_id' },
    );

  if (error) {
    console.error('Error guardando google_connection:', error.message);
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?google=error`);
  }

  return NextResponse.redirect(`${origin}/clients/${clientId}/edit?google=connected`);
}
