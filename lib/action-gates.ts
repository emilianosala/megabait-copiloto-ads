// P3: Action approval gates
//
// Toda operación de escritura sobre Meta o Google APIs debe pasar por requireApproval()
// antes de ejecutarse. El gate se enfuerza en el backend — no en la UI.
//
// Por ahora solo hay operaciones de lectura (tool use del chat). Cuando llegue P4
// (acciones con aprobación), cada write llama a requireApproval() con el approvalId
// que el frontend envía tras el click del analista.

export class ActionBlockedError extends Error {
  constructor(action: string) {
    super(
      `La acción "${action}" requiere aprobación humana explícita antes de ejecutarse.`,
    );
    this.name = 'ActionBlockedError';
  }
}

// approvalId: referencia a una fila en pending_actions con status 'approved' (P4).
// Lanzar ActionBlockedError si no está presente.
export function requireApproval(approvalId: string | undefined, action: string): void {
  if (!approvalId) {
    throw new ActionBlockedError(action);
  }
}
