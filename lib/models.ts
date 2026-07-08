// Modelos de Anthropic que el analista puede elegir por conversación.
// Fuente de verdad única: la usan tanto el frontend (selector) como el
// backend (validación). Si se agrega/quita un modelo, se hace acá.

export interface ChatModel {
  /** ID exacto que espera la API de Anthropic. */
  id: string;
  /** Nombre corto para mostrar en el selector. */
  label: string;
  /** Una línea explicando cuándo conviene, para el tooltip. */
  hint: string;
}

export const CHAT_MODELS: ChatModel[] = [
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet',
    hint: 'Equilibrado: rápido y muy capaz. Recomendado para el día a día.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus',
    hint: 'El más potente para análisis profundos. Más lento y más caro.',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku',
    hint: 'El más rápido y económico. Ideal para preguntas simples.',
  },
];

/** Modelo por defecto si no llega ninguno o llega uno inválido. */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-5';
