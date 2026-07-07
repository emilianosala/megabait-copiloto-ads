import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getClientForUser } from '@/lib/organizations';
import { NextResponse } from 'next/server';

// Campos que el usuario puede modificar. NUNCA incluir organization_id ni id:
// pasar el body crudo a .update() permitiría mover el cliente a otra org.
const EDITABLE_FIELDS = [
  'name', 'industry', 'description', 'objectives', 'budget', 'kpis',
  'restrictions', 'google_ads_account_id', 'meta_ads_account_id',
  'logo_url', 'google_analytics_property_id',
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const client = await getClientForUser(admin, user.id, clientId);
  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  const client = await getClientForUser(admin, user.id, clientId, 'id');
  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const body = await request.json();
  const update: Record<string, any> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const { data, error } = await admin
    .from('clients')
    .update(update)
    .eq('id', clientId)
    .select()
    .single();

  if (error) {
    // Registrar el error completo de Postgres para no quedar a ciegas en Vercel.
    console.error('[clients PATCH] error al actualizar cliente', clientId, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      campos: Object.keys(update),
    });
    return NextResponse.json(
      { error: error.message, details: error.details, hint: error.hint, code: error.code },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  const client = await getClientForUser(admin, user.id, clientId, 'id');
  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const { error } = await admin.from('clients').delete().eq('id', clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
