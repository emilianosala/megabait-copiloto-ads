import { createSupabaseAdmin } from './supabase-admin';
import { getAccountInsights } from './meta-ads';
import { getGoogleCampaigns } from './google-ads';
import { sendAlertEmail } from './resend';

const COOLDOWN_HOURS = 23;

export async function checkAndFireAlerts(baseUrl: string): Promise<{ checked: number; fired: number }> {
  const admin = createSupabaseAdmin();

  const { data: alerts } = await admin
    .from('alerts')
    .select(`
      id, name, condition_type, condition_value, date_preset,
      notify_email, notify_inapp, notify_emails, last_triggered_at,
      client_id, organization_id, created_by,
      clients (
        name,
        meta_ads_account_id,
        google_ads_account_id,
        meta_ads_currency,
        google_ads_currency
      )
    `)
    .eq('is_active', true);

  if (!alerts || alerts.length === 0) return { checked: 0, fired: 0 };

  let fired = 0;
  const now = new Date();

  for (const alert of alerts) {
    // Cooldown: no disparar más de una vez cada COOLDOWN_HOURS horas
    if (alert.last_triggered_at) {
      const lastFired = new Date(alert.last_triggered_at);
      const hoursSince = (now.getTime() - lastFired.getTime()) / (1000 * 60 * 60);
      if (hoursSince < COOLDOWN_HOURS) continue;
    }

    const client = alert.clients as any;
    if (!client) continue;

    let metricValue: number | null = null;
    let conditionMet = false;
    let message = '';

    try {
      if (alert.condition_type.startsWith('meta_')) {
        const { data: metaConn } = await admin
          .from('meta_connections')
          .select('access_token')
          .eq('client_id', alert.client_id)
          .maybeSingle();

        if (!metaConn || !client.meta_ads_account_id) continue;

        const insights = await getAccountInsights(
          metaConn.access_token,
          client.meta_ads_account_id,
          'impressions,clicks,spend,ctr,actions',
          alert.date_preset,
        );

        if (!insights) continue;

        // La moneda ya viene aplicada al monto (spend está en la moneda de la
        // cuenta); solo etiquetamos con la moneda real en vez de asumir USD.
        const cur = client.meta_ads_currency ? ` ${client.meta_ads_currency}` : '';
        const spend = parseFloat(insights.spend ?? '0');
        const clicks = parseInt(insights.clicks ?? '0');
        const ctr = parseFloat(insights.ctr ?? '0') * 100;
        const conversions = (insights.actions ?? [])
          .filter((a: any) =>
            a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
            a.action_type === 'purchase',
          )
          .reduce((acc: number, a: any) => acc + parseFloat(a.value), 0);

        if (alert.condition_type === 'meta_cpa_above') {
          metricValue = conversions > 0 ? spend / conversions : null;
          if (metricValue !== null && metricValue > alert.condition_value) {
            conditionMet = true;
            message = `El CPA de Meta Ads es $${metricValue.toFixed(2)}${cur} — supera el umbral de $${alert.condition_value}${cur} (${alert.date_preset}).`;
          }
        } else if (alert.condition_type === 'meta_spend_above') {
          metricValue = spend;
          if (spend > alert.condition_value) {
            conditionMet = true;
            message = `El gasto en Meta Ads es $${spend.toFixed(2)}${cur} — supera el umbral de $${alert.condition_value}${cur} (${alert.date_preset}).`;
          }
        } else if (alert.condition_type === 'meta_ctr_below') {
          metricValue = ctr;
          if (ctr < alert.condition_value) {
            conditionMet = true;
            message = `El CTR de Meta Ads es ${ctr.toFixed(2)}% — cayó por debajo del umbral de ${alert.condition_value}% (${alert.date_preset}).`;
          }
        }

      } else if (alert.condition_type.startsWith('google_')) {
        const { data: googleConn } = await admin
          .from('google_connections')
          .select('refresh_token')
          .eq('client_id', alert.client_id)
          .maybeSingle();

        if (!googleConn || !client.google_ads_account_id) continue;

        const campaigns = await getGoogleCampaigns(
          client.google_ads_account_id,
          googleConn.refresh_token,
          alert.date_preset,
        );

        if (!campaigns.length) continue;

        // c.cost_usd es un nombre engañoso: cost_micros/1e6 ya viene en la
        // moneda de la cuenta, no en USD. Etiquetamos con la moneda real.
        const cur = client.google_ads_currency ? ` ${client.google_ads_currency}` : '';
        const totalCost = campaigns.reduce((acc, c) => acc + c.cost_usd, 0);
        const totalConversions = campaigns.reduce((acc, c) => acc + c.conversions, 0);
        const totalClicks = campaigns.reduce((acc, c) => acc + c.clicks, 0);
        const totalImpressions = campaigns.reduce((acc, c) => acc + c.impressions, 0);
        const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

        if (alert.condition_type === 'google_cpa_above') {
          metricValue = totalConversions > 0 ? totalCost / totalConversions : null;
          if (metricValue !== null && metricValue > alert.condition_value) {
            conditionMet = true;
            message = `El CPA de Google Ads es $${metricValue.toFixed(2)}${cur} — supera el umbral de $${alert.condition_value}${cur} (${alert.date_preset}).`;
          }
        } else if (alert.condition_type === 'google_spend_above') {
          metricValue = totalCost;
          if (totalCost > alert.condition_value) {
            conditionMet = true;
            message = `El gasto en Google Ads es $${totalCost.toFixed(2)}${cur} — supera el umbral de $${alert.condition_value}${cur} (${alert.date_preset}).`;
          }
        } else if (alert.condition_type === 'google_ctr_below') {
          metricValue = avgCtr;
          if (avgCtr < alert.condition_value) {
            conditionMet = true;
            message = `El CTR promedio de Google Ads es ${avgCtr.toFixed(2)}% — cayó por debajo del umbral de ${alert.condition_value}% (${alert.date_preset}).`;
          }
        }

      } else if (alert.condition_type === 'sales_below') {
        const dateRange = resolveDatePreset(alert.date_preset);
        const { data: sales } = await admin
          .from('sales_data')
          .select('amount')
          .eq('client_id', alert.client_id)
          .gte('date', dateRange.since)
          .lte('date', dateRange.until);

        const total = (sales ?? []).reduce((acc, row) => acc + parseFloat(row.amount), 0);
        metricValue = total;

        if (total < alert.condition_value) {
          conditionMet = true;
          message = `Las ventas reales son $${total.toFixed(2)} — cayeron por debajo del umbral de $${alert.condition_value} (${alert.date_preset}).`;
        }
      }
    } catch (err: any) {
      console.error(`[alerts] Error evaluando alerta ${alert.id}:`, err.message);
      continue;
    }

    // Actualizar last_checked_at siempre
    await admin
      .from('alerts')
      .update({
        last_checked_at: now.toISOString(),
        ...(conditionMet && { last_triggered_at: now.toISOString() }),
      })
      .eq('id', alert.id);

    if (!conditionMet || metricValue === null) continue;

    // Crear notificación in-app
    let notificationId: string | null = null;
    if (alert.notify_inapp) {
      const { data: notif } = await admin
        .from('alert_notifications')
        .insert({
          alert_id: alert.id,
          client_id: alert.client_id,
          organization_id: alert.organization_id,
          message,
          metric_value: metricValue,
        })
        .select('id')
        .single();
      notificationId = notif?.id ?? null;
    }

    // Enviar mail si hay RESEND_API_KEY configurado
    if (alert.notify_email && process.env.RESEND_API_KEY) {
      try {
        // Usar notify_emails si está configurado, sino fallback al creador de la alerta
        let recipients: string[] = (alert.notify_emails ?? []).filter(Boolean);
        if (recipients.length === 0) {
          const { data: userData } = await admin.auth.admin.getUserById(alert.created_by);
          if (userData.user?.email) recipients = [userData.user.email];
        }

        for (const to of recipients) {
          await sendAlertEmail({
            to,
            alertName: alert.name,
            clientName: client.name,
            message,
            metricValue,
            clientId: alert.client_id,
            baseUrl,
          });
        }

        if (recipients.length > 0 && notificationId) {
          // Marcar email como enviado en la notificación recién creada
          await admin
            .from('alert_notifications')
            .update({ email_sent: true })
            .eq('id', notificationId);
        }
      } catch (emailErr: any) {
        console.error(`[alerts] Error enviando mail para alerta ${alert.id}:`, emailErr.message);
      }
    }

    fired++;
  }

  return { checked: alerts.length, fired };
}

function resolveDatePreset(preset: string): { since: string; until: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const daysBack = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };
  switch (preset) {
    case 'last_7d':   return { since: daysBack(7), until: today };
    case 'last_14d':  return { since: daysBack(14), until: today };
    case 'last_30d':  return { since: daysBack(30), until: today };
    case 'last_90d':  return { since: daysBack(90), until: today };
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    default: return { since: daysBack(7), until: today };
  }
}
