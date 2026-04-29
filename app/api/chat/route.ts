import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createGoogleAdsClient } from '@/lib/google-ads';
import { getAccountInsights, getCampaigns } from '@/lib/meta-ads';
import { NextResponse } from 'next/server';

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

// ── Meta Ads Tool Use ─────────────────────────────────────────────────────────

const DATE_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'last_year',
  'this_month',
  'this_quarter',
  'this_year',
] as const;

const META_ADS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_meta_account_insights',
    description: `Obtiene métricas agregadas de una cuenta de Meta Ads para un período específico.
Usá esta tool cuando el analista pida métricas generales, resúmenes de rendimiento, o comparaciones entre períodos.
Períodos disponibles en date_preset: today, yesterday, last_7d, last_14d, last_30d, last_90d, last_year, this_month, this_quarter, this_year.
Para comparar dos períodos, llamá la tool dos veces con distintos date_preset.
Si el analista pide un rango de fechas específico (ej: "del 1 al 15 de abril"), usá since y until en formato YYYY-MM-DD en lugar de date_preset.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        date_preset: {
          type: 'string',
          description: 'Período predefinido. Ignorar si se usan since/until.',
          enum: DATE_PRESETS,
        },
        since: {
          type: 'string',
          description: 'Fecha de inicio en formato YYYY-MM-DD. Usar junto con until.',
        },
        until: {
          type: 'string',
          description: 'Fecha de fin en formato YYYY-MM-DD. Usar junto con since.',
        },
      },
    },
  },
  {
    name: 'get_meta_campaigns',
    description: `Obtiene la lista de campañas de Meta Ads con sus métricas individuales para un período específico.
Usá esta tool cuando el analista quiera comparar campañas entre sí, analizar una campaña específica, o entender qué campañas están activas/pausadas.
Incluye campañas activas y pausadas. Períodos disponibles igual que get_meta_account_insights.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        date_preset: {
          type: 'string',
          description: 'Período predefinido.',
          enum: DATE_PRESETS,
        },
        since: {
          type: 'string',
          description: 'Fecha de inicio en formato YYYY-MM-DD.',
        },
        until: {
          type: 'string',
          description: 'Fecha de fin en formato YYYY-MM-DD.',
        },
      },
    },
  },
];

async function executeMetaTool(
  toolName: string,
  toolInput: Record<string, string>,
  adAccountId: string,
  accessToken: string,
): Promise<string> {
  const timeRange =
    toolInput.since && toolInput.until
      ? { since: toolInput.since, until: toolInput.until }
      : undefined;
  const datePreset = toolInput.date_preset || 'last_30d';

  if (toolName === 'get_meta_account_insights') {
    const insights = await getAccountInsights(
      accessToken,
      adAccountId,
      'impressions,clicks,spend,ctr,cpc,reach,actions',
      datePreset,
      timeRange,
    );

    if (!insights) return 'No hay datos disponibles para el período seleccionado.';

    const conversions =
      insights.actions
        ?.filter(
          (a) =>
            a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
            a.action_type === 'purchase',
        )
        ?.reduce((acc, a) => acc + parseFloat(a.value), 0) ?? 0;

    return JSON.stringify({
      periodo: timeRange ? `${toolInput.since} al ${toolInput.until}` : datePreset,
      impresiones: parseInt(insights.impressions),
      alcance: parseInt(insights.reach),
      clics: parseInt(insights.clicks),
      gasto_usd: parseFloat(insights.spend).toFixed(2),
      ctr_porcentaje: parseFloat(insights.ctr).toFixed(2),
      cpc_usd: parseFloat(insights.cpc).toFixed(2),
      conversiones_compras: conversions.toFixed(0),
    });
  }

  if (toolName === 'get_meta_campaigns') {
    const campaigns = await getCampaigns(
      accessToken,
      adAccountId,
      'impressions,clicks,spend,ctr,cpc',
      datePreset,
      timeRange,
    );

    if (!campaigns.length) return 'No hay campañas disponibles para el período seleccionado.';

    const result = campaigns.map((c) => ({
      nombre: c.name,
      estado: c.status,
      objetivo: c.objective,
      impresiones: parseInt(c.insights?.data?.[0]?.impressions ?? '0'),
      clics: parseInt(c.insights?.data?.[0]?.clicks ?? '0'),
      gasto_usd: parseFloat(c.insights?.data?.[0]?.spend ?? '0').toFixed(2),
      ctr: parseFloat(c.insights?.data?.[0]?.ctr ?? '0').toFixed(2),
    }));

    return JSON.stringify(result);
  }

  return 'Tool no reconocida.';
}

// ── Handler principal ─────────────────────────────────────────────────────────

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

  // Google Ads: sigue inyectando en el system prompt (Developer Token pendiente)
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

  // Meta Ads: obtener token para pasarlo a las tools (no pre-calculamos métricas)
  let metaAccessToken: string | null = null;
  if (client.meta_ads_account_id) {
    const { data: metaConnection } = await supabase
      .from('meta_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (metaConnection) {
      metaAccessToken = metaConnection.access_token;
    }
  }

  const hasMetaAds = !!(client.meta_ads_account_id && metaAccessToken);

  const systemMessage = `Sos el Agente Senior de Megabait, el 'Segundo Analista' de Emiliano Sala. Tu personalidad es profesional, extremadamente analítica y con un toque de ingenio rosarino.

CONTEXTO DEL CLIENTE ACTUAL:
- Nombre: ${client.name}
- Industria: ${client.industry}
- Descripción: ${client.description}
- Objetivos: ${client.objectives}
- Presupuesto: ${client.budget}
- KPIs prioritarios: ${client.kpis}
- Restricciones: ${client.restrictions}${metricsBlock}
${hasMetaAds ? '\nEste cliente tiene Meta Ads conectado. Podés consultar métricas y campañas usando las tools disponibles. Cuando el analista pida datos de Meta, usá las tools en lugar de pedir que te los compartan manualmente.' : ''}
Tu función es ayudar a gestionar campañas de pauta considerando siempre el contexto específico de este cliente. Sos experto en Meta, Google Ads y Analytics. Respondé en español, de forma profesional pero accesible.`;

  // Ciclo de Tool Use
  // Necesario porque Claude puede encadenar múltiples tool calls
  // (ej: consulta last_7d y luego last_30d para comparar).
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const tools = hasMetaAds ? META_ADS_TOOLS : [];
  let assistantMessage = '';
  let continueLoop = true;

  while (continueLoop) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemMessage,
      messages,
      ...(tools.length > 0 && { tools, tool_choice: { type: 'auto' } }),
    });

    if (response.stop_reason === 'tool_use') {
      // Claude quiere usar una o más tools — ejecutar y devolver los resultados
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeMetaTool(
            block.name,
            block.input as Record<string, string>,
            client.meta_ads_account_id,
            metaAccessToken!,
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
      // Volver al inicio del loop para que Claude procese los resultados
    } else {
      // stop_reason === 'end_turn': Claude terminó de responder
      assistantMessage = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      continueLoop = false;
    }
  }

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
