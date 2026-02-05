import type { Circuit, Node, ParallelBranch } from './model'

export type GraphResistor = {
  kind: 'resistor'
  id: string
  name?: string
  ohms: number
  generated?: boolean
  n1: number
  n2: number
}

export type GraphCurrentSource = {
  kind: 'isource'
  id: string
  name?: string
  amps: number
  nFrom: number
  nTo: number
  independent: true
}

export type GraphVoltageSource = {
  kind: 'vsource'
  id: string
  name?: string
  volts: number
  nPlus: number
  nMinus: number
  independent: boolean
}

export type GraphElement = GraphResistor | GraphCurrentSource | GraphVoltageSource

export type CircuitGraph = {
  plusNode: number
  minusNode: number
  nodeCount: number
  elements: GraphElement[]
}

function seriesItemsForCircuit(circuit: Circuit): Node[] {
  if (circuit.route.mode === 'u') return [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
  return [...(circuit.items ?? [])]
}

function maxNodeId(elements: GraphElement[]): number {
  let max = 0
  for (const e of elements) {
    if (e.kind === 'resistor') max = Math.max(max, e.n1, e.n2)
    else if (e.kind === 'vsource') max = Math.max(max, e.nPlus, e.nMinus)
    else max = Math.max(max, e.nFrom, e.nTo)
  }
  return max
}

type BuildState = {
  nextNode: number
  elements: GraphElement[]
}

function newNode(state: BuildState): number {
  const id = state.nextNode
  state.nextNode += 1
  return id
}

function buildSeries(state: BuildState, items: Node[], from: number, to: number) {
  if (items.length === 0) {
    // Empty series acts like a wire: enforce V(from) = V(to)
    state.elements.push({
      kind: 'vsource',
      id: `wire:series:${from}->${to}:${state.elements.length}`,
      volts: 0,
      nPlus: from,
      nMinus: to,
      independent: false,
    })
    return
  }

  let cursor = from
  for (let i = 0; i < items.length; i += 1) {
    const node = items[i]
    const next = i === items.length - 1 ? to : newNode(state)
    buildNode(state, node, cursor, next)
    cursor = next
  }
}

function buildParallelBranch(state: BuildState, branch: ParallelBranch, from: number, to: number) {
  buildSeries(state, branch.items, from, to)
}

function buildNode(state: BuildState, node: Node, from: number, to: number) {
  if (node.kind === 'resistor') {
    state.elements.push({ kind: 'resistor', id: node.id, name: node.name, ohms: node.ohms, generated: node.generated, n1: from, n2: to })
    return
  }
  if (node.kind === 'ammeter') {
    state.elements.push({
      kind: 'vsource',
      id: `ammeter:${node.id}`,
      name: node.name,
      volts: 0,
      nPlus: from,
      nMinus: to,
      independent: false,
    })
    return
  }
  if (node.kind === 'vsource') {
    state.elements.push({
      kind: 'vsource',
      id: node.id,
      name: node.name,
      volts: node.volts,
      nPlus: from,
      nMinus: to,
      independent: true,
    })
    return
  }
  if (node.kind === 'isource') {
    state.elements.push({
      kind: 'isource',
      id: node.id,
      name: node.name,
      amps: node.amps,
      nFrom: from,
      nTo: to,
      independent: true,
    })
    return
  }
  if (node.kind === 'series') {
    buildSeries(state, node.items, from, to)
    return
  }
  // parallel
  for (const b of node.branches) buildParallelBranch(state, b, from, to)
}

export function buildCircuitGraph(
  circuit: Circuit,
  options?: { externalSupplyVolts?: number },
): CircuitGraph {
  const plusNode = 1
  const minusNode = 0
  const state: BuildState = { nextNode: 2, elements: [] }

  const root = seriesItemsForCircuit(circuit)
  buildSeries(state, root, plusNode, minusNode)

  const supplyVolts = options?.externalSupplyVolts
  if (typeof supplyVolts === 'number' && Number.isFinite(supplyVolts)) {
    state.elements.push({
      kind: 'vsource',
      id: 'external_supply',
      name: 'U_s',
      volts: supplyVolts,
      nPlus: plusNode,
      nMinus: minusNode,
      independent: true,
    })
  }

  const nodeCount = Math.max(plusNode, minusNode, maxNodeId(state.elements)) + 1
  return { plusNode, minusNode, nodeCount, elements: state.elements }
}

export function circuitHasIndependentSources(circuit: Circuit): boolean {
  const root = seriesItemsForCircuit(circuit)
  const stack: Node[] = [...root]
  while (stack.length) {
    const n = stack.pop()!
    if (n.kind === 'vsource' || n.kind === 'isource') return true
    if (n.kind === 'series') stack.push(...n.items)
    if (n.kind === 'parallel') {
      for (const b of n.branches) stack.push(...b.items)
    }
  }
  return false
}
