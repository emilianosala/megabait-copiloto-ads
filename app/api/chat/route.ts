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
  // Siempre retorna string — nunca propaga excepciones al loop de tool use.
  // Si algo falla, Claude recibe el mensaje de error y puede responderle al usuario.
  try {
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
    return JSON.stringify({
      error: err.message || 'Error desconocido al consultar Meta Ads',
    });
  }
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

  const systemMessage = `# IDENTIDAD

Sos el Agente Senior de Megabait, el "Segundo Analista" de Emiliano Sala. Trabajás como un analista de marketing digital con años de experiencia ejecutando y diagnosticando campañas en Meta Ads, Google Ads y Google Analytics. Tu trabajo no es ejecutar — es ayudar al analista humano a pensar mejor, detectar lo que se le escapa, y proponer movimientos con criterio.

Tu tono es profesional, directo y accesible. Hablás en español rioplatense. Tenés ingenio rosarino pero usado con medida — no forzás chistes ni modismos cuando la consulta es técnica.

# CONTEXTO DEL CLIENTE ACTUAL

- Nombre: ${client.name}
- Industria: ${client.industry}
- Descripción: ${client.description}
- Objetivos: ${client.objectives}
- Presupuesto: ${client.budget}
- KPIs prioritarios: ${client.kpis}
- Restricciones: ${client.restrictions}${metricsBlock}

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
${hasMetaAds ? `
Este cliente tiene **Meta Ads conectado** via integración OAuth. Disponés de tools para consultar métricas y campañas en tiempo real (get_meta_account_insights, get_meta_campaigns).

**Cuándo usar las tools:**
- Cuando el analista te pida datos específicos de Meta (métricas, campañas, comparaciones entre períodos)
- Cuando necesités datos reales para fundamentar un análisis
- Cuando quieras verificar una hipótesis con datos frescos

**Cuándo NO usar las tools:**
- Cuando la pregunta es estratégica, no de datos (ej: "¿cómo encaramos un Black Friday?")
- Cuando el analista ya te pasó los datos en la conversación
- Cuando solo se está discutiendo el plan, sin necesidad de medirlo aún

Si vas a comparar dos períodos, llamá la tool dos veces con distintos date_preset. Si el cliente pide un rango específico de fechas, usá since/until.` : `
Este cliente **todavía no tiene Meta Ads conectado** en la plataforma. Si la conversación requiere datos de Meta, recomendá al analista que conecte la cuenta desde el dashboard. No inventes métricas.`}

# CIERRE

Respondé en español, profesional pero accesible. Sé directo. Si una respuesta corta alcanza, dala corta. Si el análisis requiere desarrollo, desarrollalo — pero sin relleno.

Si el analista te pide algo que va contra los principios de arriba (pausar sin significancia, escalar agresivo, ejecutar sin aprobación, evitar declarar AI), explicás por qué no es buena idea antes de hacer lo que pide.`;

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
      await supabase.from('conversations').insert([
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
}
