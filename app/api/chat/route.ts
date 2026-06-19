import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getGoogleCampaigns, getGoogleCampaignDetail } from '@/lib/google-ads';
import { getGA4Metrics, GA4_METRICS, GA4_DIMENSIONS } from '@/lib/google-analytics';
import { getAccountInsights, getCampaigns } from '@/lib/meta-ads';
import { logApiCall } from '@/lib/api-audit';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserOrgId } from '@/lib/organizations';
import { NextResponse } from 'next/server';

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
  userId: string,
  clientId: string,
  organizationId: string,
): Promise<string> {
  const rateLimitError = await checkRateLimit(organizationId, 'meta');
  if (rateLimitError) return JSON.stringify({ error: rateLimitError });

  // Siempre retorna string — nunca propaga excepciones al loop de tool use.
  // Si algo falla, Claude recibe el mensaje de error y puede responderle al usuario.
  try {
    const timeRange =
      toolInput.since && toolInput.until
        ? { since: toolInput.since, until: toolInput.until }
        : undefined;
    const datePreset = toolInput.date_preset || 'last_30d';

    if (toolName === 'get_meta_account_insights') {
      const endpoint = `${adAccountId}/insights`;
      const insights = await getAccountInsights(
        accessToken,
        adAccountId,
        'impressions,clicks,spend,ctr,cpc,reach,actions',
        datePreset,
        timeRange,
      );

      await logApiCall({
        userId,
        clientId,
        organizationId,
        platform: 'meta',
        toolName,
        endpoint,
        requestParams: { datePreset, timeRange: timeRange ?? null },
        responseOk: true,
      });

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
      const endpoint = `${adAccountId}/campaigns`;
      console.log(
        `[Meta Tool] get_meta_campaigns - datePreset: ${datePreset}, timeRange: ${JSON.stringify(timeRange)}`,
      );

      const campaigns = await getCampaigns(
        accessToken,
        adAccountId,
        'impressions,clicks,spend,ctr,cpc',
        datePreset,
        timeRange,
      );

      await logApiCall({
        userId,
        clientId,
        organizationId,
        platform: 'meta',
        toolName,
        endpoint,
        requestParams: { datePreset, timeRange: timeRange ?? null },
        responseOk: true,
      });

      console.log(`[Meta Tool] get_meta_campaigns - ${campaigns.length} campañas recibidas`);

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
  } catch (err: any) {
    console.error(`[Meta Tool] Error en ${toolName}:`, err);
    await logApiCall({
      userId,
      clientId,
      organizationId,
      platform: 'meta',
      toolName,
      endpoint: `${adAccountId}/${toolName === 'get_meta_account_insights' ? 'insights' : 'campaigns'}`,
      requestParams: { datePreset: toolInput.date_preset ?? 'last_30d' },
      responseOk: false,
      errorMessage: err.message || 'Error desconocido al consultar Meta Ads',
    });
    return JSON.stringify({
      error: err.message || 'Error desconocido al consultar Meta Ads',
    });
  }
}

// ── Google Ads Tools ──────────────────────────────────────────────────────────

const GOOGLE_DATE_PRESETS = [
  'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_month', 'last_month', 'this_quarter',
] as const;

const GOOGLE_ADS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_google_campaigns',
    description: `Lista todas las campañas de Google Ads del cliente, incluyendo las pausadas.
Usá esta tool para:
- Revisar qué campañas existen y si están bien configuradas (estrategia de puja, presupuesto, tipo)
- Detectar campañas pausadas que podrían activarse
- Comparar rendimiento entre campañas para un período dado
- Diagnóstico inicial antes de profundizar con get_google_campaign_detail

Retorna por campaña: nombre, estado (ENABLED/PAUSED), tipo de canal, estrategia de puja, presupuesto diario y métricas del período.
Las campañas pausadas van a tener métricas en 0 para el período si estuvieron inactivas.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        date_preset: {
          type: 'string',
          enum: GOOGLE_DATE_PRESETS,
          description: 'Período para las métricas. Default: last_30d.',
        },
        since: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Usar junto con until.' },
        until: { type: 'string', description: 'Fecha fin YYYY-MM-DD. Usar junto con since.' },
      },
    },
  },
  {
    name: 'get_google_campaign_detail',
    description: `Obtiene el detalle completo de una campaña específica de Google Ads.
Usá esta tool después de get_google_campaigns cuando necesitás profundizar en una campaña:
- Ver todos los ad groups y sus estados
- Revisar las keywords (texto, tipo de coincidencia, quality score)
- Ver un resumen de los anuncios activos y sus headlines
- Diagnosticar si la estructura de la campaña es correcta

Requiere el campaign_id obtenido de get_google_campaigns.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'ID numérico de la campaña (obtenido de get_google_campaigns).',
        },
        date_preset: {
          type: 'string',
          enum: GOOGLE_DATE_PRESETS,
          description: 'Período para las métricas de ad groups. Default: last_30d.',
        },
        since: { type: 'string', description: 'Fecha inicio YYYY-MM-DD.' },
        until: { type: 'string', description: 'Fecha fin YYYY-MM-DD.' },
      },
      required: ['campaign_id'],
    },
  },
];

async function executeGoogleAdsTool(
  toolName: string,
  toolInput: Record<string, string>,
  accountId: string,
  refreshToken: string,
  userId: string,
  clientId: string,
  organizationId: string,
): Promise<string> {
  const rateLimitError = await checkRateLimit(organizationId, 'google');
  if (rateLimitError) return JSON.stringify({ error: rateLimitError });

  try {
    const { date_preset, since, until, campaign_id } = toolInput;

    if (toolName === 'get_google_campaigns') {
      const campaigns = await getGoogleCampaigns(accountId, refreshToken, date_preset, since, until);

      await logApiCall({
        userId, clientId, organizationId,
        platform: 'google', toolName,
        endpoint: `customers/${accountId}/googleAds:searchStream`,
        requestParams: { date_preset: date_preset ?? 'last_30d', since, until },
        responseOk: true,
      });

      if (!campaigns.length) return JSON.stringify({ mensaje: 'No se encontraron campañas en esta cuenta.' });
      return JSON.stringify(campaigns);
    }

    if (toolName === 'get_google_campaign_detail') {
      if (!campaign_id) return JSON.stringify({ error: 'campaign_id es requerido.' });

      const detail = await getGoogleCampaignDetail(accountId, refreshToken, campaign_id, date_preset, since, until);

      await logApiCall({
        userId, clientId, organizationId,
        platform: 'google', toolName,
        endpoint: `customers/${accountId}/googleAds:searchStream`,
        requestParams: { campaign_id, date_preset: date_preset ?? 'last_30d' },
        responseOk: true,
      });

      return JSON.stringify(detail);
    }

    return JSON.stringify({ error: 'Tool no reconocida.' });
  } catch (err: any) {
    console.error(`[Google Ads Tool] Error en ${toolName}:`, err);
    await logApiCall({
      userId, clientId, organizationId,
      platform: 'google', toolName,
      endpoint: `customers/${accountId}/googleAds:searchStream`,
      requestParams: { ...toolInput },
      responseOk: false,
      errorMessage: err.message || 'Error desconocido',
    });
    return JSON.stringify({ error: err.message || 'Error al consultar Google Ads' });
  }
}

// ── Google Analytics Tool ─────────────────────────────────────────────────────

const GA4_TOOL: Anthropic.Tool = {
  name: 'get_ga4_metrics',
  description: `Obtiene métricas del sitio web del cliente desde Google Analytics 4 (GA4).
Usá esta tool para cruzar datos de tráfico web con el gasto en ads:
- Verificar si las campañas están generando tráfico real al sitio
- Analizar el comportamiento de usuarios por canal (organic, paid, direct)
- Ver tasas de conversión del sitio y compararlas con lo que reportan las plataformas de ads
- Detectar problemas de landing page (bounce rate alto, sesiones cortas)

Métricas disponibles: sessions, activeUsers, newUsers, bounceRate, engagementRate, conversions, eventCount, screenPageViews, averageSessionDuration.
Dimensiones disponibles: date, sessionDefaultChannelGroup, country, deviceCategory, sessionSource, sessionMedium, sessionCampaignName, pagePath.

Para análisis de canal: dimensions=['sessionDefaultChannelGroup'], metrics=['sessions','conversions'].
Para tendencia diaria: dimensions=['date'], metrics=['sessions','activeUsers'].
Para dispositivos: dimensions=['deviceCategory'], metrics=['sessions','bounceRate'].`,
  input_schema: {
    type: 'object' as const,
    properties: {
      metrics: {
        type: 'array',
        items: { type: 'string', enum: [...GA4_METRICS] },
        description: 'Métricas a obtener. Default: sessions, activeUsers, conversions.',
      },
      dimensions: {
        type: 'array',
        items: { type: 'string', enum: [...GA4_DIMENSIONS] },
        description: 'Dimensiones de desglose (opcional). Sin dimensiones, retorna totales del período.',
      },
      date_preset: {
        type: 'string',
        enum: ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'this_quarter'],
        description: 'Período. Default: last_30d.',
      },
      since: { type: 'string', description: 'Fecha inicio YYYY-MM-DD.' },
      until: { type: 'string', description: 'Fecha fin YYYY-MM-DD.' },
    },
  },
};

async function executeGA4Tool(
  toolInput: Record<string, any>,
  propertyId: string,
  refreshToken: string,
  userId: string,
  clientId: string,
  organizationId: string,
): Promise<string> {
  const rateLimitError = await checkRateLimit(organizationId, 'google');
  if (rateLimitError) return JSON.stringify({ error: rateLimitError });

  try {
    const metrics: string[] = toolInput.metrics?.length
      ? toolInput.metrics
      : ['sessions', 'activeUsers', 'conversions'];

    const dimensions: string[] = toolInput.dimensions ?? [];

    const report = await getGA4Metrics(
      propertyId,
      refreshToken,
      metrics,
      dimensions,
      toolInput.date_preset,
      toolInput.since,
      toolInput.until,
    );

    await logApiCall({
      userId, clientId, organizationId,
      platform: 'google', toolName: 'get_ga4_metrics',
      endpoint: `properties/${propertyId}:runReport`,
      requestParams: { metrics, dimensions, date_preset: toolInput.date_preset ?? 'last_30d' },
      responseOk: true,
    });

    return JSON.stringify(report);
  } catch (err: any) {
    console.error('[GA4 Tool] Error:', err);
    await logApiCall({
      userId, clientId, organizationId,
      platform: 'google', toolName: 'get_ga4_metrics',
      endpoint: `properties/${propertyId}:runReport`,
      requestParams: { ...toolInput },
      responseOk: false,
      errorMessage: err.message || 'Error desconocido',
    });

    // Error de scope faltante → mensaje específico para el analista
    if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('403')) {
      return JSON.stringify({
        error: 'Sin permisos para acceder a Google Analytics. El cliente necesita reconectar su cuenta de Google desde la página de edición para incluir el scope de Analytics.',
      });
    }

    return JSON.stringify({ error: err.message || 'Error al consultar Google Analytics' });
  }
}

// ── Sales Tool ────────────────────────────────────────────────────────────────

const SALES_DATE_PRESETS = ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'this_quarter'] as const;

const SALES_TOOL: Anthropic.Tool = {
  name: 'get_sales_data',
  description: `Obtiene los datos de ventas reales del negocio (cargados por el analista, independientes de las plataformas de ads) para calcular ROAS verdadero y cruzar con gasto en Meta/Google.
Usá esta tool cuando el analista pida ROAS real, ventas del período, o quiera cruzar ingresos reales con el gasto en plataformas.
Para calcular ROAS real: ventas_totales / gasto_en_ads. Si ya obtuviste el gasto de get_meta_account_insights o Google Ads, podés calcularlo directamente con los datos de esta tool.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      date_preset: {
        type: 'string',
        description: 'Período predefinido. Ignorar si se usan since/until.',
        enum: SALES_DATE_PRESETS,
      },
      since: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Usar junto con until.' },
      until: { type: 'string', description: 'Fecha fin YYYY-MM-DD. Usar junto con since.' },
      granularity: {
        type: 'string',
        enum: ['total', 'monthly', 'weekly', 'daily'],
        description: 'Nivel de detalle del desglose. Default: total.',
      },
    },
  },
};

function resolveSalesDatePreset(preset: string): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().split('T')[0];
  const daysBack = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };
  switch (preset) {
    case 'last_7d':  return { since: daysBack(7), until };
    case 'last_14d': return { since: daysBack(14), until };
    case 'last_30d': return { since: daysBack(30), until };
    case 'last_90d': return { since: daysBack(90), until };
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: d.toISOString().split('T')[0], until };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const d = new Date(now.getFullYear(), q * 3, 1);
      return { since: d.toISOString().split('T')[0], until };
    }
    default: return { since: daysBack(30), until };
  }
}

async function executeSalesTool(
  toolInput: Record<string, string>,
  clientId: string,
): Promise<string> {
  try {
    const admin = createSupabaseAdmin();
    const { since, until } =
      toolInput.since && toolInput.until
        ? { since: toolInput.since, until: toolInput.until }
        : resolveSalesDatePreset(toolInput.date_preset || 'last_30d');

    const { data: sales, error } = await admin
      .from('sales_data')
      .select('date, amount, currency, product, upload_note')
      .eq('client_id', clientId)
      .gte('date', since)
      .lte('date', until)
      .order('date');

    if (error) return JSON.stringify({ error: error.message });

    if (!sales || sales.length === 0) {
      return JSON.stringify({
        periodo: `${since} al ${until}`,
        mensaje:
          'No hay datos de ventas cargados para este período. El analista puede subir un CSV desde la página de edición del cliente.',
      });
    }

    const totalByCurrency: Record<string, number> = {};
    for (const row of sales) {
      totalByCurrency[row.currency] =
        (totalByCurrency[row.currency] || 0) + parseFloat(row.amount);
    }

    const granularity = toolInput.granularity || 'total';

    const notes = [...new Set(sales.map((r: any) => r.upload_note).filter(Boolean))];

    if (granularity === 'total') {
      return JSON.stringify({
        periodo: `${since} al ${until}`,
        total_transacciones: sales.length,
        ventas_por_moneda: Object.fromEntries(
          Object.entries(totalByCurrency).map(([k, v]) => [k, parseFloat(v.toFixed(2))]),
        ),
        ...(notes.length > 0 && { notas_del_analista: notes }),
      });
    }

    // Desglose por período
    const grouped: Record<string, { amount: number; count: number; currency: string }> = {};
    for (const row of sales) {
      const d = new Date(row.date + 'T00:00:00');
      let key: string;
      if (granularity === 'daily') {
        key = row.date;
      } else if (granularity === 'weekly') {
        const ws = new Date(d);
        ws.setDate(d.getDate() - d.getDay());
        key = ws.toISOString().split('T')[0];
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!grouped[key]) grouped[key] = { amount: 0, count: 0, currency: row.currency };
      grouped[key].amount += parseFloat(row.amount);
      grouped[key].count += 1;
    }

    return JSON.stringify({
      periodo: `${since} al ${until}`,
      total_transacciones: sales.length,
      ventas_por_moneda: Object.fromEntries(
        Object.entries(totalByCurrency).map(([k, v]) => [k, parseFloat(v.toFixed(2))]),
      ),
      ...(notes.length > 0 && { notas_del_analista: notes }),
      desglose: Object.entries(grouped).map(([k, v]) => ({
        periodo: k,
        ventas: parseFloat(v.amount.toFixed(2)),
        moneda: v.currency,
        transacciones: v.count,
      })),
    });
  } catch (err: any) {
    return JSON.stringify({ error: err.message || 'Error al consultar datos de ventas' });
  }
}

// ── Create Report Tool ────────────────────────────────────────────────────────

const CREATE_REPORT_TOOL: Anthropic.Tool = {
  name: 'create_report',
  description: `Crea un reporte interactivo y compartible con el cliente. El reporte abre en una página separada donde el analista puede cambiar el período con un selector de fechas y exportar a PDF o CSV.
Usá esta tool cuando el analista pida armar, generar o crear un reporte.
Definí las secciones según qué datos están disponibles.
Secciones posibles:
- kpi_row: tarjetas con métricas clave (una por fuente de datos)
- bar_chart: gráfico de barras (por campaña o por semana)
- line_chart: evolución temporal (por día o semana)
- pie_chart: distribución (por campaña)
- table: tabla detallada de campañas`,
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Título del reporte' },
      date_preset: {
        type: 'string',
        enum: ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'this_quarter'],
        description: 'Período predefinido. Preferir esto sobre since/until para evitar errores de cálculo. Usar last_30d para "último mes", this_month para el mes en curso, last_month para el mes anterior completo.',
      },
      since: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Solo usar si el analista pide un rango específico que no cubre date_preset.' },
      until: { type: 'string', description: 'Fecha fin YYYY-MM-DD. Solo usar si el analista pide un rango específico que no cubre date_preset.' },
      sections: {
        type: 'array',
        description: 'Secciones del reporte en orden de aparición.',
        items: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string',
              enum: ['kpi_row', 'bar_chart', 'line_chart', 'pie_chart', 'table'],
            },
            title: { type: 'string' },
            source: { type: 'string', enum: ['meta', 'sales'] },
            metric: {
              type: 'string',
              enum: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'amount', 'count'],
              description: 'Métrica a graficar (para bar/line/pie)',
            },
            dimension: {
              type: 'string',
              enum: ['campaign', 'day', 'week'],
              description: 'Dimensión del eje X (para bar/line/pie)',
            },
            color: {
              type: 'string',
              description: 'Color hex para el gráfico. Sugerencias: verde neon #39ff14, dorado #FFD700, azul #00bfff, rojo #ff6b6b, violeta #b39ddb. Si no se especifica, se usa el color por defecto de la fuente.',
            },
          },
          required: ['type', 'source'],
        },
      },
    },
    required: ['title', 'sections'],
  },
};

// ── Alert Tools ───────────────────────────────────────────────────────────────

const ALERT_CONDITION_TYPES = [
  'meta_cpa_above',
  'meta_spend_above',
  'meta_ctr_below',
  'google_cpa_above',
  'google_spend_above',
  'google_ctr_below',
  'sales_below',
] as const;

const ALERT_DATE_PRESETS = ['last_7d', 'last_14d', 'last_30d', 'this_month'] as const;

const ALERT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_alert',
    description: `Crea una alerta personalizada para este cliente. La alerta se evalúa diariamente y notifica al analista cuando la condición se cumple.
Usá esta tool cuando el analista pida configurar una alerta, ya sea directamente ("creame una alerta") o implícitamente ("avisame si el CPA sube de $50").

Condiciones disponibles:
- meta_cpa_above: CPA de Meta supera X USD (spend / conversiones)
- meta_spend_above: gasto en Meta supera X USD en el período
- meta_ctr_below: CTR de Meta cae debajo de X%
- google_cpa_above: CPA de Google supera X USD
- google_spend_above: gasto en Google supera X USD
- google_ctr_below: CTR promedio de Google cae debajo de X%
- sales_below: ventas reales caen debajo de X (en la moneda cargada)

Por defecto el analista recibe notificación por mail y en la app. Podés desactivar alguno con notify_email o notify_inapp.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nombre descriptivo de la alerta. Ej: "CPA Meta supera $50"' },
        condition_type: {
          type: 'string',
          enum: [...ALERT_CONDITION_TYPES],
          description: 'Tipo de condición',
        },
        condition_value: { type: 'number', description: 'Valor umbral de la condición' },
        date_preset: {
          type: 'string',
          enum: [...ALERT_DATE_PRESETS],
          description: 'Período de evaluación. Default: last_7d.',
        },
        notify_email: { type: 'boolean', description: 'Enviar notificación por mail. Default: true.' },
        notify_inapp: { type: 'boolean', description: 'Notificación en la app. Default: true.' },
        notify_emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Destinatarios adicionales de email (opcional). Por defecto solo recibe el analista que creó la alerta. Podés agregar el mail del cliente u otros analistas. Ejemplo: ["cliente@empresa.com", "otro@megabait.com"].',
        },
      },
      required: ['name', 'condition_type', 'condition_value'],
    },
  },
  {
    name: 'update_alert',
    description: `Modifica o desactiva una alerta existente del cliente.
Usá esta tool cuando el analista quiera:
- Desactivar una alerta: is_active = false
- Cambiar el umbral: condition_value = nuevo valor
- Desactivar notificaciones por mail: notify_email = false
- Desactivar notificaciones in-app: notify_inapp = false

Para encontrar el alert_id, primero llamá list_alerts.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        alert_id: { type: 'string', description: 'ID de la alerta a modificar (obtenido de list_alerts)' },
        is_active: { type: 'boolean', description: 'true para activar, false para desactivar' },
        condition_value: { type: 'number', description: 'Nuevo valor umbral' },
        notify_email: { type: 'boolean', description: 'Activar/desactivar notificaciones por mail' },
        notify_inapp: { type: 'boolean', description: 'Activar/desactivar notificaciones in-app' },
        notify_emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reemplaza la lista de destinatarios de email. Pasá un array vacío [] para volver al comportamiento por defecto (solo el creador de la alerta).',
        },
        date_preset: { type: 'string', enum: [...ALERT_DATE_PRESETS], description: 'Cambiar período de evaluación' },
      },
      required: ['alert_id'],
    },
  },
  {
    name: 'list_alerts',
    description: `Lista las alertas configuradas para este cliente.
Usá esta tool cuando el analista pregunte qué alertas tiene activas, o antes de usar update_alert para obtener el alert_id.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

async function executeAlertTool(
  toolName: string,
  toolInput: Record<string, any>,
  clientId: string,
  organizationId: string,
  userId: string,
): Promise<string> {
  const admin = createSupabaseAdmin();

  if (toolName === 'create_alert') {
    const { data, error } = await admin.from('alerts').insert({
      client_id: clientId,
      organization_id: organizationId,
      created_by: userId,
      name: toolInput.name,
      condition_type: toolInput.condition_type,
      condition_value: toolInput.condition_value,
      date_preset: toolInput.date_preset ?? 'last_7d',
      notify_email: toolInput.notify_email ?? true,
      notify_inapp: toolInput.notify_inapp ?? true,
      notify_emails: toolInput.notify_emails ?? [],
    }).select('id, name, condition_type, condition_value, date_preset, notify_email, notify_inapp, notify_emails').single();

    if (error) return JSON.stringify({ error: error.message });

    const extraEmails: string[] = data.notify_emails ?? [];
    const emailNote = extraEmails.length
      ? ` — destinatarios: ${extraEmails.join(', ')}`
      : '';

    return JSON.stringify({
      success: true,
      alert: data,
      message: `Alerta creada: "${data.name}". Se evaluará diariamente (período: ${data.date_preset}). Notificaciones: ${data.notify_email ? `mail ✓${emailNote}` : 'mail ✗'} ${data.notify_inapp ? 'in-app ✓' : 'in-app ✗'}.`,
    });
  }

  if (toolName === 'update_alert') {
    const { alert_id, ...patch } = toolInput;
    const allowed = ['is_active', 'notify_email', 'notify_inapp', 'notify_emails', 'condition_value', 'date_preset'];
    const update: Record<string, any> = {};
    for (const key of allowed) {
      if (key in patch) update[key] = patch[key];
    }

    const { data, error } = await admin
      .from('alerts')
      .update(update)
      .eq('id', alert_id)
      .eq('client_id', clientId)
      .select('name, is_active, notify_email, notify_inapp, notify_emails, condition_value')
      .single();

    if (error) return JSON.stringify({ error: error.message });

    return JSON.stringify({
      success: true,
      alert: data,
      message: `Alerta "${data.name}" actualizada correctamente.`,
    });
  }

  if (toolName === 'list_alerts') {
    const { data, error } = await admin
      .from('alerts')
      .select('id, name, condition_type, condition_value, date_preset, notify_email, notify_inapp, notify_emails, is_active, last_triggered_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) return JSON.stringify({ error: error.message });
    if (!data || data.length === 0) return JSON.stringify({ message: 'Este cliente no tiene alertas configuradas todavía.' });

    return JSON.stringify(data);
  }

  return JSON.stringify({ error: 'Tool no reconocida.' });
}

function resolveReportDates(input: Record<string, any>): { since: string; until: string } {
  if (input.since && input.until) return { since: input.since, until: input.until };

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const daysBack = (n: number) => {
    const d = new Date(now); d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };

  switch (input.date_preset) {
    case 'last_7d':   return { since: daysBack(7), until: today };
    case 'last_14d':  return { since: daysBack(14), until: today };
    case 'last_30d':  return { since: daysBack(30), until: today };
    case 'last_90d':  return { since: daysBack(90), until: today };
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: first.toISOString().split('T')[0], until: last.toISOString().split('T')[0] };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const d = new Date(now.getFullYear(), q * 3, 1);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    default: return { since: daysBack(30), until: today };
  }
}

async function executeCreateReport(
  toolInput: Record<string, any>,
  clientId: string,
  userId: string,
  baseUrl: string,
): Promise<string> {
  try {
    const admin = createSupabaseAdmin();
    const { data: client } = await admin
      .from('clients')
      .select('organization_id, meta_ads_account_id')
      .eq('id', clientId)
      .single();

    if (!client) return JSON.stringify({ error: 'Cliente no encontrado' });

    const sources: string[] = [];
    const hasMetaConn = !!(toolInput.sections?.some((s: any) => s.source === 'meta') && client.meta_ads_account_id);
    const hasSalesConn = toolInput.sections?.some((s: any) => s.source === 'sales');
    if (hasMetaConn) sources.push('meta');
    if (hasSalesConn) sources.push('sales');

    const { since, until } = resolveReportDates(toolInput);

    const { data, error } = await admin.from('reports').insert({
      client_id: clientId,
      organization_id: client.organization_id,
      created_by: userId,
      title: toolInput.title,
      initial_since: since,
      initial_until: until,
      sources,
      sections: toolInput.sections,
    }).select('id').single();

    if (error) return JSON.stringify({ error: error.message });

    return JSON.stringify({
      success: true,
      report_url: `${baseUrl}/reports/${data.id}`,
      message: `Reporte creado exitosamente. El analista puede abrirlo en: ${baseUrl}/reports/${data.id}`,
    });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
  const { clientId, message, history } = await request.json();
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Traer contexto del cliente via admin (bypass RLS)
  const adminForClient = createSupabaseAdmin();
  const { data: client, error } = await adminForClient
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

  // Autorización: el cliente tiene que pertenecer a la org del usuario.
  // Sin esto, cualquier usuario logueado podría chatear contra clientes ajenos
  // y consumir sus tokens de Meta/Google.
  const userOrgId = await getUserOrgId(adminForClient, user.id);
  if (!userOrgId || client.organization_id !== userOrgId) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  // Google Ads: obtener refresh_token para las tools
  let googleRefreshToken: string | null = null;
  if (client.google_ads_account_id) {
    const { data: googleConnection } = await adminForClient
      .from('google_connections')
      .select('refresh_token')
      .eq('client_id', client.id)
      .maybeSingle();
    if (googleConnection) googleRefreshToken = googleConnection.refresh_token;
  }

  const hasGoogleAds = !!(client.google_ads_account_id && googleRefreshToken);
  const hasGA4 = !!(client.google_analytics_property_id && googleRefreshToken);

  // Meta Ads: obtener token para las tools
  let metaAccessToken: string | null = null;
  if (client.meta_ads_account_id) {
    const { data: metaConnection } = await adminForClient
      .from('meta_connections')
      .select('access_token')
      .eq('client_id', client.id)
      .maybeSingle();
    if (metaConnection) metaAccessToken = metaConnection.access_token;
  }

  const hasMetaAds = !!(client.meta_ads_account_id && metaAccessToken);

  // Sales data: verificar si hay datos cargados para este cliente
  const adminForSales = createSupabaseAdmin();
  const { count: salesCount } = await adminForSales
    .from('sales_data')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  const hasSalesData = (salesCount ?? 0) > 0;

  // Alertas: cargar alertas activas del cliente
  const { data: activeAlerts } = await adminForClient
    .from('alerts')
    .select('id, name, condition_type, condition_value, date_preset, last_triggered_at')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Fecha de referencia para el modelo (zona horaria de Argentina).
  // Sin esto, Claude calcula fechas con su conocimiento base (que es de un año
  // anterior) y los reportes salen con el año equivocado.
  const hoyLargo = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const hoyISO = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });

  const systemMessage = `# IDENTIDAD

Te llamás **Jair**. Sos el Agente Senior de Megabait, el "Segundo Analista" de Emiliano Sala. Trabajás como un analista de marketing digital con años de experiencia ejecutando y diagnosticando campañas en Meta Ads, Google Ads y Google Analytics. Tu trabajo no es ejecutar — es ayudar al analista humano a pensar mejor, detectar lo que se le escapa, y proponer movimientos con criterio.

Tu tono es profesional, directo y accesible. Hablás en español rioplatense. Tenés ingenio rosarino pero usado con medida — no forzás chistes ni modismos cuando la consulta es técnica. Si te preguntan tu nombre, sos Jair.

# CONTEXTO TEMPORAL

Hoy es **${hoyLargo}** (${hoyISO}). Usá siempre esta fecha como referencia para cualquier cálculo de períodos, rangos o "último mes". No asumas otro año. Cuando uses tools con \`since\`/\`until\`, calculá las fechas a partir de hoy.

# CONTEXTO DEL CLIENTE ACTUAL

- Nombre: ${client.name}
- Industria: ${client.industry}
- Descripción: ${client.description}
- Objetivos: ${client.objectives}
- Presupuesto: ${client.budget}
- KPIs prioritarios: ${client.kpis}
- Restricciones: ${client.restrictions}

# PRINCIPIOS ANALÍTICOS NO NEGOCIABLES

Estos principios definen tu criterio. No los olvides ni los cedés aunque el analista pida algo que los contradiga — en ese caso, explicás por qué no recomendás avanzar.

## 1. Significancia estadística antes que pausar
Antes de recomendar pausar una campaña o ad set, verificá que haya datos suficientes. Heurísticas mínimas:
- Al menos **50 conversiones** en el período evaluado, o
- Al menos **$500 USD de gasto** acumulado (ajustar a la moneda del cliente), o
- Al menos **7 días continuos** de entrega estable.

Si no se cumplen, **decilo explícitamente**: "Todavía no hay datos suficientes para evaluar — recomiendo esperar X días más antes de decidir." No pauses por intuición.

## 2. Rendimientos decrecientes al escalar
Cuando alguien propone duplicar presupuesto, no asumas que se duplican los resultados. Al escalar:
- El alcance incremental capta audiencias menos cualificadas
- El CPM tiende a subir
- El CVR tiende a bajar
- El ROAS marginal baja antes que el ROAS medio

Si recomendás escalar, hacelo en pasos del 20-30% y proponé reevaluar después de 3-5 días.

## 3. Respetar el tiempo de aprendizaje del algoritmo
Las campañas nuevas necesitan datos para optimizar. Meta y Google entran en "fase de aprendizaje" — durante esa fase los costos son volátiles y los resultados poco predictivos.

- Meta: **~50 eventos de optimización en 7 días** por ad set para salir de aprendizaje
- Google: tiempo similar, varía por tipo de campaña

Si un ad set tiene menos de 7 días o no salió de aprendizaje, advertí antes de evaluar. No recomiendes cambios estructurales (audiencia, optimización, creativos clave) durante la fase de aprendizaje salvo que algo esté claramente roto.

## 4. Ventanas de atribución extendidas
El ciclo de compra de muchos negocios es de **15-30+ días**, no de 7. Una campaña puede ser rentable a largo plazo aunque no convierta en la ventana corta de la plataforma.

- Si el cliente vende productos de consideración media-alta, asumí ventanas de 14-28 días salvo que sepas otra cosa
- Diferenciá entre "no convirtió todavía" y "no va a convertir"
- Cuando haya datos de ventas reales del negocio (no solo de la plataforma), cruzalos — el ROAS real puede ser muy distinto al ROAS que reporta Meta o Google

## 5. Calidad de creativo y oferta sobre optimización técnica
El 75% del éxito de una campaña depende de:
1. La oferta (qué se está vendiendo y a qué precio relativo al valor percibido)
2. El hook / ángulo (los primeros 3 segundos del creativo)
3. La propuesta de valor (por qué este cliente y no la competencia)

Solo el 25% depende de optimización técnica (pujas, audiencias, ubicaciones). Si los KPIs están malos, **el primer lugar donde mirar es la creatividad y la oferta**, no las pujas.

## 6. Métricas de vanidad vs métricas de negocio
**Vanidad** (no priorizar): likes, alcance, vistas, impresiones aisladas, comentarios.
**Negocio** (priorizar siempre): ROAS, CPA, ingresos atribuidos, márgen de contribución, LTV.

Si el cliente pregunta por métricas de vanidad sin contexto, redirigí hacia las de negocio: "El alcance subió, pero más importante: ¿esto se está traduciendo en ventas?"

## 7. No consolidar ad sets sin entender qué se está testeando
Antes de proponer consolidar (fusionar audiencias o ad sets), preguntá:
- ¿Hay un test de audiencia activo?
- ¿Hay segmentos que el cliente quiere mantener separados por reporting?
- ¿La consolidación rompe la atribución de algo en curso?

La consolidación prematura puede arruinar tests legítimos.

# SAFETY — REGLAS NO NEGOCIABLES

Tu producto está pensado para no provocar baneos en Meta o Google. Estas reglas son hard:

## 1. Nunca cambios masivos
Si proponés más de 5 cambios en una sesión (pausas, edits, presupuestos), explícitamente fraccionalos en el tiempo o pedile al analista que los priorice. Meta y Google detectan patrones agresivos y banean cuentas.

## 2. Nunca ejecución directa
Vos **proponés**, el analista humano **aprueba**. Nunca digas "ya pausé la campaña" — siempre "te propongo pausarla, ¿la aprobamos?". Si en algún momento tenés que ejecutar algo, el sistema te va a dar una tool específica para eso, y siempre va a pasar por un gate de aprobación.

## 3. Declarar contenido generado con IA
Si proponés copy, headlines, descripciones o creatividades nuevas, mencionalas como "AI-generated" en tu mensaje. Meta exige el AI Content Label desde marzo 2026 — el sistema lo va a aplicar automáticamente, pero vos también deberías declararlo en lenguaje natural cuando aparezca.

## 4. Respetar rate limits razonables
Si proponés una serie de tests, espaciálos. No recomiendes "lanzá 10 ad sets nuevos hoy" — es exactamente el patrón que dispara flags. Recomendá "lancemos 3 hoy, evaluemos en 5 días, ajustemos los próximos".

# POSICIONAMIENTO MEGABAIT

Trabajás bajo la mirada de Megabait, que tiene una visión muy específica del mercado:

## Neutralidad de plataforma
No sos vendedor ni de Meta ni de Google. Las plataformas tienen incentivos propios (que el cliente gaste más, en su plataforma específica). Tu trabajo es ver el journey completo y recomendar lo que es mejor para el cliente, no para la plataforma.

## Medir con las reglas del anunciante
Las herramientas nativas miden con sus propias ventanas de atribución y reglas. Eso es **parcial por diseño** — Meta solo ve lo que pasó en Meta, Google solo lo que pasó en Google. El analista (vos) tiene que reconciliar.

Cuando haya datos cross-platform, cruzalos. Cuando no, decílo: "Meta reporta X, pero solo te muestra su lado del journey."

## Diferencial vs herramientas comerciales
Megabait compite con Madgicx, Birdeye, Triple Whale. El diferencial es:
- **Contexto profundo del negocio del cliente** (no solo métricas — industria, restricciones, objetivos)
- **Criterio analítico humano codificado** (los principios de arriba)
- **Neutralidad de plataforma**
- **Safety**: la forma segura de poner IA sobre cuentas de ads sin que las baneen

# COMPORTAMIENTO ESPERADO

## Cuando hay datos anómalos
**Antes de diagnosticar, preguntá contexto.** Si el CPA se duplicó esta semana, no asumas que algo está mal — preguntá:
- ¿Hubo cambios recientes en creatividades, presupuestos, audiencias?
- ¿Cambió la oferta o los precios?
- ¿Hay estacionalidad esperada?
- ¿Cambió algo en la web o el checkout?

No entres en modo pánico con datos anómalos. Un dato raro merece investigación, no acción inmediata.

## Cuando no hay datos suficientes
**Decilo explícitamente.** No inventes análisis sobre datos pobres. Frases tipo: "Con estos volúmenes todavía no se puede sacar una conclusión confiable. Te recomiendo X y volvemos a evaluar en Y días."

Si el cliente conectó Meta Ads pero no Google, o no subió datos de ventas, mencionalo cuando sea relevante: "Sería más completo si pudiéramos ver también el lado de Google" o "Si subís los datos de ventas del último mes, podemos calcular ROAS real."

## Cuando hay datos de múltiples plataformas
Cruzalos y dá visión unificada. Ejemplos:
- "Meta atribuye 12 conversiones y Google atribuye 8. Si tus ventas reales fueron 15, probablemente haya solapamiento — no son 20 ventas, son 15 con dos plataformas peleándose la atribución."
- "El awareness lo está generando Meta (alcance + clics asistidos), pero el cierre lo está haciendo Google (búsquedas de marca + conversiones directas)."

## Cuando detectás una oportunidad
**Proponé con justificación, no como orden.** Formato sugerido:
- **Qué viste**: el dato que dispara la oportunidad
- **Hipótesis**: por qué creés que pasa
- **Propuesta**: qué probarías
- **Cómo evaluamos**: qué métrica y en qué plazo

Ejemplo: "Veo que el ángulo de 'descuento' tiene 2x más CTR que el de 'calidad' en los últimos 14 días. Hipótesis: este segmento responde mejor a urgencia que a prestigio. Propongo lanzar 2 creatividades nuevas con foco en oferta limitada. Evaluaríamos CTR y CPA en 5 días."

# HERRAMIENTAS DISPONIBLES

**Regla general para todas las tools:**
- Usá las tools cuando el analista pida datos o análisis específicos que requieran números reales.
- No las uses para preguntas estratégicas, conceptuales o cuando el analista ya te pasó los datos.
- Para comparar dos períodos, llamá la tool dos veces con distintos date_preset.

## Meta Ads
${hasMetaAds ? `
Conectado. Tools disponibles: **get_meta_account_insights** (métricas agregadas de la cuenta) y **get_meta_campaigns** (lista de campañas con métricas individuales).` : `
**No conectado.** Si la conversación requiere datos de Meta, recomendá conectar la cuenta desde el dashboard. No inventes métricas.`}

## Google Ads
${hasGoogleAds ? `
Conectado. Tools disponibles:
- **get_google_campaigns**: lista todas las campañas incluyendo las pausadas, con configuración (estrategia de puja, presupuesto diario, tipo de canal) y métricas del período. Ideal para revisión inicial y diagnóstico.
- **get_google_campaign_detail**: detalle de una campaña específica — ad groups, keywords (con quality score), y resumen de anuncios. Requiere el campaign_id de get_google_campaigns.

Flujo sugerido: get_google_campaigns → identificar campaña de interés → get_google_campaign_detail para profundizar.` : `
**No conectado** o Developer Token pendiente. Si el analista quiere analizar Google Ads, necesita reconectar la cuenta desde el dashboard una vez que el Developer Token esté configurado.`}

## Google Analytics (GA4)
${hasGA4 ? `
Conectado. Tool disponible: **get_ga4_metrics** para datos del sitio web — sesiones, usuarios, tasas de conversión, canales de tráfico.

Usá esta tool para cruzar tráfico web con gasto en ads: ¿las campañas llevan tráfico real? ¿Qué canal convierte mejor? ¿La landing page tiene bounce rate alto?

Si get_ga4_metrics retorna error de permisos, el cliente necesita reconectar Google para incluir el scope de Analytics.` : `
**No configurado.** ${googleRefreshToken ? 'El cliente tiene Google conectado pero sin Property ID de GA4. Podés sugerirle que lo configure en la página de edición.' : 'El cliente no tiene Google conectado todavía.'}`}

# CIERRE

Respondé en español, profesional pero accesible. Sé directo. Si una respuesta corta alcanza, dala corta. Si el análisis requiere desarrollo, desarrollalo — pero sin relleno.

Si el analista te pide algo que va contra los principios de arriba (pausar sin significancia, escalar agresivo, ejecutar sin aprobación, evitar declarar AI), explicás por qué no es buena idea antes de hacer lo que pide.

# REPORTES — REGLA ESTRICTA

Cuando el analista pida un reporte, informe o dashboard, **SIEMPRE llamás a la tool \`create_report\`**. Nunca escribas un reporte en texto dentro del chat — eso no es exportable, no es interactivo y no cumple con lo que el analista necesita.

Pasos obligatorios:
1. Llamar \`create_report\` con el título, rango de fechas y secciones apropiadas según qué fuentes están disponibles (Meta, ventas)
2. Devolver al analista el link que te retorna la tool
3. No escribir el contenido del reporte en texto — eso es trabajo de la página del reporte

Palabras clave que activan \`create_report\`: "reporte", "informe", "dashboard", "armame un reporte", "generame un informe", "quiero ver", "mostrá los datos", "compartir con el cliente".

Colores disponibles para secciones (campo \`color\` opcional): verde neon #39ff14, dorado #FFD700, azul #00bfff, rojo coral #ff6b6b, violeta #b39ddb, celeste #80deea, naranja #ffcc80. Si el analista no especifica colores, usá verde para Meta y dorado para ventas.

# ALERTAS PERSONALIZADAS

Podés crear, modificar y listar alertas para este cliente usando las tools create_alert, update_alert y list_alerts.

${activeAlerts && activeAlerts.length > 0
  ? `Este cliente tiene **${activeAlerts.length} alerta(s) activa(s)**:
${activeAlerts.map(a => `- "${a.name}" (${a.condition_type} ${a.condition_value}, período: ${a.date_preset})${a.last_triggered_at ? ` — último disparo: ${new Date(a.last_triggered_at).toLocaleDateString('es-AR')}` : ''}`).join('\n')}

Si el analista menciona que quiere modificar alguna de estas alertas, usá update_alert con el id correspondiente.`
  : `Este cliente **no tiene alertas configuradas** todavía.`}

Ejemplos de alertas que podés sugerir proactivamente cuando detectes un problema:
- "¿Querés que te avise si el CPA de Meta vuelve a superar este valor?"
- "Puedo configurar una alerta para que te notifique si el gasto semanal de Google supera $X"
- "¿Te armo una alerta para cuando las ventas caigan debajo del mínimo histórico?"

# DATOS DE VENTAS REALES
${hasSalesData ? `
Este cliente tiene **datos de ventas reales** cargados (independientes de Meta/Google). Disponés de la tool \`get_sales_data\` para consultarlos.

Usala para calcular ROAS real: ventas_reales / gasto_en_plataformas. Si tenés el gasto de Meta o Google de otra tool, cruzalo directamente.
Ejemplo: "Meta reporta $5.000 de gasto y $35.000 en conversiones atribuidas. Las ventas reales del negocio fueron $28.000 — el ROAS real es 5.6x, no 7x."` : `
Este cliente **no tiene datos de ventas reales** cargados todavía. Si el analista quiere calcular ROAS real, puede subir un CSV desde la página de edición del cliente. Mencionalo cuando sea relevante — es una diferencia importante frente al ROAS que reportan las plataformas.`}`;

  // Ciclo de Tool Use
  // Necesario porque Claude puede encadenar múltiples tool calls
  // (ej: consulta last_7d y luego last_30d para comparar).
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const origin = new URL(request.url).origin;

  const tools: Anthropic.Tool[] = [
    ...(hasMetaAds ? META_ADS_TOOLS : []),
    ...(hasGoogleAds ? GOOGLE_ADS_TOOLS : []),
    ...(hasGA4 ? [GA4_TOOL] : []),
    ...(hasSalesData ? [SALES_TOOL] : []),
    CREATE_REPORT_TOOL,
    ...ALERT_TOOLS,
  ];

  const REPORT_KEYWORDS = ['reporte', 'informe', 'dashboard', 'armame', 'generame', 'crear reporte', 'generar reporte'];
  const isReportRequest = REPORT_KEYWORDS.some(k => message.toLowerCase().includes(k));
  let assistantMessage = '';
  let continueLoop = true;
  let isFirstCall = true;

  while (continueLoop) {
    // En el primer turno, si es un pedido de reporte, forzar la tool create_report
    const toolChoice = isFirstCall && isReportRequest
      ? { type: 'tool' as const, name: 'create_report' }
      : { type: 'auto' as const };
    isFirstCall = false;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemMessage,
      messages,
      ...(tools.length > 0 && { tools, tool_choice: toolChoice }),
    });

    if (response.stop_reason === 'tool_use') {
      // Claude quiere usar una o más tools — ejecutar y devolver los resultados
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          let result: string;
          if (block.name === 'get_sales_data') {
            result = await executeSalesTool(
              block.input as Record<string, string>,
              client.id,
            );
          } else if (block.name === 'create_report') {
            result = await executeCreateReport(
              block.input as Record<string, any>,
              client.id,
              user.id,
              origin,
            );
          } else if (block.name === 'get_google_campaigns' || block.name === 'get_google_campaign_detail') {
            result = await executeGoogleAdsTool(
              block.name,
              block.input as Record<string, string>,
              client.google_ads_account_id,
              googleRefreshToken!,
              user.id,
              client.id,
              client.organization_id,
            );
          } else if (block.name === 'get_ga4_metrics') {
            result = await executeGA4Tool(
              block.input as Record<string, any>,
              client.google_analytics_property_id,
              googleRefreshToken!,
              user.id,
              client.id,
              client.organization_id,
            );
          } else if (block.name === 'create_alert' || block.name === 'update_alert' || block.name === 'list_alerts') {
            result = await executeAlertTool(
              block.name,
              block.input as Record<string, any>,
              client.id,
              client.organization_id,
              user.id,
            );
          } else {
            result = await executeMetaTool(
              block.name,
              block.input as Record<string, string>,
              client.meta_ads_account_id,
              metaAccessToken!,
              user.id,
              client.id,
              client.organization_id,
            );
          }

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

  // Streaming: enviar assistantMessage en chunks palabra por palabra.
  // Supabase se guarda al finalizar el stream (cuando el cliente haya recibido todo).
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const words = assistantMessage.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = i < words.length - 1 ? words[i] + ' ' : words[i];
        controller.enqueue(encoder.encode(chunk));
        await new Promise((r) => setTimeout(r, 18));
      }

      // Guardar en Supabase una vez que se enviaron todos los chunks
      await adminForClient.from('conversations').insert([
        { client_id: clientId, user_id: user.id, role: 'user', content: message },
        { client_id: clientId, user_id: user.id, role: 'assistant', content: assistantMessage },
      ]);

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
  } catch (err: any) {
    console.error('[chat] Error inesperado:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
