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
