# Programa de estudio — De acá a AI Engineer

> **Autor:** armado con Claude para Emiliano (Megabait).
> **Laboratorio:** Jair (este mismo repo). Cada tema se aprende **mejorando Jair de verdad**, no en tutoriales de juguete.
> **Regla de secuencia:** TypeScript sobre Jair primero (Fases 1–4, rápido porque es tu terreno) → Python para el mercado laboral (Fase 5). Un hilo de **fundamentos** corre en paralelo todo el tiempo.

---

## Cómo usar este documento

- Cada fase tiene un **objetivo**, el **por qué va en ese orden**, **qué construimos en Jair**, un **hito medible** (con checkbox) y **recursos**.
- El hito es la prueba de que dominaste el tema: "lo sé porque puedo hacer X".
- Marcá `- [x]` cuando cumplas un hito. Yo actualizo el estado al final del documento cada vez que avanzamos.
- No hace falta terminar una fase 100% para asomarte a la siguiente, pero el orden minimiza aprender dos cosas nuevas a la vez.

---

## Punto de partida (diagnóstico honesto)

- **No sos principiante.** Ya enviaste a producción un producto de IA (Jair) con tool use, multi-modelo, visión, streaming, audit log, rate limiting, OAuth a Meta/Google/GA4 y seguridad. Eso es lo que el mercado dice que falta: gente que *shippeó*, no que solo estudió.
- **RAG = arrancás de cero.** Los repos `rag-estimation-*` son forks del workshop de LIDR que todavía no estudiaste. Se agrega un paso previo de estudio antes de construirlo.
- **El hueco más grande son los *evals*.** Hoy Jair no tiene ninguno: cada vez que tocás su prompt, cambiás a ciegas. Por eso es la Fase 1.
- **Python es el idioma del mercado.** Tu stack es TypeScript/Next.js/Vercel. La estrategia "los dos en fases" consolida en TS y después porta a Python, sin aprender lenguaje y concepto nuevos al mismo tiempo.

---

## Mapa de fases

| # | Fase | Stack | Hito |
|---|------|-------|------|
| 1 | Evals & Observabilidad | TS / Jair | Cambio el prompt y en 5 min sé, con un número, si mejoró |
| 2 | RAG en producción | TS / Jair | Jair usa contexto de charlas pasadas que no están en la conversación actual |
| 3 | Prompt/context engineering + costo/latencia | TS / Jair | Bajé el costo por turno X% sin perder calidad (medido con Fase 1) |
| 4 | Multi-agente / orquestación | TS → Python | Tarea compleja resuelta con 2+ sub-agentes y aprobación humana |
| 5 | Python para el mercado | Python / LangGraph | Agente RAG en Python con evals, mostrable en entrevista |
| ∞ | Fundamentos (transversal) | — | Puedo explicar tokens, embeddings y attention con mis palabras |

---

## Fase 1 — Evals & Observabilidad *(TS, sobre Jair)*

**Objetivo:** dejar de mejorar a ciegas. Medir la calidad de Jair con un número.

**Por qué va primero** (derivación):
- Un LLM da una respuesta distinta cada vez → no podés saber si "está bien" mirándolo una vez.
- No poder saber si está bien → necesitás medirlo con muchos casos de prueba, no con tu intuición.
- Medir con muchos casos → eso es un **eval** (un test para IA: entradas con su respuesta esperada + una forma de puntuar).
- Tener evals → podés cambiar prompt o modelo y **saber si mejoraste o rompiste**.
- Por lo tanto, sin esta fase, todo lo demás (RAG, costo, agentes) sería a ciegas.

**Qué construimos en Jair:**
1. Instrumentar cada turno del chat: guardar input, output, tokens, costo, latencia, modelo.
2. Armar un dataset de ~25 conversaciones reales (el pilot te las va a dar servidas) con la "respuesta buena esperada".
3. Escribir un eval tipo **LLM-as-judge**: otro modelo le pone nota a las respuestas de Jair contra el esperado.
4. Correr el eval cada vez que cambiás el prompt o el modelo.

**🎯 Hito:**
- [ ] Puedo cambiar el system prompt de Jair y en 5 minutos sé, con un número, si mejoró o empeoró.

**Recursos:**
- Docs de evals de Anthropic (Console → Evaluate, y la guía de "test & evaluate").
- DeepLearning.ai — cursos cortos de evaluación de LLMs / agentes.
- Herramienta TS-friendly para evals: **Promptfoo** (corre casos y compara modelos/prompts).

---

## Fase 2 — RAG en producción *(TS, sobre Jair)*

**Objetivo:** que Jair tenga memoria persistente por cuenta, construida por vos de cero.

**Paso previo (porque RAG arranca en cero):** estudiar el material del workshop de LIDR —tus forks `rag-estimation-*` + el video en `C:\Users\godig\Videos`— para tener la intuición antes de construir.

**Por qué acá** (derivación):
- Con evals en la mano → podés medir si RAG mejora las respuestas (no lo agregás a fe).
- Jair hoy consulta APIs en vivo pero no recuerda nada persistente → RAG es lo que le da memoria.
- Memoria = la competencia #2 que pide el mercado (recuperación aumentada).

**Qué construimos en Jair:**
1. Usar **Supabase con pgvector** (ya usás Supabase) como base vectorial.
2. Chunk + embeddings del historial de charlas y notas de cada cliente.
   - Nota técnica: Anthropic no tiene endpoint propio de embeddings; los generás con un proveedor de embeddings (p. ej. Voyage AI, que Anthropic recomienda, u otro). Ese es un concepto nuevo a aprender acá.
3. Retrieval en cada turno: antes de responder, Jair busca los fragmentos relevantes de ESA cuenta y los suma al contexto.

**🎯 Hito:**
- [ ] Jair responde usando contexto de charlas pasadas de esa cuenta que no están en la conversación actual.

**Recursos:**
- Guía de RAG del **Vercel AI SDK** (ejemplos clonables en TS).
- Docs de **pgvector** de Supabase.
- Material del workshop de LIDR (paso previo).

---

## Fase 3 — Prompt/context engineering + costo y latencia *(TS)*

**Objetivo:** que Jair sea afilado, barato y predecible.

**Por qué acá** (derivación):
- RAG agregado → más contexto por turno → eso sube el costo → por eso optimizar costo viene justo después.
- Optimizar sin medir sería adivinar → por eso usás el eval de la Fase 1 como regla.

**Qué construimos en Jair:**
1. **Structured outputs** (`output_config.format`): forzar respuestas con forma garantizada cuando hace falta (p. ej. datos para gráficos).
2. **Prompt caching de Anthropic**: cachear el prefijo estable del prompt (system + tools) → ahorro real de plata en cada turno. Verificar con `cache_read_input_tokens`.
3. Medir y bajar latencia; manejar la ventana de contexto (qué mandar y qué no).

**🎯 Hito:**
- [ ] Bajé el costo por turno de Jair X% sin perder calidad — y lo demuestro con el eval de la Fase 1.

**Recursos:**
- Docs de Anthropic: prompt caching, structured outputs, effort/thinking.
- Referencia de modelos actual (Sonnet 5 / Opus 4.8 / Haiku 4.5) para elegir el modelo por tarea.

---

## Fase 4 — Multi-agente / orquestación *(TS, puente a Python)*

**Objetivo:** descomponer tareas complejas en un equipo de sub-agentes con aprobación humana.

**Por qué acá** (derivación):
- Base sólida (medida, con memoria, optimizada) → recién ahí agregar complejidad multi-agente tiene sentido.
- Human-in-the-loop = tu moat (los gates de aprobación P3/P4 del ROADMAP). Estudiar esto avanza el producto Y el perfil.

**Qué construimos en Jair:**
1. Un "analista" que arma la consulta + un "redactor" que la explica.
2. Patrones: router (elegir a quién delegar), ReAct (razonar-actuar), y **human-in-the-loop** (aprobar antes de ejecutar).

**🎯 Hito:**
- [ ] Jair resuelve una tarea compleja delegando en 2+ sub-agentes, con un paso de aprobación humana.

**Recursos:**
- Anthropic — guía "building effective agents" (cuándo un agente y cuándo no).
- Concepto de ReAct y router en la doc del workshop de LIDR.

---

## Fase 5 — Python para el mercado *(LangGraph / Pydantic AI)*

**Objetivo:** credibilidad laboral + entender los fundamentos, portando lo que ya sabés.

**Por qué al final** (derivación):
- Todo dominado en TS → portarlo a Python es traducir conceptos que ya entendés, no aprenderlos de nuevo.
- El 90% de las ofertas y del material asume Python + LangChain/LangGraph.

**Qué construimos:**
1. Replicar el agente RAG (el de Jair o el del workshop) en Python con **LangGraph** o **Pydantic AI**.
2. Sumarle evals (lo de la Fase 1, ahora en Python).

**🎯 Hito:**
- [ ] Tengo en mi GitHub un agente RAG en Python, con evals, listo para mostrar en una entrevista.

**Recursos:**
- Docs de LangGraph y Pydantic AI.
- Repos del workshop de LIDR (están en Python).

---

## Hilo transversal — Fundamentos *(todo el camino)*

Un video/lectura cada tanto para entender cómo funciona por dentro, no solo usarlo. Es lo que en una entrevista te distingue de alguien que solo pega llamadas a una API.

- **Andrej Karpathy** — "Intro to LLMs" (1h) y "Let's build GPT".
- Intuición de **tokens, embeddings y attention** (3Blue1Brown tiene buenos videos visuales).

**🎯 Hito:**
- [ ] Puedo explicar con mis palabras qué es un token, qué es un embedding y qué hace el mecanismo de attention.

---

## Estado / bitácora

- **13 jul 2026** — Programa definido. Ninguna fase empezada. Próximo paso a acordar con Emiliano: arrancar Fase 1 (Evals) después de que estén cerrados los pendientes del pilot, o en paralelo.

_(Yo actualizo esta sección cada vez que cumplís un hito.)_
