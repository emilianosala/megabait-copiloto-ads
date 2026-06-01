import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserOrgId } from '@/lib/organizations';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const admin = createSupabaseAdmin();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([]);

  const orgId = await getUserOrgId(admin, user.id);
  if (!orgId) return NextResponse.json([]);

  const { data, error } = await admin
    .from('clients')
    .select('id, name, industry')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const orgId = await getUserOrgId(supabase, user.id);
  if (!orgId) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 500 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from('clients')
    .insert([{
      organization_id: orgId,
      name: body.name,
      industry: body.industry,
      description: body.description,
      objectives: body.objectives,
      budget: body.budget,
      kpis: body.kpis,
      restrictions: body.restrictions,
    }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
