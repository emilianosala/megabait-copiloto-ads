import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from('reports')
    .select('id, title, initial_since, initial_until, sources, sections, created_at, client_id')
    .eq('id', reportId)
    .eq('is_public', true)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  const { data: client } = await admin
    .from('clients')
    .select('name, industry')
    .eq('id', data.client_id)
    .single();

  return NextResponse.json({ ...data, client });
}
