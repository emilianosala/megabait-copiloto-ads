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
  daily_budget_usd: number;
  impressions: number;
  clicks: number;
  cost_usd: number;
  conversions: number;
  ctr_percent: number;
  avg_cpc_usd: number;
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
    daily_budget_usd: (r.campaign_budget?.amount_micros ?? 0) / 1_000_000,
    impressions: r.metrics.impressions ?? 0,
    clicks: r.metrics.clicks ?? 0,
    cost_usd: (r.metrics.cost_micros ?? 0) / 1_000_000,
    conversions: r.metrics.conversions ?? 0,
    ctr_percent: parseFloat(((r.metrics.ctr ?? 0) * 100).toFixed(2)),
    avg_cpc_usd: (r.metrics.average_cpc ?? 0) / 1_000_000,
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
    max_cpc_usd: number;
    impressions: number;
    clicks: number;
    cost_usd: number;
    conversions: number;
  }>;
  top_keywords: Array<{
    text: string;
    match_type: string;
    status: string;
    quality_score: number | null;
    impressions: number;
    clicks: number;
    avg_cpc_usd: number;
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
      max_cpc_usd: (r.ad_group.cpc_bid_micros ?? 0) / 1_000_000,
      impressions: r.metrics.impressions ?? 0,
      clicks: r.metrics.clicks ?? 0,
      cost_usd: (r.metrics.cost_micros ?? 0) / 1_000_000,
      conversions: r.metrics.conversions ?? 0,
    })),
    top_keywords: keywordRows.map((r) => ({
      text: r.ad_group_criterion.keyword.text,
      match_type: r.ad_group_criterion.keyword.match_type,
      status: r.ad_group_criterion.status,
      quality_score: r.ad_group_criterion.quality_info?.quality_score ?? null,
      impressions: r.metrics.impressions ?? 0,
      clicks: r.metrics.clicks ?? 0,
      avg_cpc_usd: (r.metrics.average_cpc ?? 0) / 1_000_000,
    })),
    ads_summary: {
      total: adRows.length,
      enabled: adRows.filter((r) => r.ad_group_ad.status === 'ENABLED').length,
      paused: adRows.filter((r) => r.ad_group_ad.status === 'PAUSED').length,
      sample_headlines: sampleHeadlines,
    },
  };
}
