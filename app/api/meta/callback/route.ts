import { createSupabaseServer } from '@/lib/supabase-server';
import { exchangeCodeForToken } from '@/lib/meta-oauth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // user_id
  const oauthError = searchParams.get('error');

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);

    const { error: dbError } = await supabase
      .from('meta_connections')
      .upsert(
        { user_id: user.id, access_token: accessToken, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (dbError) {
      console.error('Error guardando meta_connection:', dbError.message);
      return NextResponse.redirect(`${origin}/dashboard?meta=error`);
    }

    return NextResponse.redirect(`${origin}/dashboard?meta=connected`);
  } catch (err) {
    console.error('Error en Meta callback:', err);
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }
}
