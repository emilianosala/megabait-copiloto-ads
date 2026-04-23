import { createSupabaseServer } from '@/lib/supabase-server';
import { createGoogleAdsClient } from '@/lib/google-ads';
import { NextResponse } from 'next/server';

interface CustomerRow {
  customer: {
    id: number;
    descriptive_name?: string;
    descriptiveName?: string;
    currency_code?: string;
    currencyCode?: string;
    manager?: boolean;
  };
}

interface CustomerClientRow {
  customer_client: {
    id: number;
    descriptive_name?: string;
    descriptiveName?: string;
    currency_code?: string;
    currencyCode?: string;
    manager?: boolean;
  };
}

function resolveName(obj: { descriptive_name?: string; descriptiveName?: string }, fallback: string) {
  return obj.descriptive_name || obj.descriptiveName || fallback;
}

function resolveCurrency(obj: { currency_code?: string; currencyCode?: string }) {
  return obj.currency_code || obj.currencyCode || null;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from('google_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: 'Google Ads no conectado' }, { status: 400 });
  }

  const googleAds = createGoogleAdsClient();

  // ListAccessibleCustomers devuelve solo las cuentas de nivel superior accesibles
  // por el usuario. Si el usuario es admin de un MCC, devuelve el MCC pero NO sus
  // sub-cuentas — esas se obtienen via customer_client.
  const { resource_names } = await googleAds.listAccessibleCustomers(
    connection.refresh_token,
  );

  console.log('[google/accounts] resource_names:', resource_names);

  const result: {
    id: string;
    name: string;
    currency: string | null;
    is_manager: boolean;
  }[] = [];

  await Promise.all(
    resource_names.map(async (resourceName: string) => {
      const customerId = resourceName.replace('customers/', '');

      try {
        const customer = googleAds.Customer({
          customer_id: customerId,
          refresh_token: connection.refresh_token,
        });

        const rows = await customer.query<CustomerRow[]>(`
          SELECT
            customer.id,
            customer.descriptive_name,
            customer.currency_code,
            customer.manager
          FROM customer
          LIMIT 1
        `);

        const info = rows[0];
        console.log(`[google/accounts] top-level ${customerId}:`, JSON.stringify(info));

        const isManager = info.customer.manager ?? false;

        if (!isManager) {
          // Cuenta de cliente directa — la agregamos como está.
          result.push({
            id: String(info.customer.id),
            name: resolveName(info.customer, `Cuenta ${customerId}`),
            currency: resolveCurrency(info.customer),
            is_manager: false,
          });
          return;
        }

        // Es un MCC: obtener sub-cuentas vía customer_client.
        // Se requiere login_customer_id = id del MCC para que la API entienda
        // que estamos navegando como ese manager.
        const mccCustomer = googleAds.Customer({
          customer_id: customerId,
          login_customer_id: customerId,
          refresh_token: connection.refresh_token,
        });

        const subRows = await mccCustomer.query<CustomerClientRow[]>(`
          SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.currency_code,
            customer_client.manager
          FROM customer_client
          WHERE customer_client.level > 0
        `);

        console.log(`[google/accounts] MCC ${customerId} sub-accounts:`, JSON.stringify(subRows));

        for (const row of subRows) {
          const cc = row.customer_client;
          result.push({
            id: String(cc.id),
            name: resolveName(cc, `Cuenta ${cc.id}`),
            currency: resolveCurrency(cc),
            is_manager: cc.manager ?? false,
          });
        }
      } catch (err) {
        console.error(`[google/accounts] error en cuenta ${customerId}:`, err);
        result.push({
          id: customerId,
          name: `Cuenta ${customerId}`,
          currency: null,
          is_manager: false,
        });
      }
    }),
  );

  return NextResponse.json(result);
}
