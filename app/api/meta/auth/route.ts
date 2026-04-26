import { createSupabaseServer } from '@/lib/supabase-server';
import { getMetaAuthUrl } from '@/lib/meta-oauth';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = getMetaAuthUrl(user.id);
  return NextResponse.redirect(url);
}
