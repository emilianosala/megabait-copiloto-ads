export const META_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
export const META_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
export const META_LONG_LIVED_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';

export const META_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
].join(',');

export function getMetaAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    scope: META_SCOPES,
    response_type: 'code',
    state: userId,
  });

  return `${META_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    code,
  });

  const res = await fetch(`${META_TOKEN_URL}?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error al obtener token de Meta');
  }

  // Intercambiar por token de larga duración (~60 días)
  const longLivedParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: data.access_token,
  });

  const longLivedRes = await fetch(`${META_LONG_LIVED_TOKEN_URL}?${longLivedParams.toString()}`);
  const longLivedData = await longLivedRes.json();

  if (!longLivedRes.ok || longLivedData.error) {
    throw new Error(longLivedData.error?.message || 'Error al obtener token de larga duración');
  }

  return longLivedData.access_token;
}
