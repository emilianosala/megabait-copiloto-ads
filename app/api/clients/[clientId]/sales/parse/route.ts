import { createSupabaseServer } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { csvText } = await request.json();
  if (!csvText?.trim()) return NextResponse.json({ error: 'CSV vacío' }, { status: 400 });

  const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'El CSV necesita al menos una fila de encabezados y una de datos' },
      { status: 400 },
    );
  }

  const headers = parseCSVLine(lines[0]);
  const preview = lines.slice(1, 6).map((l: string) => parseCSVLine(l));

  return NextResponse.json({ headers, preview });
}
