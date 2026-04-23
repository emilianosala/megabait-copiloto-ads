import { createSupabaseServer } from '@/lib/supabase-server';
import { createOAuthClient } from '@/lib/google-oauth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  const oauthClient = createOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.refresh_token) {
    // Puede ocurrir si el usuario ya autorizó antes y Google no emite un nuevo
    // refresh_token. El prompt: 'consent' en /auth debería prevenirlo.
    return NextResponse.redirect(`${origin}/dashboard?google=no_refresh_token`);
  }

  const { error } = await supabase
    .from('google_connections')
    .upsert(
      { user_id: user.id, refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('Error guardando google_connection:', error.message);
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  return NextResponse.redirect(`${origin}/dashboard?google=connected`);
}
