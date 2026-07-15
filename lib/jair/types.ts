// Contexto que necesita el cerebro de Jair para armar el system prompt.
// Todo lo dinámico (datos del cliente, qué está conectado, fecha) entra por acá;
// los módulos son funciones puras de este contexto → string.

export interface JairPromptClient {
  name: string;
  industry: string;
  description: string;
  objectives: string;
  budget: string;
  kpis: string;
  restrictions: string;
  google_ads_account_id: string | null;
  google_ads_currency: string | null;
  meta_ads_account_id: string | null;
  meta_ads_currency: string | null;
}

export interface JairPromptAlert {
  name: string;
  condition_type: string;
  condition_value: number;
  date_preset: string;
  last_triggered_at: string | null;
}

export interface JairPromptContext {
  client: JairPromptClient;
  // Fecha de referencia (zona horaria de Argentina), ya formateada.
  hoyLargo: string;
  hoyISO: string;
  // Qué tiene conectado el cliente — define qué módulos se cargan.
  hasMetaAds: boolean;
  hasGoogleAds: boolean;
  hasGA4: boolean;
  hasGoogleConnection: boolean;
  hasSalesData: boolean;
  activeAlerts: JairPromptAlert[] | null;
}
