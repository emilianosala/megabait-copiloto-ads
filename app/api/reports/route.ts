import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getClientForUser } from '@/lib/organizations';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { clientId, title, since, until, sources, sections } = await request.json();

  const admin = createSupabaseAdmin();
  const client = await getClientForUser(admin, user.id, clientId, 'organization_id');
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const { data, error } = await admin.from('reports').insert({
    client_id: clientId,
    organization_id: client.organization_id,
    created_by: user.id,
    title,
    initial_since: since,
    initial_until: until,
    sources,
    sections,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
