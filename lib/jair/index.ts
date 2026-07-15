// Cerebro de Jair — ensamblador del system prompt.
//
// Arquitectura de dos niveles (ver docs/notas-framework-jair.md y P21 del ROADMAP):
//   - Nivel 1 (núcleo): siempre presente — personalidad + principios transversales.
//   - Nivel 2 (módulos): se cargan bajo demanda según el contexto del cliente.
//
// Hoy la "demanda" se detecta por lo que el cliente tiene conectado. La evolución
// (post-pilot) es una tool `consultar_framework(tema)` que Jair invoca solo.

import type { JairPromptContext } from './types';
import {
  identidad,
  principios,
  safety,
  posicionamiento,
  comportamiento,
  cierre,
} from './nucleo';
import { contextoCliente, alertas, ventas } from './contexto';
import { herramientas, reportes } from './capacidades';
import { diagnosticoConversiones } from './modulos/conversiones';

export function buildJairSystemPrompt(ctx: JairPromptContext): string {
  // Módulo temático (Nivel 2): el diagnóstico de conversiones solo aplica si el
  // cliente tiene un contexto web/ads relevante. Para un cliente solo-Meta no se
  // carga — ahorra tokens y evita diluir la atención del modelo.
  const cargaDiagnosticoConversiones = ctx.hasGA4 || ctx.hasGoogleAds;

  const secciones: (string | false)[] = [
    identidad(ctx),
    contextoCliente(ctx),
    principios,
    safety,
    posicionamiento,
    comportamiento,
    cargaDiagnosticoConversiones && diagnosticoConversiones,
    herramientas(ctx),
    cierre,
    reportes,
    alertas(ctx),
    ventas(ctx),
  ];

  return secciones.filter((s): s is string => s !== false).join('\n\n');
}

export type { JairPromptContext } from './types';
