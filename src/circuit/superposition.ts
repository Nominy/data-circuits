import type { Circuit } from './model'
import { buildCircuitGraph } from './graph'
import type { GraphElement } from './graph'
import { solveMna } from './mna'

export type SuperpositionSource = {
  id: string
  kind: 'vsource' | 'isource'
  name?: string
  value: number
  unit: 'V' | 'A'
}

export type SourceCase = {
  source: SuperpositionSource
  nodeVoltages: number[]
  voltageSourceCurrentsById: Record<string, number>
  resistorCurrentsById: Record<string, number>
  resistorVoltagesById: Record<string, number>
}

export type SuperpositionOk = {
  ok: true
  sources: SuperpositionSource[]
  cases: SourceCase[]
  totalNodeVoltages: number[]
  totalVoltageSourceCurrentsById: Record<string, number>
  totalResistorCurrentsById: Record<string, number>
  totalResistorVoltagesById: Record<string, number>
}

export type SuperpositionErr = { ok: false; error: string }

function cloneElementsForActiveSource(elements: GraphElement[], active: SuperpositionSource): GraphElement[] {
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

function listIndependentSources(elements: GraphElement[]): SuperpositionSource[] {
  const sources: SuperpositionSource[] = []
  for (const e of elements) {
    if (e.kind === 'vsource' && e.independent) sources.push({ id: e.id, kind: 'vsource', name: e.name, value: e.volts, unit: 'V' })
    if (e.kind === 'isource') sources.push({ id: e.id, kind: 'isource', name: e.name, value: e.amps, unit: 'A' })
  }
  return sources
}

export function solveCircuitBySuperposition(
  circuit: Circuit,
  options?: { externalSupplyVolts?: number },
): SuperpositionOk | SuperpositionErr {
  const graph = buildCircuitGraph(circuit, options)
  const sources = listIndependentSources(graph.elements)
  if (sources.length === 0) return { ok: false, error: 'No independent sources found (add a source or provide external supply voltage).' }

  const resistorIds = new Set(graph.elements.filter((e) => e.kind === 'resistor').map((e) => e.id))
  const cases: SourceCase[] = []

  const totalNodeVoltages = new Array(graph.nodeCount).fill(0)
  const totalVoltageSourceCurrentsById: Record<string, number> = {}
  const totalResistorCurrentsById: Record<string, number> = {}
  const totalResistorVoltagesById: Record<string, number> = {}
  for (const id of resistorIds) {
    totalResistorCurrentsById[id] = 0
    totalResistorVoltagesById[id] = 0
  }

  for (const s of sources) {
    const elementsCase = cloneElementsForActiveSource(graph.elements, s)
    const solved = solveMna(elementsCase, graph.nodeCount, graph.minusNode)
    if (!solved.ok) return { ok: false, error: `While solving with only source ${s.name ?? s.id} active: ${solved.error}` }

    const nodeVoltages = solved.nodeVoltages
    const voltageSourceCurrentsById = solved.voltageSourceCurrentsById
    const resistorCurrentsById: Record<string, number> = {}
    const resistorVoltagesById: Record<string, number> = {}

    for (const e of elementsCase) {
      if (e.kind !== 'resistor') continue
      const v = nodeVoltages[e.n1] - nodeVoltages[e.n2]
      const i = v / e.ohms
      resistorCurrentsById[e.id] = i
      resistorVoltagesById[e.id] = v
    }

    for (let i = 0; i < totalNodeVoltages.length; i += 1) totalNodeVoltages[i] += nodeVoltages[i]
    for (const [id, iA] of Object.entries(voltageSourceCurrentsById)) {
      totalVoltageSourceCurrentsById[id] = (totalVoltageSourceCurrentsById[id] ?? 0) + iA
    }
    for (const [id, iA] of Object.entries(resistorCurrentsById)) totalResistorCurrentsById[id] = (totalResistorCurrentsById[id] ?? 0) + iA
    for (const [id, vV] of Object.entries(resistorVoltagesById)) totalResistorVoltagesById[id] = (totalResistorVoltagesById[id] ?? 0) + vV

    cases.push({ source: s, nodeVoltages, voltageSourceCurrentsById, resistorCurrentsById, resistorVoltagesById })
  }

  return {
    ok: true,
    sources,
    cases,
    totalNodeVoltages,
    totalVoltageSourceCurrentsById,
    totalResistorCurrentsById,
    totalResistorVoltagesById,
  }
}
