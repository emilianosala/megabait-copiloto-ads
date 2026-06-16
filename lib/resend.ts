import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Jair by Megabait <alertas@megabait.com.ar>';

interface AlertEmailParams {
  to: string;
  alertName: string;
  clientName: string;
  message: string;
  metricValue: number;
  clientId: string;
  baseUrl: string;
}

export async function sendAlertEmail(params: AlertEmailParams): Promise<void> {
  const { to, alertName, clientName, message, metricValue, clientId, baseUrl } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Alerta: ${alertName} — ${clientName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0f0f0f; color: #e5e5e5; border-radius: 8px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888;">MEGABAIT · JAIR</span>
        </div>
        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 8px; color: #ffffff;">Alerta disparada</h2>
        <p style="font-size: 14px; color: #aaa; margin: 0 0 24px;">${clientName}</p>

        <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="font-size: 13px; font-weight: 600; color: #39ff14; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">${alertName}</p>
          <p style="font-size: 15px; color: #e5e5e5; margin: 0;">${message}</p>
          <p style="font-size: 13px; color: #888; margin: 8px 0 0;">Valor actual: <strong style="color: #fff;">${metricValue}</strong></p>
        </div>

        <a href="${baseUrl}/chat/${clientId}" style="display: inline-block; background: #39ff14; color: #111; font-weight: 600; font-size: 13px; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
          Analizar con Jair →
        </a>

        <p style="font-size: 12px; color: #555; margin-top: 32px;">
          Para desactivar esta alerta, abrí el chat del cliente y pedile a Jair que la desactive.
        </p>
      </div>
    `,
  });
}
