'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

export default function EditClientPage() {
  const { clientId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[] | null>(null);
  const [metaAccountsError, setMetaAccountsError] = useState<string | null>(null);
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

    fetch('/api/google/accounts')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setAccountsError(data.error);
        } else {
          setAccounts(data);
        }
      })
      .catch(() => setAccountsError('Error al cargar cuentas'));

    fetch('/api/meta/status')
      .then((res) => res.json())
      .then((data) => {
        setMetaConnected(data.connected);
        if (data.connected) {
          fetch('/api/meta/accounts')
            .then((res) => res.json())
            .then((accounts) => {
              if (accounts.error) {
                setMetaAccountsError(accounts.error);
              } else {
                setMetaAccounts(accounts);
              }
            })
            .catch(() => setMetaAccountsError('Error al cargar cuentas de Meta'));
        }
      });
  }, [clientId]);

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

            {accountsError === 'Google Ads no conectado' && (
              <p className={styles.accountsHint}>
                Conectá Google Ads desde el dashboard para poder vincular una cuenta.
              </p>
            )}

            {accountsError && accountsError !== 'Google Ads no conectado' && (
              <p className={styles.accountsHint}>
                No se pudieron cargar las cuentas. Verificá que el token de Google esté vigente.
              </p>
            )}

            {!accounts && !accountsError && (
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
                      {[
                        account.currency,
                        account.is_manager ? 'MCC' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sección Meta Ads ── */}
          <div className={styles.accountsSection}>
            <p className={styles.accountsSectionTitle}>Cuenta de Meta Ads</p>

            {metaConnected === false && (
              <p className={styles.accountsHint}>
                Conectá Meta Ads desde el dashboard para poder vincular una cuenta.
              </p>
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
                    <span className={styles.accountMeta}>
                      {account.currency}
                    </span>
                  </button>
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
