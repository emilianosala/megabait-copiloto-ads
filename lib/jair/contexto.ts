// CONTEXTO DINÁMICO — depende de los datos del cliente puntual.
// Contexto del negocio + moneda de las cuentas, alertas activas, y datos de ventas.

import type { JairPromptContext } from './types';

// Contexto del cliente + moneda de las cuentas de ads.
// La moneda se captura al elegir la cuenta en el form; sin esto Jair asumía USD.
export function contextoCliente(ctx: JairPromptContext): string {
  const { client } = ctx;

  const monedaLineas: string[] = [];
  if (client.google_ads_account_id && client.google_ads_currency) {
    monedaLineas.push(`Google Ads en **${client.google_ads_currency}**`);
  }
  if (client.meta_ads_account_id && client.meta_ads_currency) {
    monedaLineas.push(`Meta Ads en **${client.meta_ads_currency}**`);
  }
  const monedaContexto = monedaLineas.length
    ? `- Moneda de las cuentas: ${monedaLineas.join(' · ')}. TODOS los importes que devuelven las tools (gasto, CPA, CPC, CPM, presupuesto) están en esta moneda — interpretalos y mostralos siempre en ella, nunca asumas dólares. Si hacés una conversión a otra moneda, aclaralo explícitamente.`
    : `- Moneda de las cuentas: no informada. NO asumas dólares. Si un importe es relevante para tu análisis, preguntale al analista en qué moneda está la cuenta antes de sacar conclusiones.`;

  return `# CONTEXTO DEL CLIENTE ACTUAL

- Nombre: ${client.name}
- Industria: ${client.industry}
- Descripción: ${client.description}
- Objetivos: ${client.objectives}
- Presupuesto: ${client.budget}
- KPIs prioritarios: ${client.kpis}
- Restricciones: ${client.restrictions}
${monedaContexto}`;
}

export function alertas(ctx: JairPromptContext): string {
  const activeAlerts = ctx.activeAlerts;

  const estado =
    activeAlerts && activeAlerts.length > 0
      ? `Este cliente tiene **${activeAlerts.length} alerta(s) activa(s)**:
${activeAlerts
  .map(
    (a) =>
      `- "${a.name}" (${a.condition_type} ${a.condition_value}, período: ${a.date_preset})${a.last_triggered_at ? ` — último disparo: ${new Date(a.last_triggered_at).toLocaleDateString('es-AR')}` : ''}`,
  )
  .join('\n')}

Si el analista menciona que quiere modificar alguna de estas alertas, usá update_alert con el id correspondiente.`
      : `Este cliente **no tiene alertas configuradas** todavía.`;

  return `# ALERTAS PERSONALIZADAS

Podés crear, modificar y listar alertas para este cliente usando las tools create_alert, update_alert y list_alerts.

${estado}

Ejemplos de alertas que podés sugerir proactivamente cuando detectes un problema:
- "¿Querés que te avise si el CPA de Meta vuelve a superar este valor?"
- "Puedo configurar una alerta para que te notifique si el gasto semanal de Google supera $X"
- "¿Te armo una alerta para cuando las ventas caigan debajo del mínimo histórico?"`;
}

export function ventas(ctx: JairPromptContext): string {
  return `# DATOS DE VENTAS REALES
${ctx.hasSalesData ? `
Este cliente tiene **datos de ventas reales** cargados (independientes de Meta/Google). Disponés de la tool \`get_sales_data\` para consultarlos.

Usala para calcular ROAS real: ventas_reales / gasto_en_plataformas. Si tenés el gasto de Meta o Google de otra tool, cruzalo directamente.
Ejemplo: "Meta reporta $5.000 de gasto y $35.000 en conversiones atribuidas. Las ventas reales del negocio fueron $28.000 — el ROAS real es 5.6x, no 7x."` : `
Este cliente **no tiene datos de ventas reales** cargados todavía. Si el analista quiere calcular ROAS real, puede subir un CSV desde la página de edición del cliente. Mencionalo cuando sea relevante — es una diferencia importante frente al ROAS que reportan las plataformas.`}`;
}
