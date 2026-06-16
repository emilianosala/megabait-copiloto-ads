import { checkAndFireAlerts } from '@/lib/alerts';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const { checked, fired } = await checkAndFireAlerts(origin);

  return NextResponse.json({ ok: true, checked, fired, timestamp: new Date().toISOString() });
}
