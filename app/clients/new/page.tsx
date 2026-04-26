'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../client-form.module.css';

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    industry: '',
    description: '',
    objectives: '',
    budget: '',
    kpis: '',
    restrictions: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      alert('Error al guardar el cliente');
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
        <h1 className={styles.headerTitle}>Nuevo Cliente</h1>
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
          <div className={styles.googleAdsNote}>
            Podrás vincular cuentas de Google Ads y Meta Ads después de crear el
            cliente, desde la sección de edición.
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveButton}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar Cliente'}
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
