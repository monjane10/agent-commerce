import type {
  ResumoVendaAprovacao,
} from "../agent/context.js";


export function formatarDinheiro(
  valor:
    number,

  moeda:
    string,
): string {
  try {
    return new Intl.NumberFormat(
      "pt-MZ",
      {
        style:
          "currency",

        currency:
          moeda,

        minimumFractionDigits:
          2,
      },
    ).format(
      valor,
    );
  }
  catch {
    return `${valor.toFixed(
      2,
    )} ${moeda}`;
  }
}


export function mostrarResumoAprovacao(
  resumo:
    ResumoVendaAprovacao,
): void {
  console.log(`
===================================
       APROVAÇÃO NECESSÁRIA
===================================

Dados da venda:

Cliente: ${resumo.clienteNome}
Produto: ${resumo.produtoNome}
Quantidade: ${resumo.quantidade}
Método de pagamento: ${resumo.metodoPagamento}`);


  if (
    resumo.precoUnitario !==
    null
  ) {
    console.log(
      `Preço unitário: ${formatarDinheiro(
        resumo.precoUnitario,
        resumo.moeda,
      )}`,
    );
  }


  if (
    resumo.total !==
    null
  ) {
    console.log(
      `Total: ${formatarDinheiro(
        resumo.total,
        resumo.moeda,
      )}`,
    );
  }


  console.log();
}
