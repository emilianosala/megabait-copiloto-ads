import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getClientForUser } from '@/lib/organizations';
import { exchangeCodeForToken } from '@/lib/meta-oauth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId:clientId
  const oauthError = searchParams.get('error');

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error&r=early`);
  }

  // state = userId + clientId (dos UUIDs de 36 chars, sin separador)
  if (state.length !== 72) {
    return NextResponse.redirect(`${origin}/dashboard?meta=error&r=state${state.length}`);
  }
  const userId = state.slice(0, 36);
  const clientId = state.slice(36);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el state coincide con el usuario autenticado (anti-CSRF)
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${origin}/clients/${clientId}/edit?meta=error&r=auth`);
  }

  try {
    const admin = createSupabaseAdmin();

    // El cliente al que se quiere colgar la conexión tiene que ser de la org del usuario.
    if (!(await getClientForUser(admin, user.id, clientId, 'id'))) {
      return NextResponse.redirect(`${origin}/dashboard?meta=error&r=auth`);
    }

    const accessToken = await exchangeCodeForToken(code);

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
    // El caso más común en el pilot: la app está en modo desarrollo y el usuario
    // no está agregado como tester, o el token no se pudo intercambiar. Antes esto
    // caía en un "Error" mudo; ahora mostramos el mensaje real de Meta para que el
    // analista (y nosotros en los logs) sepamos qué pasó.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Error en Meta callback (intercambio de token):', detail);
    return NextResponse.redirect(
      `${origin}/clients/${clientId}/edit?meta=error&r=token&e=${encodeURIComponent(detail.slice(0, 140))}`,
    );
  }
}
