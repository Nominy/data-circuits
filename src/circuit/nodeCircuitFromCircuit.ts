import { newId } from './id'
import type { Circuit, Node } from './model'
import type { NodeCircuit, NodeCircuitEdge, NodeCircuitNode } from './nodeCircuit'

function seriesItemsForCircuit(circuit: Circuit): Node[] {
  if (circuit.route.mode === 'u') return [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
  return [...(circuit.items ?? [])]
}

type BuildState = {
  nodes: NodeCircuitNode[]
  edges: NodeCircuitEdge[]
}

function addNode(state: BuildState, name?: string): string {
  const id = newId('n')
  const x = 160 + state.nodes.length * 60
  const y = 140
  state.nodes.push(name ? { id, name, x, y } : { id, x, y })
  return id
}

function addEdge(state: BuildState, edge: NodeCircuitEdge) {
  state.edges.push(edge)
}

function buildSeries(state: BuildState, items: Node[], from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (items.length === 0) {
    // Empty series acts like a wire; model it as an ammeter edge.
    addEdge(state, { kind: 'ammeter', id: newId('eA'), a: from, b: to })
    return { ok: true }
  }
  let cursor = from
  for (let i = 0; i < items.length; i += 1) {
    const n = items[i]
    const next = i === items.length - 1 ? to : addNode(state)
    const r = buildNode(state, n, cursor, next)
    if (!r.ok) return r
    cursor = next
  }
  return { ok: true }
}

function buildNode(state: BuildState, node: Node, from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (node.kind === 'resistor') {
    addEdge(state, { kind: 'resistor', id: node.id, name: node.name, ohms: node.ohms, a: from, b: to })
    return { ok: true }
  }
  if (node.kind === 'ammeter') {
    addEdge(state, { kind: 'ammeter', id: node.id, name: node.name, a: from, b: to })
    return { ok: true }
  }
  if (node.kind === 'vsource' || node.kind === 'isource') {
    return { ok: false, error: 'Cannot convert a circuit with sources to a reducible node-based circuit.' }
  }
  if (node.kind === 'series') return buildSeries(state, node.items, from, to)
  // parallel
  for (const br of node.branches) {
    const r = buildSeries(state, br.items, from, to)
    if (!r.ok) return r
  }
  return { ok: true }
}

export function seriesParallelCircuitToNodeCircuit(circuit: Circuit): { ok: true; nodeCircuit: NodeCircuit } | { ok: false; error: string } {
  const state: BuildState = { nodes: [], edges: [] }
  const plusNodeId = addNode(state)
  const minusNodeId = addNode(state)

  const root = seriesItemsForCircuit(circuit)
  const built = buildSeries(state, root, plusNodeId, minusNodeId)
  if (!built.ok) return built

  return {
    ok: true,
    nodeCircuit: {
      kind: 'node_circuit',
      id: newId('nc'),
      plusNodeId,
      minusNodeId,
      nodes: state.nodes,
      edges: state.edges,
    },
  }
}
