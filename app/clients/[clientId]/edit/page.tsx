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
      alert('Error al conectar Meta Ads. Intentá de nuevo.');
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
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      alert('Error al guardar');
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => router.push('/dashboard')}
        >
          ←
        </button>
        <h1 className={styles.headerTitle}>Editar Cliente</h1>
      </header>
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
