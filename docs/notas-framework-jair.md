# Notas: evolución del framework analítico de Jair (P1)
*Contexto: P1 (system prompt) está completo pero solo con principios del video de Madgicx. El plan es engrosarlo destilando un curso práctico de un marketer con experiencia real en campañas (recomendado por analistas de agencia, nombre a confirmar). Estas notas definen la arquitectura y el formato para hacerlo bien.*

## 1. Arquitectura de conocimiento en dos niveles

**Problema a evitar:** meter todas las reglas en el system prompt. El system prompt se envía en cada mensaje → costo por token multiplicado por cada consulta, y los prompts largos diluyen la atención del modelo (las reglas importantes pierden peso entre las irrelevantes).

**Nivel 1 — Núcleo (system prompt, siempre presente):**
- Personalidad de analista senior + posicionamiento Megabait
- Solo principios transversales que aplican a cualquier análisis: significancia estadística, rendimientos decrecientes, atribución cross-platform, prioridad del creativo
- Meta: mantenerlo en ~15-20 reglas máximo

**Nivel 2 — Módulos temáticos (carga bajo demanda):**
- Archivos markdown de reglas por tema: `creativos.md`, `escalado-presupuesto.md`, `campanas-busqueda.md`, `remarketing.md`, etc.
- Se inyectan al contexto solo cuando la consulta es de ese tema
- Implementación mínima: detección de tema por keywords → append del módulo al contexto
- Implementación mejor: tool `consultar_framework(tema)` que el modelo invoca solo (mismo patrón de Tool Use que ya usa la integración de Meta Ads)
- Ventaja operativa: el conocimiento se mejora editando markdown, sin deploy de código

## 2. Formato fijo para destilar el curso

Antes de procesar cualquier módulo del curso, fijar esta plantilla como salida obligatoria. Cada aprendizaje se convierte en una regla operativa:

```
REGLA: <nombre corto>
CUÁNDO: <condición observable en métricas, con umbrales concretos>
ACCIÓN: <qué recomendar>
POR QUÉ: <mecanismo causal, 1 línea>
NO APLICA SI: <contexto donde la regla es inválida>
```

Ejemplo:

```
REGLA: Fatiga creativa
CUÁNDO: frecuencia > 3.5 en 7 días Y CTR cayó >20% vs. 2 semanas previas
ACCIÓN: recomendar rotación de creativo antes que tocar audiencia o presupuesto
POR QUÉ: la audiencia ya vio el anuncio; más presupuesto solo acelera el desgaste
NO APLICA SI: campaña de remarketing (frecuencia alta esperable)
```

**Por qué formato fijo:**
- Filtra automáticamente el relleno: si un módulo del curso no se puede escribir así, no aporta (detector de humo)
- Reglas homogéneas y comparables entre sí
- El output ya queda listo para pegar en núcleo o módulos sin reescritura
- Cada regla declara a qué módulo temático pertenece

## 3. Criterios legales/de prudencia (ya discutidos, resueltos)
- Destilar principios y métodos: OK (las ideas no tienen copyright; es lo que haría un analista humano que toma el curso)
- NO reproducir texto/material del curso en el producto
- NO usar nombres de frameworks registrados del autor dentro del producto
- NO publicitar a Jair como "entrenado con el curso de X"

## 4. Fuentes complementarias (con su rol correcto)
- **Meta Blueprint / Google Skillshop:** solo como documentación de mecánica de plataforma (cómo funciona una ventana de atribución, tipos de puja). NO como criterio de optimización — su incentivo es maximizar inversión del anunciante, lo cual es exactamente la tesis de posicionamiento de Megabait.
- **Curso del practitioner independiente:** la fuente de criterio y umbrales de decisión.
- **A futuro (P7+):** aprendizajes extraídos de datos reales de cuentas conectadas por OAuth — el único conocimiento propietario y no copiable. Conecta con benchmarks por industria (ver analisis-competencia-saleads.md).
