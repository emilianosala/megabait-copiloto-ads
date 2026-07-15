import { createOAuthClient } from './google-oauth';

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

// Métricas y dimensiones soportadas por las tools de Jair
export const GA4_METRICS = [
  'sessions',
  'activeUsers',
  'newUsers',
  'bounceRate',
  'engagementRate',
  'conversions',
  'eventCount',
  'screenPageViews',
  'averageSessionDuration',
] as const;

export const GA4_DIMENSIONS = [
  'date',
  'sessionDefaultChannelGroup',
  'country',
  'deviceCategory',
  'sessionSource',
  'sessionMedium',
  'sessionCampaignName',
  'pagePath',
] as const;

// Convierte los date_presets al formato de GA4 Data API
function resolveGA4DateRange(
  datePreset?: string,
  since?: string,
  until?: string,
): { startDate: string; endDate: string } {
  if (since && until) return { startDate: since, endDate: until };
  const presets: Record<string, { startDate: string; endDate: string }> = {
    last_7d:      { startDate: '7daysAgo',  endDate: 'today' },
    last_14d:     { startDate: '14daysAgo', endDate: 'today' },
    last_30d:     { startDate: '30daysAgo', endDate: 'today' },
    last_90d:     { startDate: '90daysAgo', endDate: 'today' },
    this_month:   { startDate: 'firstDayOfMonth', endDate: 'today' },
    last_month:   { startDate: 'firstDayOfMonth-1m', endDate: 'lastDayOfMonth-1m' },
    this_quarter: { startDate: '90daysAgo', endDate: 'today' },
  };
  return presets[datePreset ?? 'last_30d'] ?? { startDate: '30daysAgo', endDate: 'today' };
}

export interface GA4Report {
  period: string;
  metrics_requested: string[];
  dimensions_requested: string[];
  totals: Record<string, string>;
  rows: Array<Record<string, string>>;
  row_count: number;
}

export async function getGA4Metrics(
  propertyId: string,
  refreshToken: string,
  metrics: string[],
  dimensions: string[],
  datePreset?: string,
  since?: string,
  until?: string,
): Promise<GA4Report> {
  // Obtener access token desde el refresh token
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token: accessToken } = await oauth2Client.getAccessToken();

  if (!accessToken) throw new Error('No se pudo obtener el access token de Google');

  const dateRange = resolveGA4DateRange(datePreset, since, until);

  const body = {
    dateRanges: [dateRange],
    metrics: metrics.map((name) => ({ name })),
    ...(dimensions.length > 0 && { dimensions: dimensions.map((name) => ({ name })) }),
    limit: 50,
  };

  const res = await fetch(
    `${GA4_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const data = await res.json();

  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`GA4 API error: ${msg}`);
  }

  // Parsear la respuesta de GA4 al formato que usamos en Jair
  const metricHeaders: string[] = (data.metricHeaders ?? []).map((h: { name: string }) => h.name);
  const dimensionHeaders: string[] = (data.dimensionHeaders ?? []).map((h: { name: string }) => h.name);

  // Totales (primera fila de totals si existe)
  const totals: Record<string, string> = {};
  if (data.totals?.[0]?.metricValues) {
    data.totals[0].metricValues.forEach((v: { value: string }, i: number) => {
      totals[metricHeaders[i]] = v.value;
    });
  }

  // Filas
  const rows: Array<Record<string, string>> = (data.rows ?? []).map((row: {
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }) => {
    const rowObj: Record<string, string> = {};
    dimensionHeaders.forEach((dim, i) => {
      rowObj[dim] = row.dimensionValues?.[i]?.value ?? '';
    });
    metricHeaders.forEach((metric, i) => {
      rowObj[metric] = row.metricValues?.[i]?.value ?? '0';
    });
    return rowObj;
  });

  const periodLabel = since && until
    ? `${since} al ${until}`
    : (datePreset ?? 'last_30d');

  return {
    period: periodLabel,
    metrics_requested: metricHeaders,
    dimensions_requested: dimensionHeaders,
    totals,
    rows,
    row_count: data.rowCount ?? rows.length,
  };
}

// ── Configuración de la propiedad (Admin API) ─────────────────────────────────

const GA4_ADMIN_API_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

export interface GA4Config {
  property_id: string;
  key_events: Array<{ event_name: string; counting_method: string; custom: boolean; created: string }>;
  google_ads_links: Array<{ customer_id: string; ads_personalization_enabled: boolean; created: string }>;
  data_streams: Array<{ type: string; display_name: string; measurement_id: string }>;
}

// Lee la CONFIGURACIÓN de la propiedad GA4 (no las métricas): qué eventos están
// marcados como conversión (keyEvents), el link con Google Ads (si las
// conversiones se importan a Ads), y los data streams (con su measurement id).
// Sirve para AUDITAR si el tracking de conversiones está bien puesto. El scope
// analytics.readonly (que ya usa el Data API) cubre también estas lecturas —
// no requiere un permiso extra ni reconexión.
export async function getGA4Config(
  propertyId: string,
  refreshToken: string,
): Promise<GA4Config> {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token: accessToken } = await oauth2Client.getAccessToken();

  if (!accessToken) throw new Error('No se pudo obtener el access token de Google');

  const get = async (resource: string): Promise<any> => {
    const res = await fetch(`${GA4_ADMIN_API_BASE}/properties/${propertyId}/${resource}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`GA4 Admin API error (${resource}): ${msg}`);
    }
    return data;
  };

  const [keyEvents, adsLinks, streams] = await Promise.all([
    get('keyEvents'),
    get('googleAdsLinks'),
    get('dataStreams'),
  ]);

  return {
    property_id: propertyId,
    key_events: (keyEvents.keyEvents ?? []).map((k: any) => ({
      event_name: k.eventName ?? '',
      counting_method: k.countingMethod ?? '',
      custom: k.custom ?? false,
      created: k.createTime ?? '',
    })),
    google_ads_links: (adsLinks.googleAdsLinks ?? []).map((l: any) => ({
      customer_id: l.customerId ?? '',
      ads_personalization_enabled: l.adsPersonalizationEnabled ?? false,
      created: l.createTime ?? '',
    })),
    data_streams: (streams.dataStreams ?? []).map((s: any) => ({
      type: s.type ?? '',
      display_name: s.displayName ?? '',
      measurement_id: s.webStreamData?.measurementId ?? '',
    })),
  };
}
