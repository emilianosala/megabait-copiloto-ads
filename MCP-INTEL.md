# MCP-INTEL — Bitácora de inteligencia sobre MCPs y seguridad de plataformas

Registro vivo de novedades relevantes para sostener el pilar **Safe-MCP infrastructure** del producto (ver `ROADMAP.md`). Cada entrada documenta qué cambió, dónde lo vimos, qué impacto tiene en nuestro producto, y qué acción se decidió tomar.

**Cadencia de revisión:** semanal (viernes, 30 min). Fuentes en `ROADMAP.md` → sección *Inteligencia de plataforma*.

**Formato de entrada:**

```
## YYYY-MM-DD — Título corto

**Qué cambió:** (1-3 líneas)
**Fuentes:** (links)
**Impacto:** (cómo nos afecta)
**Acción:** (qué hacemos, o "ninguna" si solo informativo)
```

---

## 2026-04-30 — Snapshot inicial del panorama Safe-MCP

Entrada inaugural. Consolida lo que sabemos al momento de definir el positioning del producto.

### Meta: ola de baneos por MCPs no oficiales y patterns agresivos (2025 → 2026)

**Qué pasó:**
- Durante 2025 múltiples agency operators reportaron **restricciones permanentes** de ad accounts después de conectar Claude o Codex a Meta vía MCPs comunitarios (GoMarble, FBTool, repos de GitHub no aprobados).
- El patrón: cada call pasaba por la dev app de un tercero. Cuando esa dev app se flaggeaba, **todas las cuentas conectadas se baneaban en cascada**. Permanente, sin canal de apelación útil.
- Casos públicos documentados (ej: tweet de Cody Schneider sobre clientes que usaron MCPs de GoMarble en bulk uploads y perdieron las cuentas).

**Fuentes:**
- [DTC Skills — How to Use Meta's MCP Without Getting Your Ad Account Banned](https://dtcskills.com/blog/meta-mcp-without-getting-banned)
- [HyperFX — Will Connecting Claude to Meta Ads Get Your Account Banned? (2026 Guide)](https://www.hyperfx.ai/blog/will-connecting-claude-to-meta-ads-ban-account-2026)
- [Supermetrics — Why AI agents are getting ad accounts banned](https://supermetrics.com/blog/ai-agent-ad-account-banned)
- [AdAdvisor — The Dangers of MCP for Meta Ads](https://adadvisor.ai/blog/the-dangers-of-mcp-for-meta-ads)
- [Cody Schneider en X — incidentes con MCPs de terceros](https://x.com/codyschneiderxx/status/2030546028362162516)

**Impacto:** este es **el** vector que define nuestro positioning. Es el problema real, doloroso, presente que el cliente final entiende. Nuestro producto se posiciona explícitamente como la alternativa segura.

**Acción:**
- Política dura: **MCPs comunitarios no son una opción jamás** (codificado en P3 y en "Reglas de oro" del ROADMAP).
- Marketing site (P14) y página `/security` deben explicar este vector de baneo y por qué nuestro producto lo elimina.

---

### Meta: lanzamiento del MCP oficial (29 abril 2026)

**Qué cambió:**
- Meta lanzó oficialmente el MCP server en `mcp.facebook.com/ads` + CLI para desarrolladores, ayer 29/04/2026.
- 29 tools, read **y** write desde el día uno (incluyendo pausar/activar campañas, modificar presupuestos, gestionar catálogos).
- Auth via Business Suite directo — sin dev app intermedia.
- Compatible con Claude y ChatGPT desde el lanzamiento.

**Fuentes:**
- [Digiday — Meta opens its ad ecosystem to third-party AI tools](https://digiday.com/marketing/meta-opens-its-ad-ecosystem-to-third-party-ai-tools/)
- [PPC Land — Meta opens its ad system to Claude and ChatGPT](https://ppc.land/meta-opens-its-ad-system-to-claude-and-chatgpt-with-new-ai-connectors/)
- [Pasquale Pillitteri — Official Meta Ads MCP for Claude: Complete Guide](https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026)

**Impacto:** elimina el vector #1 de baneo (third-party dev apps) si lo usamos como substrato. Pero **no** elimina los demás vectores (rate limiting, AI Content Label).

**Acción:** POC time-boxed de 2 días (definido en ROADMAP) para confirmar viabilidad multi-tenant. Si funciona → migración. Si no → mantener integración custom con Business App propia, pasando por los gates de P3.

---

### Meta: AI Content Label obligatorio (desde marzo 2026)

**Qué cambió:**
- Desde marzo 2026 Meta exige que todo contenido AI-generado o AI-modificado en creatividades publicitarias use el **AI Content Label** en Ads Manager.
- Aparece como tag visible "AI-generated" cuando el ad se sirve.
- Tres strikes → enforcement a nivel ad account.
- Strikes repetidos → baneo permanente.
- Actualmente es la tercera causa de rechazo en Meta para 2026.

**Fuentes:**
- [HyperFX — Meta Ad Account Disabled? 10 Causes and Fixes (2026)](https://www.hyperfx.ai/blog/meta-ad-account-disabled-causes-2026)

**Impacto:** afecta directo a P16 (generación de creatividades). Sin compliance automático, nuestro producto puede provocar baneos.

**Acción:** P3 incluye AI Content Label automático como componente obligatorio. P16 hereda el requisito hard: si no se puede aplicar el label, no se publica.

---

### Meta: baneos por patterns agresivos incluso en API oficial

**Qué cambió:**
- Durante la beta del MCP oficial, operators reportaron suspensiones temporales cuando AI clients corrían loops muy ajustados (30+ cambios de presupuesto/hora, bulk audience updates en minutos, cambios de catálogo sin business logic).
- El MCP oficial **no** te exime de respetar rate limits ni patrones razonables.

**Fuentes:**
- [HyperFX — Will Connecting Claude to Meta Ads Get Your Account Banned?](https://www.hyperfx.ai/blog/will-connecting-claude-to-meta-ads-ban-account-2026)
- [DTC Skills](https://dtcskills.com/blog/meta-mcp-without-getting-banned)

**Impacto:** rate limiting backend no es opcional aunque migremos al MCP oficial. Vale para Meta y probablemente para Google.

**Acción:** rate limiting middleware en P3, queue de operaciones serializada con spacing apropiado. Documentar internamente los thresholds conocidos por plataforma.

---

### Google Ads MCP (desde octubre 2025) — read-only

**Qué cambió:**
- Google lanzó MCP oficial en `google-marketing-solutions/google_ads_mcp` el 7/10/2025.
- Maintained por el equipo de Google Marketing Solutions.
- **Read-only**. Expone solo dos tools: `list_accessible_customers` y `search` (queries GAQL crudas).
- No soporta crear campañas, ajustar pujas, ni agregar keywords.

**Fuentes:**
- [Google Ads Developer Blog — Open Source Google Ads API MCP Server](https://ads-developers.googleblog.com/2025/10/open-source-google-ads-api-mcp-server.html)
- [Google Ads API Docs — MCP Server integration guide](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server)
- [GitHub — google-marketing-solutions/google_ads_mcp](https://github.com/google-marketing-solutions/google_ads_mcp)

**Impacto:** para analytics y reporting nos sirve — y nos alinea con Safe-MCP (no necesitamos developer token propio aprobado solo para leer). Para escritura tenemos que esperar a que llegue el Developer Token Basic Access nuestro.

**Acción:** P6 envuelve el MCP oficial con tools de alto nivel (`get_campaign_performance`, etc) en lugar de pedirle al agente que escriba GAQL crudo. Cuando llegue el Developer Token y queramos escribir, hacemos integración custom propia.

---

### Madgicx — competidor que ya intenta el positioning "safe MCP"

**Qué notamos:**
- Madgicx publicó *"The Only Safe Way to Connect AI Assistants to Meta Ads"*, intentando ocupar el espacio "safe".
- Su pitch es débil: producto cerrado, caro, sin transparencia sobre **cómo** son safe.
- No explican el stack: solo "trust us".

**Fuente:**
- [Madgicx — Safe Way to Connect AI Assistants to Meta Ads](https://madgicx.com/blog/safe-way-to-connect-ai-assistants-to-meta-ads)

**Impacto:** el espacio está abierto pero hay que ocuparlo rápido y mejor. Nuestra ventaja: ser **transparentes** sobre los componentes del Safe-MCP stack (rate limiting, audit log, AI Content Label, etc.). La página `/security` (P14) es la herramienta de marketing más diferenciada que podemos publicar.

**Acción:** cuando armemos `/security`, ser explícitos y técnicos. Listar los componentes de P3 uno por uno, con detalle suficiente para que un Head of Growth técnico pueda evaluar. Madgicx no hace eso — ahí está nuestra apertura.

---

## Próximas entradas (template recordatorio)

Cuando aparezca algo nuevo en las fuentes monitoreadas, agregar entrada nueva al tope (más reciente primero) siguiendo el formato del bloque inicial.

Categorías típicas a vigilar:
- **Nuevas tools en MCPs oficiales** (Meta, Google, GA4)
- **Cambios en políticas de safety / rate limits** de Meta o Google
- **Nuevos vectores de baneo** reportados por operators
- **Cambios en MCP spec o en Anthropic SDK** que afecten cómo conectamos
- **Movimientos de competidores** en el positioning "safe AI for ads"
- **Cambios regulatorios** (AI Content Labels, disclosure laws, etc.)
