import { anthropic } from '@/lib/anthropic';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createGoogleAdsClient } from '@/lib/google-ads';
import { NextResponse } from 'next/server';
import { getAccountInsights } from '@/lib/meta-ads';

interface MetricRow {
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
  };
}

async function fetchGoogleAdsMetrics(
  accountId: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const googleAds = createGoogleAdsClient();
    const customer = googleAds.Customer({
      customer_id: accountId,
      refresh_token: refreshToken,
    });

    // Sin seleccionar segments.date, Google Ads agrega las métricas por campaña
    // para todo el período indicado en el WHERE → una fila por campaña.
    const rows = await customer.query<MetricRow[]>(`
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status != 'REMOVED'
    `);

    if (!rows.length) return null;

    const totals = rows.reduce(
      (
        acc: {
          impressions: number;
          clicks: number;
          cost: number;
          conversions: number;
        },
        row: MetricRow,
      ) => ({
        impressions: acc.impressions + (row.metrics.impressions ?? 0),
        clicks: acc.clicks + (row.metrics.clicks ?? 0),
        cost: acc.cost + (row.metrics.cost_micros ?? 0) / 1_000_000,
        conversions: acc.conversions + (row.metrics.conversions ?? 0),
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
    );

    const ctr =
      totals.impressions > 0
        ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
        : '0.00';
    const cpc =
      totals.clicks > 0 ? (totals.cost / totals.clicks).toFixed(2) : '0.00';

    return `MÉTRICAS REALES DE GOOGLE ADS (últimos 30 días):
- Impresiones: ${totals.impressions.toLocaleString('es-AR')}
- Clics: ${totals.clicks.toLocaleString('es-AR')}
- Costo total: $${totals.cost.toFixed(2)}
- Conversiones: ${totals.conversions.toFixed(1)}
- CTR: ${ctr}%
- CPC promedio: $${cpc}`;
  } catch (err) {
    console.error('[Google Ads] Error al obtener métricas:', err);
    return null;
  }
}

async function fetchMetaAdsMetrics(
  adAccountId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const insights = await getAccountInsights(
      accessToken,
      adAccountId,
      'impressions,clicks,spend,ctr,cpc,reach,actions',
      'last_30d',
    );

    if (!insights) return null;

    const conversions =
      insights.actions
        ?.filter(
          (a) =>
            a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
            a.action_type === 'purchase',
        )
        ?.reduce((acc, a) => acc + parseFloat(a.value), 0) ?? 0;

    return `MÉTRICAS REALES DE META ADS (últimos 30 días):
- Impresiones: ${parseInt(insights.impressions).toLocaleString('es-AR')}
- Alcance: ${parseInt(insights.reach).toLocaleString('es-AR')}
- Clics: ${parseInt(insights.clicks).toLocaleString('es-AR')}
- Gasto total: $${parseFloat(insights.spend).toFixed(2)}
- CTR: ${parseFloat(insights.ctr).toFixed(2)}%
- CPC promedio: $${parseFloat(insights.cpc).toFixed(2)}
- Conversiones (compras): ${conversions.toFixed(0)}`;
  } catch (err) {
    console.error('[Meta Ads] Error al obtener métricas:', err);
    return null;
  }
}

export async function POST(request: Request) {
  const { clientId, message, history } = await request.json();
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Traer contexto del cliente (RLS garantiza que pertenece al usuario)
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error || !client) {
    return NextResponse.json(
      { error: 'Cliente no encontrado' },
      { status: 404 },
    );
  }

  // Pullear métricas reales si el cliente tiene cuenta de Google Ads vinculada
  let metricsBlock = '';
  if (client.google_ads_account_id) {
    const { data: connection } = await supabase
      .from('google_connections')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connection) {
      const metrics = await fetchGoogleAdsMetrics(
        client.google_ads_account_id,
        connection.refresh_token,
      );
      if (metrics) {
        metricsBlock = `\n\n${metrics}\n\nUsá estos datos reales como base para tu análisis.`;
      }
    }
  }

  if (client.meta_ads_account_id) {
    const { data: metaConnection } = await supabase
      .from('meta_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (metaConnection) {
      const metaMetrics = await fetchMetaAdsMetrics(
        client.meta_ads_account_id,
        metaConnection.access_token,
      );
      if (metaMetrics) {
        metricsBlock += `\n\n${metaMetrics}\n\nUsá estos datos reales como base para tu análisis.`;
      }
    }
  }

  const systemMessage = `Sos el Agente Senior de Megabait, el 'Segundo Analista' de Emiliano Sala. Tu personalidad es profesional, extremadamente analítica y con un toque de ingenio rosarino.

CONTEXTO DEL CLIENTE ACTUAL:
- Nombre: ${client.name}
- Industria: ${client.industry}
- Descripción: ${client.description}
- Objetivos: ${client.objectives}
- Presupuesto: ${client.budget}
- KPIs prioritarios: ${client.kpis}
- Restricciones: ${client.restrictions}${metricsBlock}

Tu función es ayudar a gestionar campañas de pauta considerando siempre el contexto específico de este cliente. Sos experto en Meta, Google Ads y Analytics. Respondé en español, de forma profesional pero accesible.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemMessage,
    messages: [...history, { role: 'user', content: message }],
  });

  const assistantMessage =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Guardar mensajes en Supabase
  await supabase.from('conversations').insert([
    { client_id: clientId, user_id: user.id, role: 'user', content: message },
    {
      client_id: clientId,
      user_id: user.id,
      role: 'assistant',
      content: assistantMessage,
    },
  ]);

  return NextResponse.json({ response: assistantMessage });
}
