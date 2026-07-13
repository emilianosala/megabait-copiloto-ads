'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import styles from '../../client-form.module.css';

interface GoogleAccount {
  id: string;
  name: string;
  currency: string | null;
  is_manager: boolean;
}

interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  account_status: number;
}

interface Alert {
  id: string;
  name: string;
  condition_type: string;
  condition_value: number;
  date_preset: string;
  notify_email: boolean;
  notify_inapp: boolean;
  notify_emails: string[];
  is_active: boolean;
  last_triggered_at: string | null;
}

function conditionLabel(type: string, value: number): string {
  const map: Record<string, string> = {
    meta_cpa_above:    `CPA Meta > $${value}`,
    meta_spend_above:  `Gasto Meta > $${value}`,
    meta_ctr_below:    `CTR Meta < ${value}%`,
    google_cpa_above:  `CPA Google > $${value}`,
    google_spend_above:`Gasto Google > $${value}`,
    google_ctr_below:  `CTR Google < ${value}%`,
    sales_below:       `Ventas < $${value}`,
  };
  return map[type] ?? type;
}

interface SalesSummary {
  rowCount: number;
  dateRange: { min: string; max: string };
  totalByCurrency: Record<string, number>;
}

interface SalesMapping {
  date: string;
  amount: string;
  product: string;
  currencyMode: 'fixed' | 'column';
  currencyFixed: string;
  currencyColumn: string;
  note: string;
}

const CURRENCIES = ['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU'];

function EditClientContent() {
  const { clientId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[] | null>(null);
  const [metaAccountsError, setMetaAccountsError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    condition_value: 0,
    date_preset: 'last_7d',
    notify_email: true,
    notify_inapp: true,
    notify_emails_raw: '',
  });
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [uploadStep, setUploadStep] = useState<'idle' | 'mapping' | 'saving'>('idle');
  const [csvText, setCsvText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<SalesMapping>({
    date: '',
    amount: '',
    product: '',
    currencyMode: 'fixed',
    currencyFixed: 'USD',
    currencyColumn: '',
    note: '',
  });

  const [form, setForm] = useState({
    name: '',
    industry: '',
    description: '',
    objectives: '',
    budget: '',
    kpis: '',
    restrictions: '',
    google_ads_account_id: '',
    meta_ads_account_id: '',
    logo_url: '',
    google_analytics_property_id: '',
  });

  function loadGoogleAccounts() {
    fetch(`/api/google/accounts?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setAccountsError(data.error);
        else setAccounts(data);
      })
      .catch(() => setAccountsError('Error al cargar cuentas'));
  }

  function loadMetaAccounts() {
    fetch(`/api/meta/accounts?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setMetaAccountsError(data.error);
        else setMetaAccounts(data);
      })
      .catch(() => setMetaAccountsError('Error al cargar cuentas de Meta'));
  }

  function loadAlerts() {
    fetch(`/api/alerts?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  async function toggleAlert(alertId: string, isActive: boolean) {
    await fetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, is_active: !isActive } : a));
  }

  async function deleteAlert(alertId: string, alertName: string) {
    if (!confirm(`¿Eliminar la alerta "${alertName}"?`)) return;
    await fetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  function openEdit(alert: Alert) {
    setEditingId(alert.id);
    setEditForm({
      condition_value: alert.condition_value,
      date_preset: alert.date_preset,
      notify_email: alert.notify_email,
      notify_inapp: alert.notify_inapp,
      notify_emails_raw: (alert.notify_emails ?? []).join(', '),
    });
  }

  async function saveEdit(alertId: string) {
    setEditSaving(true);
    const notify_emails = editForm.notify_emails_raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    await fetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        condition_value: editForm.condition_value,
        date_preset: editForm.date_preset,
        notify_email: editForm.notify_email,
        notify_inapp: editForm.notify_inapp,
        notify_emails,
      }),
    });
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, condition_value: editForm.condition_value, date_preset: editForm.date_preset, notify_email: editForm.notify_email, notify_inapp: editForm.notify_inapp, notify_emails }
          : a,
      ),
    );
    setEditSaving(false);
    setEditingId(null);
  }

  function loadSalesSummary() {
    setSalesLoading(true);
    fetch(`/api/clients/${clientId}/sales`)
      .then((res) => res.json())
      .then((data) => {
        setSalesSummary(data ?? null);
        setSalesLoading(false);
      })
      .catch(() => setSalesLoading(false));
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvError(null);
    const text = await file.text();
    const res = await fetch(`/api/clients/${clientId}/sales/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: text }),
    });
    const data = await res.json();
    if (!res.ok) { setCsvError(data.error); return; }
    setCsvText(text);
    setCsvHeaders(data.headers);
    setCsvPreview(data.preview);
    setMapping({ date: '', amount: '', product: '', currencyMode: 'fixed', currencyFixed: 'USD', currencyColumn: '', note: '' });
    setUploadStep('mapping');
  }

  async function handleSaveCSV() {
    setUploadStep('saving');
    setCsvError(null);
    const res = await fetch(`/api/clients/${clientId}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText, mapping }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCsvError(data.error);
      setUploadStep('mapping');
      return;
    }
    setUploadStep('idle');
    loadSalesSummary();
  }

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((data) =>
        setForm({
          name: data.name ?? '',
          industry: data.industry ?? '',
          description: data.description ?? '',
          objectives: data.objectives ?? '',
          budget: data.budget ?? '',
          kpis: data.kpis ?? '',
          restrictions: data.restrictions ?? '',
          google_ads_account_id: data.google_ads_account_id ?? '',
          meta_ads_account_id: data.meta_ads_account_id ?? '',
          logo_url: data.logo_url ?? '',
          google_analytics_property_id: data.google_analytics_property_id ?? '',
        }),
      );

    fetch(`/api/google/status?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        setGoogleConnected(data.connected);
        if (data.connected) loadGoogleAccounts();
      });

    fetch(`/api/meta/status?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        setMetaConnected(data.connected);
        if (data.connected) loadMetaAccounts();
      });

    loadSalesSummary();
    loadAlerts();
  }, [clientId]);

  // Manejar el callback de OAuth: el backend redirige de vuelta a esta página
  // con ?google=connected o ?meta=connected después de autorizar.
  useEffect(() => {
    const googleParam = searchParams.get('google');
    if (googleParam === 'connected') {
      setGoogleConnected(true);
      loadGoogleAccounts();
      router.replace(`/clients/${clientId}/edit`);
    } else if (googleParam === 'error') {
      alert('Error al conectar Google Ads. Intentá de nuevo.');
      router.replace(`/clients/${clientId}/edit`);
    } else if (googleParam === 'no_refresh_token') {
      alert('Google no emitió un refresh token. Desconectá la app desde tu cuenta de Google y volvé a conectar.');
      router.replace(`/clients/${clientId}/edit`);
    }

    const metaParam = searchParams.get('meta');
    if (metaParam === 'connected') {
      setMetaConnected(true);
      loadMetaAccounts();
      router.replace(`/clients/${clientId}/edit`);
    } else if (metaParam === 'error') {
      const reason = searchParams.get('r');
      const detail = searchParams.get('e'); // ya viene decodificado por URLSearchParams
      let msg = 'Error al conectar Meta Ads. Intentá de nuevo.';
      if (reason === 'auth') {
        msg = 'La sesión no coincide con la autorización. Cerrá sesión, volvé a entrar y reintentá.';
      } else if (reason === 'token') {
        msg =
          'Meta rechazó la conexión.' +
          (detail ? `\n\nDetalle: ${detail}` : '') +
          '\n\nSi la app está en modo desarrollo, agregá tu usuario como tester en Meta for Developers antes de conectar.';
      } else if (detail) {
        msg += `\n\nDetalle: ${detail}`;
      }
      alert(msg);
      router.replace(`/clients/${clientId}/edit`);
    }
  }, [searchParams]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    // La moneda no la elige el analista: la tomamos de la cuenta seleccionada
    // (Google/Meta ya la devuelven). Solo la seteamos si la lista de cuentas ya
    // cargó, para no pisar el valor guardado con null por una carga pendiente.
    const payload: Record<string, any> = { ...form };
    if (accounts) {
      payload.google_ads_currency =
        accounts.find((a) => a.id === form.google_ads_account_id)?.currency ?? null;
    }
    if (metaAccounts) {
      payload.meta_ads_currency =
        metaAccounts.find((a) => a.id === form.meta_ads_account_id)?.currency ?? null;
    }

    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json().catch(() => null);
      const detalle = data?.error ? `\n\nDetalle: ${data.error}` : '';
      alert(`Error al guardar${detalle}`);
      setLoading(false);
    }
  };

  const isNew = searchParams.get('new') === '1';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => router.push('/dashboard')}
        >
          ←
        </button>
        <h1 className={styles.headerTitle}>{isNew ? 'Nuevo Cliente' : 'Editar Cliente'}</h1>
      </header>

      {isNew && (
        <div className={styles.newClientBanner}>
          ¡Cliente creado! Conectá sus cuentas de Meta Ads y Google Ads para que Jair pueda consultar datos en tiempo real.
        </div>
      )}
      <main className={styles.main}>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              Nombre <span className={styles.required}>*</span>
            </label>
            <input
              className={styles.input}
              name="name"
              placeholder="Ej: Nike Argentina"
              value={form.name}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Industria</label>
            <input
              className={styles.input}
              name="industry"
              placeholder="Ej: E-commerce de indumentaria"
              value={form.industry}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Logo del cliente (URL)</label>
            <input
              className={styles.input}
              name="logo_url"
              placeholder="https://ejemplo.com/logo.png"
              value={form.logo_url}
              onChange={handleChange}
            />
            {form.logo_url && (
              <img
                src={form.logo_url}
                alt="Vista previa del logo"
                style={{ height: 40, marginTop: 8, objectFit: 'contain', borderRadius: 4 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descripción del negocio</label>
            <textarea
              className={styles.textarea}
              name="description"
              placeholder="¿A qué se dedica el cliente?"
              value={form.description}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Objetivos</label>
            <textarea
              className={styles.textarea}
              name="objectives"
              placeholder="Ej: Conversiones, reducción de CPA"
              value={form.objectives}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Presupuesto mensual</label>
            <input
              className={styles.input}
              name="budget"
              placeholder="Ej: $5000 USD/mes"
              value={form.budget}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>KPIs prioritarios</label>
            <textarea
              className={styles.textarea}
              name="kpis"
              placeholder="Ej: CPA, ROAS, CTR"
              value={form.kpis}
              onChange={handleChange}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Restricciones</label>
            <textarea
              className={styles.textarea}
              name="restrictions"
              placeholder="Qué evitar, qué no mencionar"
              value={form.restrictions}
              onChange={handleChange}
            />
          </div>

          {/* ── Sección Google Ads ── */}
          <div className={styles.accountsSection}>
            <p className={styles.accountsSectionTitle}>Cuenta de Google Ads</p>

            {googleConnected === false && (
              <>
                <p className={styles.accountsHint}>
                  Esta cuenta no tiene Google Ads conectado todavía.
                </p>
                <a
                  href={`/api/google/auth?clientId=${clientId}`}
                  className={styles.connectButton}
                >
                  Conectar Google Ads
                </a>
              </>
            )}

            {googleConnected === true && accountsError && (
              <p className={styles.accountsHint}>
                No se pudieron cargar las cuentas. Verificá que el token de Google esté vigente.
              </p>
            )}

            {googleConnected === true && !accounts && !accountsError && (
              <p className={styles.accountsHint}>Cargando cuentas...</p>
            )}

            {accounts && accounts.length === 0 && (
              <p className={styles.accountsHint}>
                No se encontraron cuentas de Google Ads accesibles con tu token.
              </p>
            )}

            {accounts && accounts.length > 0 && (
              <div className={styles.accountsList}>
                <button
                  type="button"
                  className={`${styles.accountCard} ${!form.google_ads_account_id ? styles.accountCardSelected : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, google_ads_account_id: '' }))}
                >
                  <span className={styles.accountName}>Sin vincular</span>
                </button>

                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.accountCard} ${form.google_ads_account_id === account.id ? styles.accountCardSelected : ''}`}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, google_ads_account_id: account.id }))
                    }
                  >
                    <span className={styles.accountName}>
                      {account.name} ({account.id})
                    </span>
                    <span className={styles.accountMeta}>
                      {[account.currency, account.is_manager ? 'MCC' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {googleConnected === true && (
              <a
                href={`/api/google/auth?clientId=${clientId}`}
                className={styles.reconnectButton}
              >
                Reconectar Google Ads
              </a>
            )}

            <div className={styles.field} style={{ marginTop: 16 }}>
              <label className={styles.label}>
                Google Analytics Property ID
              </label>
              <input
                className={styles.input}
                name="google_analytics_property_id"
                placeholder="Ej: 123456789"
                value={form.google_analytics_property_id}
                onChange={handleChange}
              />
              <p className={styles.accountsHint} style={{ marginTop: 4 }}>
                Se encuentra en GA4 → Administración → Propiedad → Detalles de la propiedad. Solo el número, sin el prefijo "properties/".
                {googleConnected && !form.google_analytics_property_id && ' Una vez ingresado, Jair podrá cruzar datos del sitio con las campañas.'}
                {googleConnected && form.google_analytics_property_id && ' El cliente necesita reconectar Google si la conexión es anterior a hoy (para incluir el scope de Analytics).'}
              </p>
            </div>
          </div>

          {/* ── Sección Meta Ads ── */}
          <div className={styles.accountsSection}>
            <p className={styles.accountsSectionTitle}>Cuenta de Meta Ads</p>

            {metaConnected === false && (
              <>
                <p className={styles.accountsHint}>
                  Esta cuenta no tiene Meta Ads conectado todavía.
                </p>
                <a
                  href={`/api/meta/auth?clientId=${clientId}`}
                  className={styles.connectButton}
                >
                  Conectar Meta Ads
                </a>
              </>
            )}

            {metaConnected === true && !metaAccounts && !metaAccountsError && (
              <p className={styles.accountsHint}>Cargando cuentas...</p>
            )}

            {metaAccountsError && (
              <p className={styles.accountsHint}>
                No se pudieron cargar las cuentas. Verificá que el token de Meta esté vigente.
              </p>
            )}

            {metaAccounts && metaAccounts.length === 0 && (
              <p className={styles.accountsHint}>
                No se encontraron cuentas de Meta Ads accesibles con tu token.
              </p>
            )}

            {metaAccounts && metaAccounts.length > 0 && (
              <div className={styles.accountsList}>
                <button
                  type="button"
                  className={`${styles.accountCard} ${!form.meta_ads_account_id ? styles.accountCardSelected : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, meta_ads_account_id: '' }))}
                >
                  <span className={styles.accountName}>Sin vincular</span>
                </button>

                {metaAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.accountCard} ${form.meta_ads_account_id === account.id ? styles.accountCardSelected : ''}`}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, meta_ads_account_id: account.id }))
                    }
                  >
                    <span className={styles.accountName}>
                      {account.name} ({account.id})
                    </span>
                    <span className={styles.accountMeta}>{account.currency}</span>
                  </button>
                ))}
              </div>
            )}

            {metaConnected === true && (
              <a
                href={`/api/meta/auth?clientId=${clientId}`}
                className={styles.reconnectButton}
              >
                Reconectar Meta Ads
              </a>
            )}
          </div>

          {/* ── Sección Datos de Ventas ── */}
          <div className={styles.accountsSection}>
            <p className={styles.accountsSectionTitle}>Datos de Ventas Reales</p>

            {/* Estado: cargando */}
            {salesLoading && (
              <p className={styles.accountsHint}>Cargando...</p>
            )}

            {/* Estado: sin datos y sin upload en curso */}
            {!salesLoading && salesSummary === null && uploadStep === 'idle' && (
              <>
                <p className={styles.accountsHint}>
                  Subí un CSV con ventas reales para que Jair pueda calcular el ROAS verdadero independiente de Meta y Google.
                  Necesitás al menos una columna de <strong>fecha</strong> y una de <strong>monto</strong>. La columna de producto es opcional.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label className={styles.uploadLabel}>
                    Subir CSV de ventas
                    <input type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
                  </label>
                  <a
                    href="/ejemplo-ventas.csv"
                    download="ejemplo-ventas.csv"
                    className={styles.reconnectButton}
                  >
                    Descargar CSV de ejemplo
                  </a>
                </div>
              </>
            )}

            {/* Estado: hay datos */}
            {!salesLoading && salesSummary !== null && uploadStep === 'idle' && (
              <>
                <div className={styles.salesSummary}>
                  <span className={styles.salesSummaryTotal}>
                    {Object.entries(salesSummary.totalByCurrency)
                      .map(([currency, total]) => `${currency} ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
                      .join(' · ')}
                  </span>
                  <span>{salesSummary.rowCount} ventas · {salesSummary.dateRange.min} → {salesSummary.dateRange.max}</span>
                </div>
                <label className={styles.reconnectButton} style={{ cursor: 'pointer' }}>
                  Agregar más datos
                  <input type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
                </label>
              </>
            )}

            {/* Estado: mapping de columnas */}
            {uploadStep === 'mapping' && (
              <>
                <p className={styles.accountsHint}>Indicá qué columna del CSV corresponde a cada campo.</p>

                <div className={styles.mappingGrid}>
                  <div className={styles.mappingField}>
                    <label className={styles.mappingLabel}>Fecha *</label>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.date}
                      onChange={(e) => setMapping((m) => ({ ...m, date: e.target.value }))}
                    >
                      <option value="">— elegir columna —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className={styles.mappingField}>
                    <label className={styles.mappingLabel}>Monto *</label>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.amount}
                      onChange={(e) => setMapping((m) => ({ ...m, amount: e.target.value }))}
                    >
                      <option value="">— elegir columna —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className={styles.mappingField}>
                    <label className={styles.mappingLabel}>Producto (opcional)</label>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.product}
                      onChange={(e) => setMapping((m) => ({ ...m, product: e.target.value }))}
                    >
                      <option value="">— ninguna —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className={styles.mappingField}>
                    <label className={styles.mappingLabel}>Moneda</label>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.currencyFixed}
                      onChange={(e) => setMapping((m) => ({ ...m, currencyFixed: e.target.value, currencyMode: 'fixed' }))}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.mappingField} style={{ gridColumn: '1 / -1' }}>
                  <label className={styles.mappingLabel}>Nota (opcional)</label>
                  <input
                    className={styles.mappingSelect}
                    type="text"
                    placeholder='Ej: "Ventas reales mayo 2026", "Test", "Shopify Q1"'
                    value={mapping.note}
                    onChange={(e) => setMapping((m) => ({ ...m, note: e.target.value }))}
                  />
                </div>

                <div className={styles.previewWrapper}>
                  <p className={styles.accountsHint}>Vista previa — primeras {csvPreview.length} filas</p>
                  <div className={styles.previewScroll}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>{csvHeaders.map((h) => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {csvError && <p className={styles.accountsHint} style={{ color: 'var(--danger)' }}>{csvError}</p>}

                <div className={styles.mappingActions}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveCSV}
                    disabled={!mapping.date || !mapping.amount}
                  >
                    Confirmar e importar
                  </button>
                  <button className={styles.cancelButton} onClick={() => { setUploadStep('idle'); setCsvError(null); }}>
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {/* Estado: guardando */}
            {uploadStep === 'saving' && (
              <p className={styles.accountsHint}>Importando datos...</p>
            )}
          </div>

          {/* ── Sección Alertas ── */}
          <div className={styles.accountsSection}>
            <p className={styles.accountsSectionTitle}>Alertas personalizadas</p>

            {alerts.length === 0 ? (
              <p className={styles.accountsHint}>
                No hay alertas configuradas para este cliente. Pedíselas a Jair en el chat: <em>"Creame una alerta si el CPA supera $50"</em>.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: alert.is_active ? 1 : 0.5,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Fila principal */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                          {alert.name}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {conditionLabel(alert.condition_type, alert.condition_value)}
                          {' · '}{alert.date_preset}
                          {(alert.notify_email || alert.notify_inapp) && ' · '}
                          {[alert.notify_email && 'mail', alert.notify_inapp && 'in-app'].filter(Boolean).join(' · ')}
                          {alert.notify_emails?.length > 0 && ` → ${alert.notify_emails.join(', ')}`}
                          {alert.last_triggered_at && ` · disparada ${new Date(alert.last_triggered_at).toLocaleDateString('es-AR')}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          className={styles.reconnectButton}
                          onClick={() => editingId === alert.id ? setEditingId(null) : openEdit(alert)}
                        >
                          {editingId === alert.id ? 'Cerrar' : 'Editar'}
                        </button>
                        <button
                          className={styles.reconnectButton}
                          onClick={() => toggleAlert(alert.id, alert.is_active)}
                        >
                          {alert.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          className={styles.cancelButton}
                          onClick={() => deleteAlert(alert.id, alert.name)}
                          style={{ fontSize: 12, padding: '6px 10px' }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    {/* Formulario de edición inline */}
                    {editingId === alert.id && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                              Valor umbral
                            </label>
                            <input
                              type="number"
                              className={styles.input}
                              value={editForm.condition_value}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, condition_value: parseFloat(e.target.value) || 0 }))}
                              style={{ padding: '6px 10px', fontSize: 13 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                              Período
                            </label>
                            <select
                              className={styles.mappingSelect}
                              value={editForm.date_preset}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, date_preset: e.target.value }))}
                            >
                              <option value="last_7d">Últimos 7 días</option>
                              <option value="last_14d">Últimos 14 días</option>
                              <option value="last_30d">Últimos 30 días</option>
                              <option value="this_month">Este mes</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                            Destinatarios de email adicionales (separados por coma)
                          </label>
                          <input
                            type="text"
                            className={styles.input}
                            placeholder="cliente@empresa.com, otro@empresa.com"
                            value={editForm.notify_emails_raw}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, notify_emails_raw: e.target.value }))}
                            style={{ padding: '6px 10px', fontSize: 13 }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={editForm.notify_email}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, notify_email: e.target.checked }))}
                            />
                            Notificar por mail
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={editForm.notify_inapp}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, notify_inapp: e.target.checked }))}
                            />
                            Notificación in-app
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className={styles.saveButton}
                            onClick={() => saveEdit(alert.id)}
                            disabled={editSaving}
                            style={{ fontSize: 13, padding: '6px 14px' }}
                          >
                            {editSaving ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            className={styles.cancelButton}
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: 13, padding: '6px 10px' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveButton}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => router.push('/dashboard')}
            >
              Cancelar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function EditClientPage() {
  return (
    <Suspense>
      <EditClientContent />
    </Suspense>
  );
}
