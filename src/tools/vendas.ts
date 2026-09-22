import { supabase } from "../lib/supabase.js";

import {
  prepararTermosBusca,
} from "../utils/busca.js";

export async function criarVenda(
  clienteId: number,
  produtoId: number,
  quantidade: number,
  metodoPagamento: string,
) {
  const { data, error } = await supabase.rpc(
    "criar_venda",
    {
      p_cliente_id: clienteId,
      p_produto_id: produtoId,
      p_quantidade: quantidade,
      p_metodo_pagamento: metodoPagamento,
    },
  );

  if (error) {
    return {
      sucesso: false,
      erro: error.message,
    };
  }

  return data;
}


// ======================================================
// CONSULTA DE VENDAS (READ-ONLY)
// ======================================================

const LIMITE_PADRAO_CONSULTA_VENDAS = 10;

const LIMITE_MAXIMO_CONSULTA_VENDAS = 100;

const LIMITE_SEGURANCA_CONSULTA_VENDAS = 1000;


export type ModoConsultaVendas =
  | "resumo"
  | "detalhe";


export type FiltrosConsultarVendas = {
  cliente?: string | undefined;
  produto?: string | undefined;
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
  limite?: number | undefined;
  modo?: ModoConsultaVendas | undefined;
};


export type ItemVendaConsultada = {
  produto: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
};


export type VendaConsultada = {
  id: number;
  cliente: string;
  valor_total: number;
  metodo_pagamento: string;
  created_at: string;
  itens: ItemVendaConsultada[];
};


export type ResultadoResumoVendas = {
  sucesso: true;
  modo: "resumo";
  total_vendas: number;
  valor_total: number;
  moeda: string;
  quantidade_produto: number | null;
};


export type ResultadoDetalheVendas = {
  sucesso: true;
  modo: "detalhe";
  total_vendas: number;
  valor_total: number;
  moeda: string;
  quantidade_produto: number | null;
  vendas: VendaConsultada[];
};


export type ResultadoConsultaVendas =
  | ResultadoResumoVendas
  | ResultadoDetalheVendas;


function normalizarLimiteConsultarVendas(
  limite: number | undefined,
): number {
  if (
    typeof limite !== "number" ||
    !Number.isInteger(limite) ||
    limite <= 0
  ) {
    return LIMITE_PADRAO_CONSULTA_VENDAS;
  }

  return Math.min(
    limite,
    LIMITE_MAXIMO_CONSULTA_VENDAS,
  );
}


function normalizarModoConsultarVendas(
  modo: ModoConsultaVendas | undefined,
): ModoConsultaVendas {
  return modo === "detalhe"
    ? "detalhe"
    : "resumo";
}


function resultadoVazioConsultarVendas(
  modo: ModoConsultaVendas,
  comProduto: boolean,
): ResultadoConsultaVendas {
  const base = {
    sucesso: true as const,
    total_vendas: 0,
    valor_total: 0,
    moeda: "MZN",
    quantidade_produto: comProduto ? 0 : null,
  };

  if (modo === "detalhe") {
    return {
      ...base,
      modo: "detalhe" as const,
      vendas: [],
    };
  }

  return {
    ...base,
    modo: "resumo" as const,
  };
}


function paraNumero(
  valor: unknown,
  predefinido = 0,
): number {
  const convertido = Number(valor);

  return Number.isFinite(convertido)
    ? convertido
    : predefinido;
}


function paraTexto(
  valor: unknown,
  predefinido = "",
): string {
  return typeof valor === "string"
    ? valor
    : predefinido;
}


function campoLinha(
  linha: unknown,
  campo: string,
): unknown {
  if (
    typeof linha === "object" &&
    linha !== null &&
    campo in linha
  ) {
    return (linha as Record<string, unknown>)[campo];
  }

  return undefined;
}


function extrairNomeRelacionado(
  valor: unknown,
): string {
  if (
    typeof valor === "object" &&
    valor !== null &&
    "nome" in valor
  ) {
    return paraTexto(
      (valor as { nome: unknown }).nome,
      "Desconhecido",
    );
  }

  if (
    Array.isArray(valor) &&
    valor.length > 0
  ) {
    return extrairNomeRelacionado(valor[0]);
  }

  return "Desconhecido";
}


// Consulta vendas com filtros opcionais.
//
// Read-only: apenas SELECT nas tabelas
// vendas, itens_venda, clientes e produtos.
//
// total_vendas e valor_total são calculados sobre
// TODAS as vendas encontradas após os filtros.
// O limite aplica-se apenas ao detalhe devolvido
// em vendas (ordenado por created_at DESC).
//
// Quando produto é informado, quantidade_produto
// contém o total de UNIDADES desse produto nas
// vendas encontradas (não o número de vendas).
//
// modo = "resumo" (padrão): devolve só agregados
// e evita queries de detalhe (itens/produtos/
// nomes de clientes).
// modo = "detalhe": inclui vendas[] completas.
export async function consultarVendas(
  filtros: FiltrosConsultarVendas = {},
): Promise<ResultadoConsultaVendas> {
  const cliente =
    filtros.cliente?.trim() || undefined;

  const produto =
    filtros.produto?.trim() || undefined;

  const dataInicio =
    filtros.dataInicio?.trim() || undefined;

  const dataFim =
    filtros.dataFim?.trim() || undefined;

  const limite =
    normalizarLimiteConsultarVendas(
      filtros.limite,
    );

  const modo =
    normalizarModoConsultarVendas(
      filtros.modo,
    );


  // ==================================================
  // FILTRO POR CLIENTE (nome humano -> ids)
  // ==================================================

  let clienteIds: number[] | undefined;

  if (cliente) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id")
      .ilike("nome", `%${cliente}%`);

    if (error) {
      throw new Error(
        `Erro ao consultar vendas: ${error.message}`,
      );
    }

    const ids = (data ?? []).map((linha) =>
      paraNumero(
        linha.id,
        Number.NaN,
      ),
    ).filter((id) => Number.isInteger(id));

    if (ids.length === 0) {
      return resultadoVazioConsultarVendas(
        modo,
        produto !== undefined,
      );
    }

    clienteIds = ids;
  }


  // ==================================================
  // FILTRO POR PRODUTO (nome humano -> venda_id)
  // ==================================================

  let vendaIdsDoProduto: number[] | undefined;

  let linhasItensDoProduto:
    Array<{
      venda_id: number;
      quantidade: number;
    }> = [];

  if (produto) {
    const termos =
      prepararTermosBusca(produto);

    let queryProdutos = supabase
      .from("produtos")
      .select("id");

    const termosEfetivos =
      termos.length > 0 ? termos : [produto.toLowerCase()];

    for (const termo of termosEfetivos) {
      queryProdutos = queryProdutos.ilike(
        "nome",
        `%${termo}%`,
      );
    }

    const { data: produtosData, error: produtosError } =
      await queryProdutos.limit(
        LIMITE_SEGURANCA_CONSULTA_VENDAS,
      );

    if (produtosError) {
      throw new Error(
        `Erro ao consultar vendas: ${produtosError.message}`,
      );
    }

    const produtoIds = (produtosData ?? [])
      .map((linha) =>
        paraNumero(linha.id, Number.NaN),
      )
      .filter((id) => Number.isInteger(id));

    if (produtoIds.length === 0) {
      return resultadoVazioConsultarVendas(modo, true);
    }

    const { data: itensData, error: itensError } =
      await supabase
        .from("itens_venda")
        .select("venda_id, quantidade")
        .in("produto_id", produtoIds)
        .limit(
          LIMITE_SEGURANCA_CONSULTA_VENDAS,
        );

    if (itensError) {
      throw new Error(
        `Erro ao consultar vendas: ${itensError.message}`,
      );
    }

    linhasItensDoProduto = (itensData ?? []).map(
      (linha) => ({
        venda_id: paraNumero(linha.venda_id, Number.NaN),
        quantidade: paraNumero(linha.quantidade),
      }),
    ).filter((linha) =>
      Number.isInteger(linha.venda_id),
    );

    const idsUnicos = [
      ...new Set(
        linhasItensDoProduto.map(
          (linha) => linha.venda_id,
        ),
      ),
    ];

    if (idsUnicos.length === 0) {
      return resultadoVazioConsultarVendas(modo, true);
    }

    vendaIdsDoProduto = idsUnicos;
  }


  // ==================================================
  // VENDAS (uma linha por venda: sem duplicação)
  //
  // Resumo: só id + valor_total (sem joins,
  // sem ordenação: basta para os agregados).
  // Detalhe: linha completa com cliente.
  // ==================================================

  const colunasVendas: string =
    modo === "detalhe"
      ? "id, valor_total, metodo_pagamento, created_at, clientes ( nome )"
      : "id, valor_total";

  let queryVendas = supabase
    .from("vendas")
    .select(colunasVendas)
    .limit(LIMITE_SEGURANCA_CONSULTA_VENDAS);

  if (modo === "detalhe") {
    queryVendas = queryVendas.order("created_at", {
      ascending: false,
    });
  }

  if (clienteIds !== undefined) {
    queryVendas = queryVendas.in(
      "cliente_id",
      clienteIds,
    );
  }

  if (vendaIdsDoProduto !== undefined) {
    queryVendas = queryVendas.in(
      "id",
      vendaIdsDoProduto,
    );
  }

  if (dataInicio !== undefined) {
    queryVendas = queryVendas.gte(
      "created_at",
      dataInicio,
    );
  }

  if (dataFim !== undefined) {
    queryVendas = queryVendas.lte(
      "created_at",
      dataFim,
    );
  }

  const { data: vendasData, error: vendasError } =
    await queryVendas;

  if (vendasError) {
    throw new Error(
      `Erro ao consultar vendas: ${vendasError.message}`,
    );
  }

  // Em modo resumo a query só traz id e
  // valor_total; os restantes campos ficam
  // com valores predefinidos e não são usados.
  const linhasVendas: unknown[] =
    vendasData ?? [];

  const vendasEncontradas = linhasVendas.map(
    (linha) => ({
      id: paraNumero(
        campoLinha(linha, "id"),
        Number.NaN,
      ),
      valor_total: paraNumero(
        campoLinha(linha, "valor_total"),
      ),
      metodo_pagamento: paraTexto(
        campoLinha(linha, "metodo_pagamento"),
        "",
      ),
      created_at: paraTexto(
        campoLinha(linha, "created_at"),
        "",
      ),
      cliente: extrairNomeRelacionado(
        campoLinha(linha, "clientes"),
      ),
    }),
  ).filter((venda) => Number.isInteger(venda.id));

  if (vendasEncontradas.length === 0) {
    return resultadoVazioConsultarVendas(
      modo,
      produto !== undefined,
    );
  }


  // ==================================================
  // AGREGADOS (fonte de verdade: vendas.valor_total)
  // ==================================================

  const totalVendas = vendasEncontradas.length;

  const valorTotal = vendasEncontradas.reduce(
    (acumulado, venda) => acumulado + venda.valor_total,
    0,
  );

  let quantidadeProduto: number | null = null;

  if (produto !== undefined) {
    const idsEncontrados = new Set(
      vendasEncontradas.map((venda) => venda.id),
    );

    quantidadeProduto = linhasItensDoProduto.reduce(
      (acumulado, linha) =>
        idsEncontrados.has(linha.venda_id)
          ? acumulado + linha.quantidade
          : acumulado,
      0,
    );
  }


  // ==================================================
  // RESUMO (sem queries de detalhe)
  // ==================================================

  if (modo === "resumo") {
    return {
      sucesso: true,
      modo: "resumo",
      total_vendas: totalVendas,
      valor_total: valorTotal,
      moeda: "MZN",
      quantidade_produto: quantidadeProduto,
    };
  }


  // ==================================================
  // DETALHE (mais recentes, agrupado por venda)
  // ==================================================

  const vendasDetalhe =
    vendasEncontradas.slice(0, limite);

  const detalheIds = vendasDetalhe.map(
    (venda) => venda.id,
  );

  const { data: itensDetalhe, error: itensDetalheError } =
    await supabase
      .from("itens_venda")
      .select(
        "venda_id, quantidade, preco_unitario, subtotal, produtos ( nome )",
      )
      .in("venda_id", detalheIds);

  if (itensDetalheError) {
    throw new Error(
      `Erro ao consultar vendas: ${itensDetalheError.message}`,
    );
  }

  const itensPorVenda = new Map<
    number,
    ItemVendaConsultada[]
  >();

  for (const linha of itensDetalhe ?? []) {
    const vendaId = paraNumero(
      linha.venda_id,
      Number.NaN,
    );

    if (!Number.isInteger(vendaId)) {
      continue;
    }

    const item: ItemVendaConsultada = {
      produto: extrairNomeRelacionado(linha.produtos),
      quantidade: paraNumero(linha.quantidade),
      preco_unitario: paraNumero(linha.preco_unitario),
      subtotal: paraNumero(linha.subtotal),
    };

    const existentes = itensPorVenda.get(vendaId);

    if (existentes) {
      existentes.push(item);
    } else {
      itensPorVenda.set(vendaId, [item]);
    }
  }

  const vendas: VendaConsultada[] = vendasDetalhe.map(
    (venda) => ({
      id: venda.id,
      cliente: venda.cliente,
      valor_total: venda.valor_total,
      metodo_pagamento: venda.metodo_pagamento,
      created_at: venda.created_at,
      itens: itensPorVenda.get(venda.id) ?? [],
    }),
  );


  return {
    sucesso: true,
    modo: "detalhe",
    total_vendas: totalVendas,
    valor_total: valorTotal,
    moeda: "MZN",
    quantidade_produto: quantidadeProduto,
    vendas,
  };
}