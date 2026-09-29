// ======================================================
// SERVIDOR MCP LOCAL (stdio, READ-ONLY) — referência local
//
// Usa a definição partilhada (ver commercial-policy-shared.ts).
// O caminho principal do Agent Commerce é Streamable HTTP.
// ======================================================

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  criarCommercialPolicyMcpServer,
} from "./commercial-policy-shared.js";


const servidor =
  criarCommercialPolicyMcpServer();

const transporte = new StdioServerTransport();

await servidor.connect(transporte);
