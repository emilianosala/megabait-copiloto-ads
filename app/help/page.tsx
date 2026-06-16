'use client';

import { useRouter } from 'next/navigation';
import styles from './help.module.css';
import MegabaitLogo from '@/components/MegabaitLogo';

const SECTIONS = [
  {
    title: 'Análisis de campañas',
    icon: '📊',
    description: 'Pedile a Jair que analice el rendimiento de tus campañas activas o pausadas.',
    examples: [
      '¿Cómo vienen las campañas del último mes?',
      '¿Cuál es la campaña con mejor ROAS?',
      'Compará el CPA de esta semana vs la anterior',
      '¿Qué campañas tienen datos insuficientes para evaluar?',
    ],
  },
  {
    title: 'ROAS real y ventas',
    icon: '💰',
    description: 'Si cargaste datos de ventas (CSV), Jair puede calcular el ROAS verdadero del negocio, independiente de lo que reporta Meta o Google.',
    examples: [
      '¿Cuál fue el ROAS real del mes pasado?',
      'Cruzá el gasto en Meta con las ventas reales',
      '¿Cuánto vendimos la semana del 5 al 11 de mayo?',
      'Comparame el ROAS de Meta vs el ROAS real del negocio',
    ],
  },
  {
    title: 'Diagnóstico y optimización',
    icon: '🔍',
    description: 'Jair aplica criterios analíticos antes de recomendar. No va a pausar campañas sin datos suficientes ni proponer cambios masivos.',
    examples: [
      'El CPA subió mucho esta semana, ¿qué puede estar pasando?',
      '¿Tiene sentido escalar el presupuesto de esta campaña?',
      '¿Qué ad sets están todavía en fase de aprendizaje?',
      'Revisá si hay alguna campaña que valga la pena pausar',
    ],
  },
  {
    title: 'Reportes interactivos',
    icon: '📋',
    description: 'Jair genera reportes con gráficos que se abren en una página separada. Son interactivos (podés cambiar el período), exportables a PDF y compartibles con el cliente — solo copiás el link desde el botón "Copiar link" del reporte, sin que el cliente tenga que loguearse.',
    examples: [
      'Armame un reporte del último mes con gráfico de campañas y ventas',
      'Generame un informe para compartir con el cliente',
      'Creame un reporte con torta de distribución de gasto y evolución de ventas semanal',
      'Armame un reporte con barras azules para Meta y rojas para ventas',
    ],
  },
  {
    title: 'Tipos de gráficos disponibles',
    icon: '📈',
    description: 'Podés pedirle a Jair que use distintos tipos de visualización en los reportes.',
    items: [
      { label: 'Barras', desc: 'Comparación de campañas o períodos' },
      { label: 'Línea', desc: 'Evolución temporal de ventas o métricas' },
      { label: 'Torta / donut', desc: 'Distribución porcentual entre campañas' },
      { label: 'Tabla', desc: 'Detalle completo de campañas con todas las métricas' },
      { label: 'Cards de KPIs', desc: 'Métricas clave en formato destacado' },
    ],
  },
  {
    title: 'Colores en reportes',
    icon: '🎨',
    description: 'Al pedir un reporte podés especificar los colores de cada gráfico.',
    items: [
      { label: 'Verde neon', desc: '#39ff14 — default para Meta Ads', color: '#39ff14' },
      { label: 'Dorado', desc: '#FFD700 — default para ventas', color: '#FFD700' },
      { label: 'Azul', desc: '#00bfff', color: '#00bfff' },
      { label: 'Rojo coral', desc: '#ff6b6b', color: '#ff6b6b' },
      { label: 'Violeta', desc: '#b39ddb', color: '#b39ddb' },
      { label: 'Naranja', desc: '#ffcc80', color: '#ffcc80' },
    ],
  },
  {
    title: 'Estrategia y planificación',
    icon: '🧠',
    description: 'Jair también puede ayudarte a pensar estratégicamente, no solo a analizar datos.',
    examples: [
      '¿Cómo deberíamos encarar el Black Friday para este cliente?',
      'Proponé una estructura de campañas para lanzar un producto nuevo',
      '¿Qué ángulos de creativo probarías para reducir el CPA?',
      'Ayudame a armar un brief para el equipo creativo',
    ],
  },
  {
    title: 'Alertas personalizadas',
    icon: '🔔',
    description: 'Configurá alertas automáticas pidiéndoselas a Jair. Se evalúan diariamente y te notifican por mail y en la app cuando se disparan.',
    examples: [
      'Creame una alerta si el CPA de Meta supera $50 USD esta semana',
      'Avisame si el gasto en Google supera $1000 en los últimos 7 días',
      'Alerta si el CTR de Meta cae debajo del 1%',
      'Notificame si las ventas semanales caen debajo de $5000',
      'Desactivame las notificaciones por mail de esa alerta',
    ],
  },
  {
    title: 'Limitaciones actuales',
    icon: '⚠️',
    description: 'Cosas que Jair todavía no puede hacer (pero están en el roadmap):',
    items: [
      { label: 'Ejecutar cambios en cuentas', desc: 'Jair propone, el analista aprueba y ejecuta en la plataforma' },
      { label: 'Notificaciones push en el celular', desc: 'Próximamente vía PWA' },
    ],
  },
];

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => router.push('/dashboard')}>←</button>
        <MegabaitLogo height={26} />
        <h1 className={styles.title}>¿Qué puede hacer Jair?</h1>
      </header>

      <div className={styles.body}>
        <p className={styles.intro}>
          Jair es tu analista senior de publicidad digital. Tiene acceso a tus datos de Meta Ads y ventas reales, y aplica criterios analíticos antes de recomendar cualquier acción. Esta guía resume todo lo que podés pedirle.
        </p>

        <div className={styles.grid}>
          {SECTIONS.map((section) => (
            <div key={section.title} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>{section.icon}</span>
                <h2 className={styles.cardTitle}>{section.title}</h2>
              </div>
              <p className={styles.cardDesc}>{section.description}</p>

              {section.examples && (
                <ul className={styles.examples}>
                  {section.examples.map((ex) => (
                    <li key={ex} className={styles.example}>
                      <span className={styles.exampleQuote}>"{ex}"</span>
                    </li>
                  ))}
                </ul>
              )}

              {section.items && (
                <ul className={styles.items}>
                  {section.items.map((item) => (
                    <li key={item.label} className={styles.item}>
                      {'color' in item && (
                        <span className={styles.colorDot} style={{ background: item.color }} />
                      )}
                      <span className={styles.itemLabel}>{item.label}</span>
                      <span className={styles.itemDesc}>{item.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <p className={styles.footer}>
          Jair es un agente de Megabait. Nunca ejecuta cambios directamente — siempre propone y el analista aprueba.
        </p>
      </div>
    </div>
  );
}
