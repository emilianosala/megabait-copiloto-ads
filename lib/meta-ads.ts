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

export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const res = await fetch(
    `${META_API_BASE}/me/adaccounts?fields=id,name,currency,account_status&access_token=${accessToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error al obtener cuentas de Meta Ads');
  }

  return data.data;
}

export async function getAccountInsights(
  accessToken: string,
  adAccountId: string,
  fields: string = 'impressions,clicks,spend,ctr,cpc,reach,actions',
  datePreset: string = 'last_30d'
): Promise<MetaInsights | null> {
  const res = await fetch(
    `${META_API_BASE}/${adAccountId}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${accessToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error al obtener métricas de Meta Ads');
  }

  return data.data?.[0] || null;
}

export async function getCampaigns(
  accessToken: string,
  adAccountId: string
): Promise<any[]> {
  const res = await fetch(
    `${META_API_BASE}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${accessToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error al obtener campañas de Meta Ads');
  }

  return data.data;
}
