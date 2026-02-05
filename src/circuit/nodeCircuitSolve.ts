import type { GraphElement } from './graph'
import type { NodeCircuit, NodeCircuitEdge } from './nodeCircuit'
import { solveMna } from './mna'

export type NodeCircuitSuperpositionSource = {
  id: string
  kind: 'vsource' | 'isource'
  name?: string
  value: number
  unit: 'V' | 'A'
}

export type NodeCircuitSourceCase = {
  source: NodeCircuitSuperpositionSource
  nodeVoltages: number[]
  voltageSourceCurrentsById: Record<string, number>
  resistorCurrentsById: Record<string, number>
  resistorVoltagesById: Record<string, number>
  currentSourceVoltagesById: Record<string, number>
}

export type NodeCircuitSuperpositionOk = {
  ok: true
  sources: NodeCircuitSuperpositionSource[]
  cases: NodeCircuitSourceCase[]
  nodeVoltages: number[]
  nodeVoltageByNodeId: Record<string, number>
  voltageSourceCurrentsById: Record<string, number>
  resistorCurrentsById: Record<string, number>
  resistorVoltagesById: Record<string, number>
  currentSourceVoltagesById: Record<string, number>
}

export type NodeCircuitSuperpositionErr = { ok: false; error: string }

function buildIndexMap(nodes: NodeCircuit['nodes']): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < nodes.length; i += 1) m.set(nodes[i].id, i)
  return m
}

function contractWires(
  nodeCircuit: NodeCircuit,
  nodeIndex: Map<string, number>,
): { ok: true; oldToNew: number[]; nodeCount: number } | { ok: false; error: string } {
  const parent: number[] = Array.from({ length: nodeCircuit.nodes.length }, (_, i) => i)
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]
    let cur = x
    while (parent[cur] !== cur) {
      const p = parent[cur]
      parent[cur] = r
      cur = p
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    parent[rb] = ra
  }

  for (const e of nodeCircuit.edges) {
    if (e.kind !== 'wire') continue
    const a = nodeIndex.get(e.a)
    const b = nodeIndex.get(e.b)
    if (a === undefined || b === undefined) return { ok: false, error: 'Invalid circuit: a wire references a missing node.' }
    if (a === b) continue
    union(a, b)
  }

  const repToNew = new Map<number, number>()
  const oldToNew: number[] = new Array(nodeCircuit.nodes.length)
  let nodeCount = 0
  for (let i = 0; i < nodeCircuit.nodes.length; i += 1) {
    const rep = find(i)
    let idx = repToNew.get(rep)
    if (idx === undefined) {
      idx = nodeCount
      repToNew.set(rep, idx)
      nodeCount += 1
    }
    oldToNew[i] = idx
  }
  return { ok: true, oldToNew, nodeCount }
}

function listIndependentSources(elements: GraphElement[]): NodeCircuitSuperpositionSource[] {
  const sources: NodeCircuitSuperpositionSource[] = []
  for (const e of elements) {
    if (e.kind === 'vsource' && e.independent) sources.push({ id: e.id, kind: 'vsource', name: e.name, value: e.volts, unit: 'V' })
    if (e.kind === 'isource') sources.push({ id: e.id, kind: 'isource', name: e.name, value: e.amps, unit: 'A' })
  }
  return sources
}

function cloneElementsForActiveSource(elements: GraphElement[], active: NodeCircuitSuperpositionSource): GraphElement[] {
  return elements.map((e) => {
    if (e.kind === 'vsource') {
      if (!e.independent) return e
      return e.id === active.id ? e : { ...e, volts: 0 }
    }
    if (e.kind === 'isource') {
      return e.id === active.id ? e : { ...e, amps: 0 }
    }
    return e
  })
}

function ensureFinitePositiveOhms(edge: Extract<NodeCircuitEdge, { kind: 'resistor' }>): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(edge.ohms) || edge.ohms <= 0) return { ok: false, error: 'Invalid resistance value.' }
  return { ok: true }
}

export function solveNodeCircuitBySuperposition(
  nodeCircuit: NodeCircuit,
): NodeCircuitSuperpositionOk | NodeCircuitSuperpositionErr {
  if (nodeCircuit.nodes.length < 2) return { ok: false, error: 'Add at least 2 nodes.' }

  const nodeIndex = buildIndexMap(nodeCircuit.nodes)
  const firstV = nodeCircuit.edges.find((e) => e.kind === 'vsource')
  const groundOld = firstV ? nodeIndex.get(firstV.b) ?? 0 : 0

  const contracted = contractWires(nodeCircuit, nodeIndex)
  if (!contracted.ok) return contracted
  const { oldToNew, nodeCount } = contracted
  if (nodeCount < 2) return { ok: false, error: 'Invalid circuit: too few distinct nodes.' }
  const ground = oldToNew[groundOld]

  const elements: GraphElement[] = []
  const resistorIds = new Set<string>()
  const currentSourceIds = new Set<string>()

  for (const e of nodeCircuit.edges) {
    const aOld = nodeIndex.get(e.a)
    const bOld = nodeIndex.get(e.b)
    if (aOld === undefined || bOld === undefined) return { ok: false, error: 'Invalid circuit: an edge references a missing node.' }
    const a = oldToNew[aOld]
    const b = oldToNew[bOld]
    if (e.kind === 'wire') continue

    if (e.kind === 'resistor') {
      const okOhms = ensureFinitePositiveOhms(e)
      if (!okOhms.ok) return okOhms
      if (a === b) continue
      elements.push({ kind: 'resistor', id: e.id, name: e.name, ohms: e.ohms, n1: a, n2: b, generated: false })
      resistorIds.add(e.id)
      continue
    }
    if (e.kind === 'ammeter') {
      if (a === b) continue
      elements.push({ kind: 'vsource', id: `ammeter:${e.id}`, name: e.name, volts: 0, nPlus: a, nMinus: b, independent: false })
      continue
    }
    if (e.kind === 'vsource') {
      if (!Number.isFinite(e.volts)) return { ok: false, error: 'Invalid voltage source value.' }
      if (a === b && e.volts !== 0) return { ok: false, error: 'Invalid circuit: a voltage source is shorted by wire.' }
      if (a === b) continue
      elements.push({ kind: 'vsource', id: e.id, name: e.name, volts: e.volts, nPlus: a, nMinus: b, independent: true })
      continue
    }
    // isource
    if (!Number.isFinite(e.amps)) return { ok: false, error: 'Invalid current source value.' }
    if (a === b) continue
    elements.push({ kind: 'isource', id: e.id, name: e.name, amps: e.amps, nFrom: a, nTo: b, independent: true })
    currentSourceIds.add(e.id)
  }

  if (elements.length === 0) return { ok: false, error: 'No components.' }

  const sources = listIndependentSources(elements)
  if (sources.length === 0) return { ok: false, error: 'No independent sources found (add a source or provide external supply voltage).' }

  const cases: NodeCircuitSourceCase[] = []

  const totalNodeVoltages = new Array(nodeCount).fill(0)
  const totalVoltageSourceCurrentsById: Record<string, number> = {}
  const totalResistorCurrentsById: Record<string, number> = {}
  const totalResistorVoltagesById: Record<string, number> = {}
  const totalCurrentSourceVoltagesById: Record<string, number> = {}
  for (const id of resistorIds) {
    totalResistorCurrentsById[id] = 0
    totalResistorVoltagesById[id] = 0
  }
  for (const id of currentSourceIds) totalCurrentSourceVoltagesById[id] = 0

  for (const s of sources) {
    const elementsCase = cloneElementsForActiveSource(elements, s)
    const solved = solveMna(elementsCase, nodeCount, ground)
    if (!solved.ok) return { ok: false, error: `While solving with only source ${s.name ?? s.id} active: ${solved.error}` }

    const nodeVoltages = solved.nodeVoltages
    const voltageSourceCurrentsById = solved.voltageSourceCurrentsById
    const resistorCurrentsById: Record<string, number> = {}
    const resistorVoltagesById: Record<string, number> = {}
    const currentSourceVoltagesById: Record<string, number> = {}

    for (const e of elementsCase) {
      if (e.kind === 'resistor') {
        const v = nodeVoltages[e.n1] - nodeVoltages[e.n2]
        const i = v / e.ohms
        resistorCurrentsById[e.id] = i
        resistorVoltagesById[e.id] = v
      } else if (e.kind === 'isource') {
        currentSourceVoltagesById[e.id] = nodeVoltages[e.nFrom] - nodeVoltages[e.nTo]
      }
    }

    for (let i = 0; i < totalNodeVoltages.length; i += 1) totalNodeVoltages[i] += nodeVoltages[i]
    for (const [id, iA] of Object.entries(voltageSourceCurrentsById)) {
      totalVoltageSourceCurrentsById[id] = (totalVoltageSourceCurrentsById[id] ?? 0) + iA
    }
    for (const [id, iA] of Object.entries(resistorCurrentsById)) totalResistorCurrentsById[id] = (totalResistorCurrentsById[id] ?? 0) + iA
    for (const [id, vV] of Object.entries(resistorVoltagesById)) totalResistorVoltagesById[id] = (totalResistorVoltagesById[id] ?? 0) + vV
    for (const [id, vV] of Object.entries(currentSourceVoltagesById)) totalCurrentSourceVoltagesById[id] = (totalCurrentSourceVoltagesById[id] ?? 0) + vV

    cases.push({ source: s, nodeVoltages, voltageSourceCurrentsById, resistorCurrentsById, resistorVoltagesById, currentSourceVoltagesById })
  }

  return {
    ok: true,
    sources,
    cases,
    nodeVoltages: totalNodeVoltages,
    nodeVoltageByNodeId: Object.fromEntries(nodeCircuit.nodes.map((n) => [n.id, totalNodeVoltages[oldToNew[nodeIndex.get(n.id)!]]])),
    voltageSourceCurrentsById: totalVoltageSourceCurrentsById,
    resistorCurrentsById: totalResistorCurrentsById,
    resistorVoltagesById: totalResistorVoltagesById,
    currentSourceVoltagesById: totalCurrentSourceVoltagesById,
  }
}
