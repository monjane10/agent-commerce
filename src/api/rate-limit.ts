// ======================================================
// RATE LIMIT em memória (sem Redis, sem deps).
//
// Por IP (socket remoto; sem X-Forwarded-For nesta
// fase — API bindada em 127.0.0.1).
// Limpeza preguiçosa: entradas expiradas removidas
// quando o Map cresce.
// ======================================================

export type ResultadoLimite =
  | { permitido: true }
  | {
      permitido: false;
      retryAfterSeg: number;
    };

type Entrada = {
  contador: number;
  expiraEm: number;
};

const LIMITE_ENTRADAS_ANTES_LIMPEZA = 2000;

export function criarLimitador(
  janelaMs: number,
  maximo: number,
): (ip: string) => ResultadoLimite {
  const acessos = new Map<string, Entrada>();

  return (ip: string): ResultadoLimite => {
    const agora = Date.now();

    if (
      acessos.size >
      LIMITE_ENTRADAS_ANTES_LIMPEZA
    ) {
      for (const [chave, valor] of acessos) {
        if (valor.expiraEm <= agora) {
          acessos.delete(chave);
        }
      }
    }

    const entrada = acessos.get(ip);

    if (!entrada || entrada.expiraEm <= agora) {
      acessos.set(ip, {
        contador: 1,
        expiraEm: agora + janelaMs,
      });

      return { permitido: true };
    }

    if (entrada.contador >= maximo) {
      return {
        permitido: false,
        retryAfterSeg: Math.max(
          1,
          Math.ceil(
            (entrada.expiraEm - agora) / 1000,
          ),
        ),
      };
    }

    entrada.contador += 1;

    return { permitido: true };
  };
}
