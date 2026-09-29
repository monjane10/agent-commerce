# Multi-agent Experiment

Experimento arquivado. A arquitetura ativa do projeto é
single-agent (`Agente Comercial` em `src/agent/commerce-agent.ts`).

## Arquitetura testada

Triage Agent → Sales Agent / Inventory Agent (handoffs do SDK).

## O que funcionou

- Routing do triage: 6/6 correto.
- Handoffs, Session, State, Runner, HITL, guardrails e
  observabilidade continuaram funcionais.

## Problema

Com gpt-5-nano, os especialistas só executaram tools em
2/9 execuções; nas restantes responderam "vou verificar"
sem chamar a tool.

## Impacto

Aproximadamente +1 request estrutural por mensagem.

## Decisão

Single-agent continua ativo por maior fidelidade.
Estes ficheiros não são importados pelo runtime principal.

## Condição para revisitar

Modelo mais capaz ou protocolo de handoff mais rígido.
