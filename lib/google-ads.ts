import { GoogleAdsApi } from 'google-ads-api';

export function createGoogleAdsClient(): GoogleAdsApi {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GAQL_DATE_CLAUSES: Record<string, string> = {
  last_7d:      'DURING LAST_7_DAYS',
  last_14d:     'DURING LAST_14_DAYS',
  last_30d:     'DURING LAST_30_DAYS',
  last_90d:     'DURING LAST_90_DAYS',
  this_month:   'DURING THIS_MONTH',
  last_month:   'DURING LAST_MONTH',
  this_quarter: 'DURING THIS_QUARTER',
};

export function resolveGaqlDateClause(
  datePreset?: string,
  since?: string,
  until?: string,
): string {
  if (since && until) return `BETWEEN '${since}' AND '${until}'`;
  return GAQL_DATE_CLAUSES[datePreset ?? 'last_30d'] ?? 'DURING LAST_30_DAYS';
}

// ── Campañas ──────────────────────────────────────────────────────────────────

interface CampaignRow {
  campaign: {
    id: number;
    name: string;
    status: string;
    advertising_channel_type: string;
    bidding_strategy_type: string;
  };
  campaign_budget: {
    amount_micros: number;
    delivery_method: string;
  };
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
    average_cpc: number;
  };
}

export interface GoogleCampaign {
  id: string;
  name: string;
  status: string;
  channel_type: string;
  bidding_strategy: string;
  daily_budget: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr_percent: number;
  avg_cpc: number;
}

export async function getGoogleCampaigns(
  accountId: string,
  refreshToken: string,
  datePreset?: string,
  since?: string,
  until?: string,
): Promise<GoogleCampaign[]> {
  const googleAds = createGoogleAdsClient();
  const customer = googleAds.Customer({ customer_id: accountId, refresh_token: refreshToken });
  const dateClause = resolveGaqlDateClause(datePreset, since, until);

  const rows = await customer.query<CampaignRow[]>(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date ${dateClause}
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map((r) => ({
    id: String(r.campaign.id),
    name: r.campaign.name,
    status: r.campaign.status,
    channel_type: r.campaign.advertising_channel_type,
    bidding_strategy: r.campaign.bidding_strategy_type,
    daily_budget: (r.campaign_budget?.amount_micros ?? 0) / 1_000_000,
    impressions: r.metrics.impressions ?? 0,
    clicks: r.metrics.clicks ?? 0,
    cost: (r.metrics.cost_micros ?? 0) / 1_000_000,
    conversions: r.metrics.conversions ?? 0,
    ctr_percent: parseFloat(((r.metrics.ctr ?? 0) * 100).toFixed(2)),
    avg_cpc: (r.metrics.average_cpc ?? 0) / 1_000_000,
  }));
}

// ── Métricas por día ──────────────────────────────────────────────────────────

export interface GoogleDailyRow {
  fecha: string;
  cost: number;
  clics: number;
  conversiones: number;
}

// Gasto/clics/conversiones con desglose POR DÍA. A nivel cuenta suma todas las
// campañas por fecha; si se pasa campaignId, acota a esa campaña. El monto ya
// viene en la moneda de la cuenta (cost_micros/1e6), no en USD.
export async function getDailyMetrics(
  accountId: string,
  refreshToken: string,
  datePreset?: string,
  since?: string,
  until?: string,
  campaignId?: string,
): Promise<GoogleDailyRow[]> {
  const googleAds = createGoogleAdsClient();
  const customer = googleAds.Customer({ customer_id: accountId, refresh_token: refreshToken });
  const dateClause = resolveGaqlDateClause(datePreset, since, until);
  const campaignFilter = campaignId ? `AND campaign.id = ${campaignId}` : '';

  const rows = await customer.query<Array<{
    segments: { date: string };
    metrics: { cost_micros: number; clicks: number; conversions: number };
  }>>(`
    SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date ${dateClause}
      ${campaignFilter}
    ORDER BY segments.date
  `);

  // La query devuelve una fila por campaña por fecha; agregamos por fecha.
  const byDate = new Map<string, GoogleDailyRow>();
  for (const r of rows) {
    const fecha = r.segments.date;
    const row = byDate.get(fecha) ?? { fecha, cost: 0, clics: 0, conversiones: 0 };
    row.cost += (r.metrics.cost_micros ?? 0) / 1_000_000;
    row.clics += r.metrics.clicks ?? 0;
    row.conversiones += r.metrics.conversions ?? 0;
    byDate.set(fecha, row);
  }

  return Array.from(byDate.values()).map((r) => ({
    fecha: r.fecha,
    cost: parseFloat(r.cost.toFixed(2)),
    clics: r.clics,
    conversiones: parseFloat(r.conversiones.toFixed(2)),
  }));
}

// ── Detalle de campaña ────────────────────────────────────────────────────────

interface AdGroupRow {
  ad_group: {
    id: number;
    name: string;
    status: string;
    type: string;
    cpc_bid_micros: number;
  };
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
  };
}

interface KeywordRow {
  ad_group_criterion: {
    keyword: { text: string; match_type: string };
    status: string;
    quality_info?: { quality_score?: number };
  };
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    average_cpc: number;
  };
}

interface AdRow {
  ad_group_ad: {
    status: string;
    ad: {
      type: string;
      responsive_search_ad?: {
        headlines: Array<{ text: string }>;
        descriptions: Array<{ text: string }>;
      };
    };
  };
}

export interface GoogleCampaignDetail {
  campaign_id: string;
  ad_groups: Array<{
    id: string;
    name: string;
    status: string;
    type: string;
    max_cpc: number;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
  }>;
  top_keywords: Array<{
    text: string;
    match_type: string;
    status: string;
    quality_score: number | null;
    impressions: number;
    clicks: number;
    avg_cpc: number;
  }>;
  ads_summary: {
    total: number;
    enabled: number;
    paused: number;
    sample_headlines: string[];
  };
}

export async function getGoogleCampaignDetail(
  accountId: string,
  refreshToken: string,
  campaignId: string,
  datePreset?: string,
  since?: string,
  until?: string,
): Promise<GoogleCampaignDetail> {
  const googleAds = createGoogleAdsClient();
  const customer = googleAds.Customer({ customer_id: accountId, refresh_token: refreshToken });
  const dateClause = resolveGaqlDateClause(datePreset, since, until);

  const [adGroupRows, keywordRows, adRows] = await Promise.all([
    customer.query<AdGroupRow[]>(`
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group
      WHERE campaign.id = ${campaignId}
        AND ad_group.status != 'REMOVED'
        AND segments.date ${dateClause}
      ORDER BY metrics.cost_micros DESC
    `),
    customer.query<KeywordRow[]>(`
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.average_cpc
      FROM keyword_view
      WHERE campaign.id = ${campaignId}
        AND ad_group_criterion.status != 'REMOVED'
        AND segments.date ${dateClause}
      ORDER BY metrics.impressions DESC
      LIMIT 30
    `),
    customer.query<AdRow[]>(`
      SELECT
        ad_group_ad.status,
        ad_group_ad.ad.type,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE campaign.id = ${campaignId}
        AND ad_group_ad.status != 'REMOVED'
      LIMIT 20
    `),
  ]);

  const sampleHeadlines = adRows
    .filter((r) => r.ad_group_ad.ad.responsive_search_ad?.headlines?.length)
    .slice(0, 2)
    .flatMap((r) => r.ad_group_ad.ad.responsive_search_ad!.headlines.slice(0, 3).map((h) => h.text));

  return {
    campaign_id: campaignId,
    ad_groups: adGroupRows.map((r) => ({
      id: String(r.ad_group.id),
      name: r.ad_group.name,
      status: r.ad_group.status,
      type: r.ad_group.type,
      max_cpc: (r.ad_group.cpc_bid_micros ?? 0) / 1_000_000,
      impressions: r.metrics.impressions ?? 0,
      clicks: r.metrics.clicks ?? 0,
      cost: (r.metrics.cost_micros ?? 0) / 1_000_000,
      conversions: r.metrics.conversions ?? 0,
    })),
    top_keywords: keywordRows.map((r) => ({
      text: r.ad_group_criterion.keyword.text,
      match_type: r.ad_group_criterion.keyword.match_type,
      status: r.ad_group_criterion.status,
      quality_score: r.ad_group_criterion.quality_info?.quality_score ?? null,
      impressions: r.metrics.impressions ?? 0,
      clicks: r.metrics.clicks ?? 0,
      avg_cpc: (r.metrics.average_cpc ?? 0) / 1_000_000,
    })),
    ads_summary: {
      total: adRows.length,
      enabled: adRows.filter((r) => r.ad_group_ad.status === 'ENABLED').length,
      paused: adRows.filter((r) => r.ad_group_ad.status === 'PAUSED').length,
      sample_headlines: sampleHeadlines,
    },
  };
}
