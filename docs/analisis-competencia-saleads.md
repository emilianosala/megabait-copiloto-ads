# Análisis de competencia: SaleADS.ai
*Analizado el 13-jul-2026, a partir de un anuncio en YouTube. Para discutir con Jair.*

## Qué es
SaaS en español que genera y publica campañas completas en Meta, Google y TikTok con IA. Promesa: "campañas en 52 segundos sin aprender marketing". Sitios: saleads.ai (producto) y subdominios de saleads.co (embudos VSL de tráfico pago).

**ICP opuesto al nuestro:** ellos venden ejecución a dueños de negocio sin conocimientos; Megabait vende análisis neutral cross-platform a analistas y agencias. **Alerta:** su plan "Agency" (próximamente) los mete en nuestro territorio.

## Pricing
| Plan | Mensual | Anual | Incluye |
|------|---------|-------|---------|
| Pro | $59 | $49/mes | 8 campañas/mes, 1 negocio, créditos p/ ~15 imágenes IA |
| Business | $119 | $99/mes | 30 campañas/mes, 3 negocios, data comparativa |
| Agency | Próximamente | — | Multi-cliente |

- Cobran por volumen de output (campañas, negocios vinculados, créditos), no por spend.
- Checkout Hotmart con precios localizados por país (verificado: ARS al mismo tipo de cambio en ambos planes).
- El "descuento" del embudo VSL no existe: precio idéntico al de lista. Los códigos de oferta son para atribución de embudo/afiliado, no promoción.
- Sin trial gratis visible; el sitio dice "empieza gratis" pero pricing solo muestra planes pagos (probable freemium con créditos limitados, sin verificar).

## Features a considerar para Copiloto Ads
1. **Playbooks/estrategias empaquetadas** (+20 con nombre propio) → versión Megabait: playbooks de análisis ("auditoría de fatiga creativa", "diagnóstico de atribución Meta vs GA4"). Encaja con P1.
2. **Sugerencia de copys fundamentada en la data real del cliente** (vía OAuth ya la tenemos) — no generación de imágenes genérica.
3. **Benchmarks entre clientes de la misma industria** como feature premium (ya tenemos multi-tenancy).
4. Menores: widget WhatsApp para dudas de planes, toggle mensual/anual con % de ahorro.
- **No copiar hoy:** publicación de campañas (write access). Complejidad alta, nuestro ICP quiere el control.

## Pricing — conclusión para nuestro modelo
Nuestro plan (por spend + plan) sigue válido para agencias (es el modelo Triple Whale/Northbeam). Ajuste sugerido: **eje principal del plan = clientes vinculados** (se entiende en 1 segundo), **spend como techo secundario por tier** (protege de que una agencia grande pague precio de chica). Créditos solo para operaciones caras de IA.

## Ventas y comunicación
**Replicar:** doble embudo (sitio de producto + landings por dolor para tráfico pago); testimonios con estructura antes→después con números (pero verificables, con nombre y empresa); distribución por partners/afiliados con subdominios atribuibles (formadores de media buyers, comunidades); venta asistida por WhatsApp — ellos tienen una agente IA "Sofía Ventas" que atiende directo en WhatsApp.

**Evitar:** urgencia falsa ("este video se elimina pronto"), descuentos ficticios, claims no verificables (18x ROAS, testimonios anónimos, contador roto "$0M+ invertidos" en su propia home). Con nuestro ICP profesional eso destruye confianza → oportunidad de posicionamiento: *"No te prometemos 18x ROAS. Te mostramos tu ROAS real."*

## Stack de su embudo (referencia)
WordPress + Elementor, player VTurb/ConverteAI (VSL con CTAs de revelado retardado), Utmify (atribución UTM), píxeles TikTok (x2), Meta, Google Ads, GA4, GTM, Microsoft Clarity, checkout Hotmart.

## Señal de mercado
Están quemando presupuesto en YouTube/TikTok ads para educar al mercado hispano en "IA + publicidad". Claims: 50K+ anuncios, 6K+ negocios. Validación de demanda; sus usuarios que maduren van a necesitar algo más serio.
