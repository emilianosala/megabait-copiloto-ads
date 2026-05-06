# MEGABAIT COPILOTO ADS — Plan de acción

## Stack

- Next.js (App Router, TypeScript, CSS Modules)
- Supabase (PostgreSQL + Auth + RLS)
- Anthropic API (Claude Sonnet)
- Deploy: Vercel → ads.megabait.com.ar

## Marco estratégico

Esto es un **SaaS para agencias y analistas**, no una herramienta personal. La existencia de los MCPs oficiales de Google Ads (oct/2025) y Meta Ads (29/abr/2026) **no compiten con tu producto** — compiten con la capa de "API access" que vos podrías delegar en ellos.

Tu valor no es el acceso a las APIs. Tu valor es: contexto persistente por cliente, criterio analítico codificado en el prompt, multi-tenant, history conversacional, cruce con datos de ventas reales, y action approval. Eso ningún MCP te lo da.

Regla mental: cada decisión técnica debe responder "¿esto agrega a la capa de producto, o reinvento plomería que un MCP ya hace?"

---

## ✅ COMPLETADO

### Infraestructura y deploy
- Deploy en Vercel funcionando
- Subdominio `ads.megabait.com.ar` con CNAME en Cloudflare
- Supabase URL Configuration con subdominio de producción

### Autenticación
- Login y registro con Supabase Auth
- Middleware de protección de rutas
- RLS habilitado en todas las tablas

### CRUD de clientes
- Crear, editar, eliminar clientes
- Campos: nombre, industria, descripción, objetivos, presupuesto, KPIs, restricciones
- `google_ads_account_id` y `meta_ads_account_id` por cliente

### Chat con IA
- Chat por cliente con contexto persistente del perfil
- Historial guardado en Supabase
- Contexto del cliente inyectado en el system prompt
- Streaming de respuestas
- Botón de detener
- Shift+Enter para nueva línea

### Integración Google Ads
- OAuth flow completo (auth → callback → guarda refresh_token)
- Métricas de últimos 30 días en system prompt
- Estado de conexión visible en dashboard

### Integración Meta Ads
- App en Meta for Developers con caso de uso "Marketing API"
- OAuth flow completo, token de larga duración (~60 días)
- Tool Use con `get_meta_account_insights` y `get_meta_campaigns`
- Loop que soporta múltiples llamadas encadenadas
- Estado de conexión visible en dashboard

### Base de datos
- Tablas: `clients`, `conversations`, `google_connections`, `meta_connections`
- RLS en todas
- `meta_ads_account_id` en `clients`

### Páginas legales
- `/privacy` y `/terms` en megabait.com.ar
- Links en footer

---

## 🔴 P0 — URGENTE: Seguridad

Rotar credenciales expuestas en el breach de Vercel (abril 2026) y marcarlas como **Sensitive** (encriptadas, no legibles desde admin UI).

Orden de rotación, de mayor a menor riesgo:
1. `ANTHROPIC_API_KEY` → console.anthropic.com → API Keys → crear nueva → eliminar anterior
2. `SUPABASE_SERVICE_ROLE_KEY` → Supabase → Settings → API → regenerar
3. `GOOGLE_CLIENT_SECRET` → Google Cloud Console → Credentials → Reset secret
4. `GOOGLE_ADS_DEVELOPER_TOKEN` → Google Ads API Center → verificar rotación
5. `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase → Settings → API → regenerar
6. `META_APP_SECRET` → ya marcada Sensitive, verificar que no haya sido comprometida
7. `META_APP_ID` y `META_REDIRECT_URI` → ya Sensitive

---

## ⏳ Bloqueantes externos

- **Google Ads Developer Token**: rechazado por uso de Gmail. Pendiente configurar email corporativo `@megabait.com.ar` (Google Workspace o Zoho Mail) y reaplicar. **Menos crítico ahora** — si migrás a usar el Google Ads MCP oficial para análisis (read-only), el Developer Token solo lo necesitás para escribir.
- **Email corporativo**: necesario para reaplicar al Developer Token y actualizar Privacy Policy + Terms.

---

## 📋 P1 — System prompt rediseñado

Convertir el agente de "chat con contexto" a "analista senior de marketing digital con criterio Megabait". **Este es tu moat más grande junto con P2** — cuando un competidor pueda hacer un MVP en una tarde con MCPs + Claude Desktop, lo que separa tu producto del de él es el criterio analítico que codifiques acá.

### Personalidad
- Analista senior con criterio propio
- No alarmista — pide contexto antes de diagnosticar
- No entra en pánico con datos anómalos sin preguntar primero
- Tono profesional pero accesible, en español

### Principios analíticos a internalizar
- **No pausar campañas sin significancia estadística suficiente** — bajo gasto + ROAS bajo puede no tener datos suficientes
- **Rendimientos decrecientes al escalar** — duplicar presupuesto no duplica resultados; el ROI tiende a bajar
- **Respetar tiempo de aprendizaje del algoritmo** — no evaluar campañas recién lanzadas
- **Ventanas de atribución extendidas** — ciclos de compra de 15-30+ días; rentabilidad a largo plazo
- **Calidad de creativo y oferta sobre optimización técnica** — 75% del éxito está en hook, ángulo y propuesta de valor
- **Distinguir métricas de vanidad** (likes, alcance) de **métricas de negocio** (ROAS, CPA, ingresos)
- **No consolidar ad sets sin entender si hay tests de audiencia en curso**

### Posicionamiento Megabait
- Visión cross-platform neutral: ni Google ni Meta, ve el journey completo
- Mide con las reglas del anunciante, no las de la plataforma
- Las herramientas nativas tienen perspectiva parcial por diseño
- Diferencial vs Madgicx, Birdeye, Triple Whale: contexto profundo del negocio + criterio analítico + neutralidad de plataforma

### Comportamiento esperado
- Datos anómalos → preguntar contexto antes de diagnosticar
- Datos insuficientes → decirlo explícitamente y pedir información manual
- Múltiples plataformas → cruzar y dar visión unificada
- Detectar oportunidad → proponer con justificación, no como orden

---

## 📋 P2 — Datos de ventas (tu diferencial más grande)

**Por qué subió de prioridad:** ningún MCP de plataforma te lo da. Es información del negocio del cliente, no de las plataformas. Es lo que permite el discurso "Meta dice $7k, Google dice $6k, en realidad facturaste $10k — hay $3k de solapamiento". Es lo que justifica que el cliente te pague mensual.

### Implementación por fases
1. **Fase 1: CSV upload** — universal, simple, funciona con cualquier negocio
2. **Fase 2: Shopify** — API directa, conector OAuth
3. **Fase 3: WooCommerce, Tiendanube, otros**

### Modelo de datos
- Tabla `sales_data`: `client_id`, fecha, monto, fuente (Shopify/manual/etc), producto opcional
- El agente cruza con métricas de plataformas para reportar ROAS real

---

## 📋 P3 — Billing y suscripciones

Sin esto no es SaaS, es proyecto.

- Stripe o Lemon Squeezy
- Pricing tentativo: por cliente/mes (ej: $30/cliente con tope de N consultas), o por agencia con tope de clientes
- Trial de 14 días
- Webhook → Supabase para gating de features según plan

---

## 📋 P4 — Onboarding wizard

Sin esto no podés onboardear usuarios reales sin acompañarlos a mano.

- Primer login → guía paso a paso: crear cliente → conectar Meta → conectar Google → primer chat
- Tutoriales contextuales en momentos clave
- Reduce drop-off enormemente

---

## 📋 P5 — Acciones con aprobación del analista

El agente detecta una oportunidad y propone una acción concreta. El analista aprueba o rechaza antes de que se ejecute.

### Flujo
1. Agente identifica optimización ("CPA 3x más alto que el promedio — recomiendo pausar")
2. Aparece como tarjeta en el chat con botones "Aprobar" / "Rechazar"
3. Si aprueba → se ejecuta via API
4. Registro en Supabase: acción, fecha, quién aprobó, resultado

### Acciones iniciales (Meta Ads)
- Pausar / activar campaña
- Modificar presupuesto diario
- Pausar / activar ad set

### Notas
- **Nunca** ejecución sin revisión humana
- El registro es importante para auditoría y para que el agente aprenda el historial de decisiones
- Esta feature se simplifica si P10 (Meta MCP) está maduro — usaríamos las write tools del MCP en lugar de construirlas. Si P10 no llegó, se construye con la integración custom actual extendida.

---

## ⚙️ En paralelo a P1-P5 — POC Meta MCP (time-boxed)

**Time-box estricto: 2 días.** No bloquea nada del roadmap principal.

### Objetivo del POC
- Confirmar que se puede conectar al MCP oficial de Meta (`mcp.facebook.com/ads`) desde el backend de Next.js
- Confirmar que el flow multi-tenant funciona: dos usuarios distintos del SaaS pueden autenticar sus respectivos Business Managers contra el mismo MCP server, y el agente puede consultar cada uno por separado

### Criterio de éxito
Un test que autentique dos Business Managers distintos y haga una query exitosa contra cada uno desde el backend.

### Si el POC anda
Se promueve a P6 oficial: migrar `lib/meta-ads.ts` y `lib/meta-oauth.ts` al MCP. Beneficios: 29 tools en lugar de 2, sin manejar tokens de 60 días, sin riesgo de suspensión, las features nuevas de Meta se heredan.

### Si el POC no anda en 2 días
Se archiva por 2-3 meses. La integración custom actual sigue funcionando. Se reevalúa cuando haya más documentación pública del patrón multi-tenant MCP.

---

## 📋 P6 — Migración Meta Ads a MCP (condicional al POC)

Solo si el POC del paralelo anterior fue exitoso. Plan de migración:
1. Reemplazar `get_meta_account_insights` y `get_meta_campaigns` por delegación al MCP
2. Ampliar a las 29 tools disponibles
3. Deprecar `lib/meta-ads.ts` y `lib/meta-oauth.ts`
4. Mantener tabla `meta_connections` adaptada (qué guarda cambia según el patrón MCP)

---

## 📋 P7 — Google Analytics 4

**Evaluar primero el MCP oficial de Google Analytics** (existe desde 2025). Si cubre el caso de uso, ahorrate la integración custom.

- OAuth flow con Google — puede reutilizar `google_connections` o crear `ga4_connections` separada
- GA4 Property ID por cliente en `clients`
- Métricas: sesiones, usuarios, conversion rate, fuente/medio, páginas más visitadas
- Estado de conexión en dashboard

Cuando esté integrado, el agente puede cruzar: Meta generó awareness → Google capturó intención → Analytics muestra conversión.

---

## 📋 P8 — Tool Use para Google Ads

Cuando llegue la aprobación del Developer Token Basic Access.

**Evaluar primero el MCP oficial de Google Ads.** Es read-only y solo expone `list_accessible_customers` + `search` (GAQL crudo). Conviene **envolverlo**: tu app expone a Claude tools de alto nivel (`get_campaign_performance`, `compare_periods`), por debajo cada tool ejecuta una query GAQL via el MCP. Buena DX + delegás auth/API a Google.

Para escritura: el MCP no soporta hoy → integración custom cuando llegue el Developer Token.

---

## 📋 P9 — Botón Reconectar OAuth

En el dashboard, junto a "Meta Ads conectado" / "Google Ads conectado", agregar botón secundario "Reconectar" que redirija al flow OAuth.

Permite agregar más Business Managers, actualizar tokens vencidos, cambiar de cuenta sin desconectar manualmente. Aplicar igual a GA4 cuando se implemente.

---

## 📋 P10 — Reporting estructurado

- Plantilla de reporte por cliente: secciones, métricas, orden
- Selector de fechas que dispara consultas a las APIs conectadas
- El agente genera el reporte: resumen ejecutivo, métricas clave, análisis por campaña, recomendaciones priorizadas
- Exportación PDF
- Más completo con GA4 (P7) y datos de ventas (P2) integrados

---

## 📋 P11 — Alertas proactivas

El salto conceptual de "chat reactivo" a "copiloto proactivo".

- Cron jobs (Vercel o Supabase Edge Functions) corren análisis periódicos
- Ejemplos: "El CPC de la campaña X subió 40% sin cambios en el copy", "El CTR bajó por debajo del benchmark histórico", "El token de Meta vence en 7 días"
- Sistema de notificaciones: email (Resend) o in-app

---

## 📋 P12 — Multi-tenancy real (team accounts)

Una agencia tiene N analistas con acceso a los mismos clientes.

- Tabla `agencies`; los `clients` cuelgan de la agencia, no del usuario individual
- Roles: admin de agencia / analista (quién puede conectar OAuth, quién puede aprobar acciones, quién solo ve)
- Aislamiento estricto entre agencias en RLS
- Subdominio o path por agencia (opcional, para white-label)
- Límites por plan: cantidad de clientes, mensajes/mes, integraciones

---

## 📋 P13 — Mejoras de CRUD y auth

- Asociar cuenta de Google Ads y Meta Ads al **crear** el cliente, no solo al editar
- Reset de contraseña
- Email transaccional: bienvenida, recuperación, alertas (Resend)
- Mejor manejo de errores en flujo de auth

---

## 📋 P14 — Marketing site y onboarding público

- Landing en `megabait.com.ar/copiloto` o subdomain
- Casos de uso, screenshots, comparativa explícita vs "Claude Desktop + MCPs"
- Copy clave: lo que tu producto hace y los MCPs solos no — multi-cliente, contexto persistente, criterio analítico Megabait, cruce con ventas reales

---

## 📋 P15 — Observabilidad

- Logging estructurado de tool calls (cuántas veces cada tool, qué errores, qué clientes)
- Métricas de uso por cliente (detectar churn + billing)
- Sentry u OpenObserve para errores

---

## 📋 P16 — Generación de creatividades con IA

El agente puede generar imágenes para campañas directamente desde el chat, basándose en contexto del cliente y rendimiento.

### Flujo
1. Analista describe la creatividad o el agente la propone basándose en datos
2. El agente construye un prompt optimizado para publicidad con contexto del cliente
3. Llamada a API de generación
4. Imagen aparece en el chat, se descarga para subir a Meta o Google Ads

### Tecnología
- **fal.ai con FLUX** → mejor relación calidad/precio para imágenes publicitarias
- Alternativa: Replicate

### Videos
Técnicamente posible (Runway, Kling AI), pero tiempo de generación + costo lo hacen inviable para v1.

### Nota de timing
Más valioso cuando P8 (Google Ads tools) y P7 (GA4) estén completos — así el agente propone creatividades basadas en insights reales, no solo en lo que el analista describe.

---

## Notas técnicas

- **CSS Modules en todo el proyecto** — no usar Tailwind
- **No regenerar Navbar ni Footer globales**
- **Cloudinary para imágenes**
- `.env.local` está en `.gitignore` — credenciales en Vercel Environment Variables
- **Versión Meta Graph API: v19.0**
- **El loop de Tool Use en `/app/api/chat/route.ts` soporta múltiples llamadas encadenadas** — no modificar esa estructura sin entenderla primero
- **`max_tokens` en la llamada a Anthropic está en 2048** para soportar el ciclo de tool use
- **MCP en backend**: si avanzás con P6, confirmar la implementación actual del Anthropic SDK para conectar a MCP servers remotos desde el backend (no Claude Desktop). Esa es la decisión técnica clave.
