import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getAccountInsights, getCampaigns } from '@/lib/meta-ads';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  const until = searchParams.get('until');

  if (!since || !until) {
    return NextResponse.json({ error: 'since y until son requeridos' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: report } = await admin
    .from('reports')
    .select('client_id, sources')
    .eq('id', reportId)
    .eq('is_public', true)
    .single();

  if (!report) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  const { data: client } = await admin
    .from('clients')
    .select('meta_ads_account_id')
    .eq('id', report.client_id)
    .single();

  const result: Record<string, unknown> = {};

  // ── Meta Ads ────────────────────────────────────────────────────────────────
  if (report.sources.includes('meta') && client?.meta_ads_account_id) {
    const { data: conn } = await admin
      .from('meta_connections')
      .select('access_token')
      .eq('client_id', report.client_id)
      .maybeSingle();

    if (conn) {
      const timeRange = { since, until };
      try {
        const [account, campaigns] = await Promise.all([
          getAccountInsights(
            conn.access_token,
            client.meta_ads_account_id,
            'impressions,clicks,spend,ctr,cpc,reach,actions',
            '',
            timeRange,
          ),
          getCampaigns(
            conn.access_token,
            client.meta_ads_account_id,
            'impressions,clicks,spend,ctr,cpc',
            '',
            timeRange,
          ),
        ]);

        const conversions =
          account?.actions
            ?.filter((a: any) =>
              a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
              a.action_type === 'purchase',
            )
            ?.reduce((acc: number, a: any) => acc + parseFloat(a.value), 0) ?? 0;

        result.meta = {
          account: account
            ? {
                spend: parseFloat(account.spend ?? '0'),
                impressions: parseInt(account.impressions ?? '0'),
                clicks: parseInt(account.clicks ?? '0'),
                reach: parseInt(account.reach ?? '0'),
                ctr: parseFloat(account.ctr ?? '0'),
                cpc: parseFloat(account.cpc ?? '0'),
                conversions,
              }
            : null,
          campaigns: campaigns.map((c: any) => ({
            name: c.name,
            status: c.status,
            objective: c.objective,
            spend: parseFloat(c.insights?.data?.[0]?.spend ?? '0'),
            impressions: parseInt(c.insights?.data?.[0]?.impressions ?? '0'),
            clicks: parseInt(c.insights?.data?.[0]?.clicks ?? '0'),
            ctr: parseFloat(c.insights?.data?.[0]?.ctr ?? '0'),
            cpc: parseFloat(c.insights?.data?.[0]?.cpc ?? '0'),
          })),
        };
      } catch {
        result.meta = null;
      }
    }
  }

  // ── Ventas reales ────────────────────────────────────────────────────────────
  if (report.sources.includes('sales')) {
    const { data: sales } = await admin
      .from('sales_data')
      .select('date, amount, currency')
      .eq('client_id', report.client_id)
      .gte('date', since)
      .lte('date', until)
      .order('date');

    if (sales && sales.length > 0) {
      const total = sales.reduce((acc, r) => acc + parseFloat(r.amount), 0);
      const currency = sales[0].currency;

      // Agrupación por día
      const byDay: Record<string, number> = {};
      for (const row of sales) {
        byDay[row.date] = (byDay[row.date] || 0) + parseFloat(row.amount);
      }

      // Agrupación por semana
      const byWeek: Record<string, number> = {};
      for (const row of sales) {
        const d = new Date(row.date + 'T00:00:00');
        const ws = new Date(d);
        ws.setDate(d.getDate() - d.getDay());
        const key = ws.toISOString().split('T')[0];
        byWeek[key] = (byWeek[key] || 0) + parseFloat(row.amount);
      }

      result.sales = {
        total: parseFloat(total.toFixed(2)),
        count: sales.length,
        currency,
        avg_ticket: parseFloat((total / sales.length).toFixed(2)),
        by_day: Object.entries(byDay).map(([date, amount]) => ({ date, amount })),
        by_week: Object.entries(byWeek).map(([week, amount]) => ({ week, amount })),
      };
    } else {
      result.sales = null;
    }
  }

  return NextResponse.json(result);
}
