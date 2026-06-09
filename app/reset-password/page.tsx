'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from '../login/login.module.css';
import MegabaitLogo from '@/components/MegabaitLogo';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) { setStep('error'); return; }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setStep('error');
      else setStep('form');
    });
  }, []);

  const handleSubmit = async () => {
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError('No se pudo actualizar la contraseña. El link puede haber expirado.');
      setLoading(false);
    } else {
      setStep('success');
      setTimeout(() => router.push('/dashboard'), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.box}>
        <div className={styles.logo}>
          <MegabaitLogo height={44} />
        </div>

        {step === 'loading' && (
          <p className={styles.forgotHint}>Verificando...</p>
        )}

        {step === 'error' && (
          <div className={styles.form}>
            <p className={styles.error}>
              El link de recuperación no es válido o ya expiró. Solicitá uno nuevo desde el login.
            </p>
            <button className={styles.submitButton} onClick={() => router.push('/login')}>
              Volver al login
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className={styles.form}>
            <p className={styles.forgotHint}>Ingresá tu nueva contraseña.</p>
            <div className={styles.field}>
              <label className={styles.label}>Nueva contraseña</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirmar contraseña</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.submitButton} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        )}

        {step === 'success' && (
          <p className={styles.success}>¡Contraseña actualizada! Redirigiendo...</p>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
