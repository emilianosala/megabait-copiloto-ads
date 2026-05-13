# MEGABAIT COPILOTO ADS — Plan de acción

## Stack

- Next.js (App Router, TypeScript, CSS Modules)
- Supabase (PostgreSQL + Auth + RLS)
- Anthropic API (Claude Sonnet)
- Deploy: Vercel → ads.megabait.com.ar

---

## Marco estratégico

Esto es un **SaaS para agencias y analistas**, no una herramienta personal. La existencia de los MCPs oficiales de Google Ads (oct/2025) y Meta Ads (29/abr/2026) **no compiten con el producto** — compiten con la capa de "API access" que podemos delegar en ellos.

Pero algo más importante cambió en 2025-2026: **Meta empezó a banear cuentas que se conectan a MCPs no oficiales o que disparan patrones de automatización agresivos.** Los baneos son permanentes, el canal de apelación es opaco, y los agency operators están aterrados — con razón. Eso abrió un diferencial específico, medible y poco ocupado:

### El positioning del producto

> **"La forma segura de poner IA sobre tus cuentas de Meta y Google. Multi-cliente. Con criterio analítico. Sin que te baneen."**

Cada decisión técnica, de copy, de roadmap, debe pasar por el filtro: *¿esto refuerza o debilita la posición "Safe MCP"?*

---

## Pilares del producto

Cinco pilares que cualquier decisión de roadmap debería reforzar:

1. **Safe-MCP infrastructure** — solo MCPs oficiales, rate limiting backend, audit log, AI Content Label automático, action approval gates como requisito arquitectónico. Es **el moat principal**.
2. **Multi-tenant para agencias** — varios analistas trabajando los mismos clientes con contexto y historia compartidos. Claude Code + MCP es one-user-one-machine; tu producto no.
3. **Criterio analítico codificado** — system prompt nivel analista senior con principios estadísticos, atribución, posicionamiento Megabait. Diferencial frente a "Claude Desktop genérico".
4. **Cruce con datos de ventas reales** — ROAS verdadero independiente de las ventanas de atribución de cada plataforma. Ningún MCP de plataforma te lo da.
5. **Action approval gates** — nunca ejecución automática. Cada cambio en cuenta requiere aprobación humana explícita. Esto es UX **y** safety.

Cualquier pieza individual se puede copiar. El stack completo es mucho más difícil de clonar.

---

## Inteligencia de plataforma — Cómo nos mantenemos al día

Las reglas del juego cambian seguido. Para sostener la posición "Safe-MCP" hay que estar al tanto de novedades de Google, Meta y Anthropic — cambios en MCPs oficiales, ban waves nuevas, requisitos de disclosure, cambios de rate limits, etc.

### Fuentes a monitorear (cadencia semanal)

**Meta:**
- [Meta for Developers — Changelog](https://developers.facebook.com/docs/graph-api/changelog/)
- [Meta for Business Newsroom](https://www.facebook.com/business/news)
- [Meta Marketing API release notes](https://developers.facebook.com/docs/marketing-api/release-notes/)
- Repo oficial Meta Ads MCP (cuando esté público) y su issues tab

**Google:**
- [Google Ads Developer Blog](https://ads-developers.googleblog.com/)
- [Google Ads API release notes](https://developers.google.com/google-ads/api/docs/release-notes)
- [Repo `google-marketing-solutions/google_ads_mcp`](https://github.com/google-marketing-solutions/google_ads_mcp) — issues + releases
- Google Analytics MCP docs y changelog

**Anthropic / MCP spec:**
- [Anthropic news](https://www.anthropic.com/news)
- MCP specification repo (issues + RFCs)
- Cambios en el SDK relevantes para MCP servers remotos

**Industria / incidentes:**
- DTC Skills, HyperFX, Supermetrics, AdAdvisor — blogs que trackean ban waves
- Cuentas como Cody Schneider (@codyschneiderxx) y otros agency operators en X que reportan baneos
- r/PPC, r/FacebookAds — para detectar señales tempranas

### Cadencia

- **Semanal (viernes, 30 min):** revisar las fuentes anteriores, anotar cambios relevantes
- **Inmediato:** cualquier novedad sobre baneos o cambios de policy se evalúa al toque y se traduce a acciones de producto si aplica

### Dónde registrar lo encontrado

- Crear y mantener `MCP-INTEL.md` en el repo con entradas fechadas: qué cambió, fuente, impacto en nuestro producto, acción decidida
- Cuando un cambio implique tarea concreta → se agrega como issue o se incorpora al ROADMAP

### Automatización futura

Eventualmente: un **scheduled Claude agent** que cada lunes a la mañana hace el resumen automático de la semana (lee las fuentes, identifica cambios, manda un email/notificación con el resumen). Lo dejamos pendiente hasta que el flujo manual esté validado.

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

- **Google Ads Developer Token**: rechazado por uso de Gmail. Pendiente configurar email corporativo `@megabait.com.ar` (Google Workspace o Zoho Mail) y reaplicar. **Menos crítico ahora** — si delegamos análisis en el MCP oficial de Google Ads (read-only), el Developer Token solo se necesita para escribir, lo cual está bloqueado para todos hoy (ni MCP ni nadie soporta write en Google Ads sin token aprobado).
- **Email corporativo**: necesario para reaplicar al Developer Token y actualizar Privacy Policy + Terms.

---

## 📋 P1 — System prompt rediseñado

Convertir el agente de "chat con contexto" a "analista senior de marketing digital con criterio Megabait". **Es el pilar #3 (criterio analítico codificado).**

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

### Principios safe-by-default (alineados con P3)
- **Nunca proponer cambios masivos** (más de N en pocos minutos). Si se requiere, fraccionarlo en el tiempo.
- **Nunca proponer ejecución directa** — siempre pasar por aprobación humana.
- **Declarar contenido AI-generado** cuando proponga copy o creatividades.
- **Respetar rate limits documentados** de cada plataforma cuando recomiende cadencia de pruebas.

### Posicionamiento Megabait
- Visión cross-platform neutral: ni Google ni Meta, ve el journey completo
- Mide con las reglas del anunciante, no las de la plataforma
- Las herramientas nativas tienen perspectiva parcial por diseño
- Diferencial vs Madgicx, Birdeye, Triple Whale: contexto profundo del negocio + criterio analítico + neutralidad de plataforma + **safety**

### Comportamiento esperado
- Datos anómalos → preguntar contexto antes de diagnosticar
- Datos insuficientes → decirlo explícitamente y pedir información manual
- Múltiples plataformas → cruzar y dar visión unificada
- Detectar oportunidad → proponer con justificación, no como orden

---

## 📋 P2 — Datos de ventas (pilar #4)

**Por qué es de los items más importantes:** ningún MCP de plataforma te lo da. Es información del negocio del cliente, no de las plataformas. Es lo que permite el discurso "Meta dice $7k, Google dice $6k, en realidad facturaste $10k — hay $3k de solapamiento". Es lo que justifica que el cliente te pague mensual.

### Implementación por fases
1. **Fase 1: CSV upload** — universal, simple, funciona con cualquier negocio
2. **Fase 2: Shopify** — API directa, conector OAuth
3. **Fase 3: WooCommerce, Tiendanube, otros**

### Modelo de datos
- Tabla `sales_data`: `client_id`, fecha, monto, fuente (Shopify/manual/etc), producto opcional
- El agente cruza con métricas de plataformas para reportar ROAS real

---

## 📋 P3 — Safe-MCP infrastructure (EL CORAZÓN DEL PRODUCTO)

Construir la infraestructura que hace que tu producto sea **demostrable y vendiblemente más seguro** que conectar Claude Code a un MCP comunitario. Sin esto, el positioning de la home no es defendible.

### Componentes

**(a) Solo MCPs oficiales**
- Política explícita y documentada: nunca conectarse a community MCPs ni a scrapers.
- Para Meta: MCP oficial (mcp.facebook.com/ads) o Marketing API directa via Business App propia aprobada.
- Para Google: MCP oficial (`google-marketing-solutions/google_ads_mcp`) o Google Ads API con Developer Token propio.
- Para GA4: MCP oficial.
- Cuando un usuario conecta, mostrar explícitamente "conectado via MCP oficial de Meta" — es parte del producto, no detalle interno.

**(b) Rate limiting backend**
- Tu servidor serializa los calls con spacing apropiado.
- Si el agente intenta cambios masivos (ej: pausar 20 ad sets en 1 min), tu backend los espacia.
- El usuario nunca dispara directamente — todo pasa por una cola con control de cadencia.
- Implementación: middleware delante de toda llamada a Meta/Google APIs. Tabla `api_call_queue` o uso de Vercel Queues.

**(c) AI Content Label automático**
- Cuando el agente proponga copy o creatividades nuevas, el sistema marca `is_ai_generated: true` automáticamente.
- Si el flow es "publicar", se aplica el label de Meta antes de enviar.
- Si por alguna razón no se puede aplicar el label, **no se publica**.

**(d) Action approval gates**
- Hard requirement arquitectónico: ninguna escritura a Meta/Google API se ejecuta sin un click humano explícito.
- El agente puede *proponer*. Nunca ejecuta directo.
- El gate se enforza en el backend, no solo en la UI — si el frontend tiene un bug, el backend igual bloquea.

**(e) Audit log**
- Cada call a Meta/Google API queda registrado: timestamp, user_id, client_id, endpoint, payload (sanitizado), response, resultado.
- Tabla `api_audit_log` con retención larga (12+ meses).
- Sirve para: debugging, compliance, y especialmente **evidencia de apelación si Meta llegara a banear** (poder mostrar "miren, nuestros patterns son razonables, acá está el log").

**(f) Business Manager system users donde se pueda**
- Para casos B2B donde la agencia gestiona N cuentas: usar System Users (server-to-server) en vez de OAuth de usuario.
- Más estable, no se rompe cuando una persona se va de la agencia.
- Requiere Business Manager aprobado del lado del cliente.

**(g) Documentación de safety posture**
- Página `/security` o `/safety` en el marketing site con todo esto explicado en lenguaje claro.
- Es **producto**, no solo trust. Vende.

### Cómo se traduce en código (orden sugerido)
1. Audit log primero — barato, alto valor, base para todo lo demás.
2. Action approval gates en backend — antes de implementar P4.
3. Rate limiting middleware.
4. AI Content Label — cuando se implemente P16.
5. System Users — cuando aparezca el primer cliente que lo necesite.

---

## 📋 P4 — Acciones con aprobación del analista (depende de P3)

El agente detecta una oportunidad y propone una acción concreta. El analista aprueba o rechaza antes de que se ejecute.

### Flujo
1. Agente identifica optimización ("CPA 3x más alto que el promedio — recomiendo pausar")
2. Aparece como tarjeta en el chat con botones "Aprobar" / "Rechazar"
3. Si aprueba → se ejecuta via API (pasando por los gates de P3)
4. Registro en `api_audit_log` (P3): acción, fecha, quién aprobó, resultado

### Acciones iniciales (Meta Ads)
- Pausar / activar campaña
- Modificar presupuesto diario
- Pausar / activar ad set

### Notas
- **Nunca** ejecución sin revisión humana — enforzado en backend (P3).
- El log es importante para auditoría y para apelación frente a Meta si fuera necesario.
- Si P6 (Meta MCP migration) está maduro al momento de implementar P4: usar write tools del MCP oficial. Si no: integración custom actual extendida + Business App propia.

---

## 📋 P5 — Google Analytics 4

**Evaluar primero el MCP oficial de Google Analytics** (existe desde 2025). Si cubre el caso de uso, ahorrate la integración custom.

- OAuth flow con Google — puede reutilizar `google_connections` o crear `ga4_connections` separada
- GA4 Property ID por cliente en `clients`
- Métricas: sesiones, usuarios, conversion rate, fuente/medio, páginas más visitadas
- Estado de conexión en dashboard

Cuando esté integrado, el agente puede cruzar: Meta generó awareness → Google capturó intención → Analytics muestra conversión.

---

## 📋 P6 — Tool Use para Google Ads

**Evaluar primero el MCP oficial de Google Ads.** Es read-only y solo expone `list_accessible_customers` + `search` (GAQL crudo). Conviene **envolverlo**: nuestra app expone a Claude tools de alto nivel (`get_campaign_performance`, `compare_periods`), por debajo cada tool ejecuta una query GAQL via el MCP. Buena DX + delegamos auth/API a Google = se alinea con pilar Safe-MCP.

Para escritura: el MCP no soporta hoy → integración custom cuando llegue el Developer Token. La integración custom también debe pasar por los gates de P3.

---

## 📋 P7 — Reporting estructurado

- Plantilla de reporte por cliente: secciones, métricas, orden
- Selector de fechas que dispara consultas a las APIs conectadas
- El agente genera el reporte: resumen ejecutivo, métricas clave, análisis por campaña, recomendaciones priorizadas
- Exportación PDF
- Más completo con GA4 (P5), Google Ads tools (P6) y datos de ventas (P2) integrados

---

## 📋 P8 — Alertas proactivas

El salto conceptual de "chat reactivo" a "copiloto proactivo".

- Cron jobs (Vercel Cron o Supabase Edge Functions) corren análisis periódicos
- Ejemplos: "El CPC de la campaña X subió 40% sin cambios en el copy", "El CTR bajó por debajo del benchmark histórico", "El token de Meta vence en 7 días"
- Sistema de notificaciones: email (Resend) o in-app

---

## ⚙️ En paralelo a P1–P8 — POC Meta MCP (time-boxed)

**Time-box estricto: 2 días.** No bloquea nada del roadmap principal.

### Objetivo del POC
- Confirmar que se puede conectar al MCP oficial de Meta (`mcp.facebook.com/ads`) desde el backend de Next.js
- Confirmar que el flow multi-tenant funciona: dos usuarios distintos del SaaS pueden autenticar sus respectivos Business Managers contra el mismo MCP server, y el agente puede consultar cada uno por separado

### Criterio de éxito
Un test que autentique dos Business Managers distintos y haga una query exitosa contra cada uno desde el backend, **pasando por los gates de P3 (audit log + rate limiting)**.

### Si el POC anda
Se promueve a tarea formal: migrar `lib/meta-ads.ts` y `lib/meta-oauth.ts` al MCP. Beneficios: 29 tools en lugar de 2, sin manejar tokens de 60 días, sin riesgo de baneo por dev app propia, las features nuevas de Meta se heredan, y el positioning "Safe-MCP" se fortalece (somos cliente del MCP oficial, no de uno comunitario).

### Si el POC no anda en 2 días
Se archiva por 2-3 meses. La integración custom actual sigue funcionando — pero **debe ser refactorizada para pasar por los gates de P3** (rate limiting + audit log) sí o sí. La seguridad no espera por el MCP.

---

## 📋 P9 — Billing y suscripciones

**Importante:** hasta este momento, validamos willingness-to-pay manualmente (Stripe Payment Links + facturas manuales a los primeros 5-10 clientes early adopter). La integración billing-app la construimos cuando ya tenemos señales claras de que el producto es vendible.

Cuando se implementa:
- Stripe o Lemon Squeezy
- Pricing tentativo: por cliente/mes (ej: $30/cliente con tope de N consultas), o por agencia con tope de clientes
- Trial de 14 días
- Webhook → Supabase para gating de features según plan

---

## 📋 P10 — Onboarding wizard

Cuando ya hay producto sellable y billing, sin esto no podés onboardear usuarios reales sin acompañarlos a mano.

- Primer login → guía paso a paso: crear cliente → conectar Meta → conectar Google → primer chat
- En cada paso de conexión, mensaje explícito "conectando via MCP oficial — tu cuenta no corre riesgo de baneo" (refuerza pilar #1)
- Tutoriales contextuales en momentos clave
- Reduce drop-off enormemente

---

## 📋 P11 — Botón Reconectar OAuth

En el dashboard, junto a "Meta Ads conectado" / "Google Ads conectado", agregar botón secundario "Reconectar" que redirija al flow OAuth.

Permite agregar más Business Managers, actualizar tokens vencidos, cambiar de cuenta sin desconectar manualmente. Aplicar igual a GA4 cuando se implemente.

---

## 📋 P12 — Multi-tenancy real (team accounts) — pilar #2

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
- **Mensaje principal: "Safe AI for ad accounts"** — derivado del positioning estratégico. Casos documentados de baneos por MCPs no oficiales como prueba social negativa de la competencia.
- Página `/security` o `/safety` con la safety posture detallada (componentes de P3 explicados al cliente final)
- Casos de uso, screenshots, comparativa explícita vs "Claude Desktop + MCPs comunitarios"
- Copy clave: lo que el producto hace y un MCP suelto no — multi-cliente, contexto persistente, criterio analítico Megabait, cruce con ventas reales, **y sobre todo: seguridad**

---

## 📋 P15 — Observabilidad

- Logging estructurado de tool calls (cuántas veces cada tool, qué errores, qué clientes)
- Métricas de uso por cliente (detectar churn + billing)
- Sentry u OpenObserve para errores
- Dashboard interno con métricas del audit log de P3 — para auditar nosotros mismos que el sistema sigue siendo seguro

---

## 📋 P16 — Generación de creatividades con IA

El agente puede generar imágenes para campañas directamente desde el chat, basándose en contexto del cliente y rendimiento.

### Flujo
1. Analista describe la creatividad o el agente la propone basándose en datos
2. El agente construye un prompt optimizado para publicidad con contexto del cliente
3. Llamada a API de generación
4. Imagen aparece en el chat marcada como `is_ai_generated: true`
5. Si se va a publicar, **el sistema aplica el AI Content Label de Meta automáticamente** (componente de P3)
6. Si por alguna razón no se puede aplicar el label, no se publica

### Tecnología
- **fal.ai con FLUX** → mejor relación calidad/precio para imágenes publicitarias
- Alternativa: Replicate

### Videos
Técnicamente posible (Runway, Kling AI), pero tiempo de generación + costo lo hacen inviable para v1.

### Nota de timing
Más valioso cuando P5 (GA4) y P6 (Google Ads tools) estén completos — así el agente propone creatividades basadas en insights reales, no solo en lo que el analista describe.

---

## Notas técnicas

- **CSS Modules en todo el proyecto** — no usar Tailwind
- **No regenerar Navbar ni Footer globales**
- **Cloudinary para imágenes**
- `.env.local` está en `.gitignore` — credenciales en Vercel Environment Variables
- **Versión Meta Graph API: v19.0**
- **El loop de Tool Use en `/app/api/chat/route.ts` soporta múltiples llamadas encadenadas** — no modificar esa estructura sin entenderla primero
- **`max_tokens` en la llamada a Anthropic está en 2048** para soportar el ciclo de tool use
- **MCP en backend**: si avanzás con la migración Meta MCP, confirmar la implementación actual del Anthropic SDK para conectar a MCP servers remotos desde el backend (no Claude Desktop). Esa es la decisión técnica clave.

### Reglas de oro para Safe-MCP (P3)
- **Nunca llamar a Meta/Google APIs directo desde un route handler.** Siempre via el middleware/queue de rate limiting de P3.
- **Nunca escribir sin un click de aprobación humana.** Enforce en backend, no solo UI.
- **Cada call queda en `api_audit_log`.** Sin excepción.
- **AI Content Label es default ON, no opcional.** Si no se puede aplicar, no se publica.
- **MCPs comunitarios nunca son una opción.** Si hace falta integrar algo que no está en MCP oficial, se hace via API oficial con nuestra propia app aprobada.
