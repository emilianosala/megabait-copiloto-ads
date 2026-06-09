import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
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

function parseAmount(value: string): number {
  const stripped = value.replace(/[^0-9.,\-]/g, '');
  if (!stripped) return NaN;
  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  // Si la coma aparece después del punto, es el separador decimal (formato europeo)
  const normalized = lastComma > lastDot
    ? stripped.replace(/\./g, '').replace(',', '.')
    : stripped.replace(/,/g, '');
  return parseFloat(normalized);
}

function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

// ── GET: resumen de datos existentes ─────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('sales_data')
    .select('date, amount, currency')
    .eq('client_id', clientId)
    .order('date');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json(null);

  const totalByCurrency: Record<string, number> = {};
  for (const row of data) {
    totalByCurrency[row.currency] = (totalByCurrency[row.currency] || 0) + parseFloat(row.amount);
  }

  return NextResponse.json({
    rowCount: data.length,
    dateRange: { min: data[0].date, max: data[data.length - 1].date },
    totalByCurrency,
  });
}

// ── POST: guardar CSV con mapping ─────────────────────────────────────────────

interface Mapping {
  date: string;
  amount: string;
  product?: string;
  currencyMode: 'fixed' | 'column';
  currencyFixed: string;
  currencyColumn?: string;
  note?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: client } = await admin
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .single();

  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const { csvText, mapping }: { csvText: string; mapping: Mapping } = await request.json();

  const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim());
  const headers = parseCSVLine(lines[0]);
  const colIdx = (name: string) => headers.indexOf(name);

  const dateIdx = colIdx(mapping.date);
  const amountIdx = colIdx(mapping.amount);
  const productIdx = mapping.product ? colIdx(mapping.product) : -1;
  const currencyIdx =
    mapping.currencyMode === 'column' && mapping.currencyColumn
      ? colIdx(mapping.currencyColumn)
      : -1;

  if (dateIdx < 0 || amountIdx < 0) {
    return NextResponse.json({ error: 'Columnas de fecha o monto no encontradas' }, { status: 400 });
  }

  const rows: object[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const fields = parseCSVLine(line);
    const dateStr = parseDate(fields[dateIdx] ?? '');
    const amount = parseAmount(fields[amountIdx] ?? '');

    if (!dateStr || isNaN(amount) || amount === 0) { skipped++; continue; }

    rows.push({
      client_id: clientId,
      organization_id: client.organization_id,
      date: dateStr,
      amount,
      currency:
        currencyIdx >= 0
          ? (fields[currencyIdx]?.trim() || mapping.currencyFixed)
          : mapping.currencyFixed,
      product: productIdx >= 0 ? (fields[productIdx]?.trim() || null) : null,
      source: 'csv',
      upload_note: mapping.note?.trim() || null,
    });
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'No se pudieron parsear filas válidas. Verificá el mapping de columnas.' }, { status: 400 });
  }

  const { error: insertError } = await admin.from('sales_data').insert(rows);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ inserted: rows.length, skipped });
}
