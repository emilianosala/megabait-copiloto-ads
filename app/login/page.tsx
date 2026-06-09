'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './login.module.css';
import MegabaitLogo from '@/components/MegabaitLogo';

function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos';
  if (m.includes('email not confirmed')) return 'Confirmá tu email antes de ingresar. Revisá tu bandeja de entrada.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email. ¿Querés ingresar?';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres';
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'El formato del email no es válido';
  if (m.includes('signup is disabled')) return 'El registro está deshabilitado momentáneamente';
  if (m.includes('rate limit')) return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  return 'Ocurrió un error. Intentá de nuevo.';
}

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => { setError(''); setSuccess(''); };

  const handleSubmit = async () => {
    reset();
    setLoading(true);

    if (view === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(authError(error.message));
      else { router.push('/dashboard'); router.refresh(); }

    } else if (view === 'register') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(authError(error.message));
      else setSuccess('¡Cuenta creada! Revisá tu email para confirmar.');

    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(authError(error.message));
      else setSuccess('Te enviamos un email con el link de recuperación. Revisá tu bandeja.');
    }

    setLoading(false);
  };

  const switchView = (v: typeof view) => { setView(v); reset(); };

  return (
    <div className={styles.container}>
      <div className={styles.box}>
        <div className={styles.logo}>
          <MegabaitLogo height={44} />
        </div>

        {view !== 'forgot' ? (
          <>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${view === 'login' ? styles.tabActive : ''}`}
                onClick={() => switchView('login')}
              >
                Ingresar
              </button>
              <button
                className={`${styles.tab} ${view === 'register' ? styles.tabActive : ''}`}
                onClick={() => switchView('register')}
              >
                Registrarse
              </button>
            </div>

            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Contraseña</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {view === 'login' && (
                <button
                  type="button"
                  className={styles.forgotLink}
                  onClick={() => switchView('forgot')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}

              {error && <p className={styles.error}>{error}</p>}
              {success && <p className={styles.success}>{success}</p>}

              <button
                className={styles.submitButton}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Cargando...' : view === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.form}>
            <p className={styles.forgotHint}>
              Ingresá tu email y te mandamos un link para restablecer tu contraseña.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}
            {success && <p className={styles.success}>{success}</p>}

            <button className={styles.submitButton} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar email de recuperación'}
            </button>
            <button
              type="button"
              className={styles.forgotLink}
              onClick={() => switchView('login')}
            >
              ← Volver al login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
