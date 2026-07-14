const META_API_BASE = 'https://graph.facebook.com/v19.0';

export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string;
  account_status: number;
}

export interface MetaInsights {
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  reach: string;
  date_start: string;
  date_stop: string;
  actions?: Array<{ action_type: string; value: string }>;
}

// Meta devuelve code 190 (OAuthException) cuando el token expiró, fue revocado
// o es inválido. El token de larga duración dura ~60 días y no hay refresh: al
// vencer, Jair fallaba con un mensaje técnico de la Graph API. Lo traducimos a
// algo accionable para el analista, y como todas las llamadas a Meta pasan por
// estas funciones, el mensaje queda consistente en chat, cuentas y alertas.
function assertMetaOk(res: Response, data: any, fallback: string): void {
  if (res.ok && !data?.error) return;
  if (data?.error?.code === 190) {
    throw new Error(
      'El token de Meta Ads expiró o es inválido. Reconectá Meta Ads desde la edición del cliente.',
    );
  }
  throw new Error(data?.error?.message || fallback);
}

export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const res = await fetch(
    `${META_API_BASE}/me/adaccounts?fields=id,name,currency,account_status&access_token=${accessToken}`
  );
  const data = await res.json();

  assertMetaOk(res, data, 'Error al obtener cuentas de Meta Ads');

  return data.data;
}

export async function getAccountInsights(
  accessToken: string,
  adAccountId: string,
  fields: string = 'impressions,clicks,spend,ctr,cpc,reach,actions',
  datePreset: string = 'last_30d',
  timeRange?: { since: string; until: string },
): Promise<MetaInsights | null> {
  const params = new URLSearchParams({ fields, access_token: accessToken });

  if (timeRange) {
    params.append('time_range', JSON.stringify(timeRange));
  } else {
    params.append('date_preset', datePreset);
  }

  const res = await fetch(`${META_API_BASE}/${adAccountId}/insights?${params.toString()}`);
  const data = await res.json();

  assertMetaOk(res, data, 'Error al obtener métricas de Meta Ads');

  return data.data?.[0] || null;
}

export async function getCampaigns(
  accessToken: string,
  adAccountId: string,
  insightFields: string = 'impressions,clicks,spend,ctr,cpc',
  datePreset: string = 'last_30d',
  timeRange?: { since: string; until: string },
): Promise<any[]> {
  // Sintaxis correcta de field expansion de la Graph API:
  //   insights.date_preset(last_30d){impressions,clicks,...}
  //   insights.time_range({"since":"...","until":"..."}){impressions,clicks,...}
  const dateFilter = timeRange
    ? `insights.time_range(${JSON.stringify(timeRange)}){${insightFields}}`
    : `insights.date_preset(${datePreset}){${insightFields}}`;

  const params = new URLSearchParams({
    fields: `id,name,status,objective,${dateFilter}`,
    access_token: accessToken,
  });

  const url = `${META_API_BASE}/${adAccountId}/campaigns?${params.toString()}`;

  // Log de debug — ocultar el token
  console.log('[Meta Ads] getCampaigns URL:', url.replace(accessToken, '[TOKEN]'));

  // Timeout de 30 s para evitar que el loop de tool use quede colgado
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await res.json();

  console.log(
    '[Meta Ads] getCampaigns raw response:',
    JSON.stringify(data).slice(0, 600),
  );

  assertMetaOk(res, data, 'Error al obtener campañas de Meta Ads');

  return data.data;
}

export interface MetaDailyRow {
  fecha: string;
  gasto: string;
  impresiones: number;
  clics: number;
}

// Métricas con desglose POR DÍA (time_increment=1). Sirve para gráficos de
// evolución y para ubicar cuándo se cortó o arrancó el gasto. objectId puede
// ser la cuenta (act_...) o el id de una campaña — /insights funciona en ambos.
export async function getDailyInsights(
  accessToken: string,
  objectId: string,
  datePreset: string = 'last_30d',
  timeRange?: { since: string; until: string },
): Promise<MetaDailyRow[]> {
  const params = new URLSearchParams({
    fields: 'spend,impressions,clicks',
    time_increment: '1',
    access_token: accessToken,
  });

  if (timeRange) params.append('time_range', JSON.stringify(timeRange));
  else params.append('date_preset', datePreset);

  const res = await fetch(`${META_API_BASE}/${objectId}/insights?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();

  assertMetaOk(res, data, 'Error al obtener métricas diarias de Meta Ads');

  return (data.data ?? []).map((r: any) => ({
    fecha: r.date_start,
    gasto: parseFloat(r.spend ?? '0').toFixed(2),
    impresiones: parseInt(r.impressions ?? '0'),
    clics: parseInt(r.clicks ?? '0'),
  }));
}
