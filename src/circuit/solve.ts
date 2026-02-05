import type { Ammeter, Circuit, Node, Resistor } from './model'
import { buildCircuitGraph } from './graph'
import { solveCircuitBySuperposition, type SuperpositionOk, type SuperpositionSource } from './superposition'

export type ResistorResult = {
  id: string
  index: number
  ohms: number
  currentA: number
  voltageV: number
  currentFormulaLatex: string
  generated?: boolean
  name?: string
}

export type AmmeterResult = {
  id: string
  index: number
  currentA: number
  currentFormulaLatex: string
  name?: string
}

export type SuperpositionDetails = {
  sources: SuperpositionSource[]
  cases: SuperpositionOk['cases']
  totalNodeVoltages: number[]
  totalVoltageSourceCurrentsById: Record<string, number>
}

export type CircuitSolveResult = {
  externalSupplyVolts?: number
  externalSupplyCurrentA?: number
  resistors: ResistorResult[]
  ammeters: AmmeterResult[]
  resistorIndexById: Record<string, number>
  ammeterIndexById: Record<string, number>
  superposition: SuperpositionDetails
}

type SolveOptions = {
  includeGeneratedResistors?: boolean
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const rounded =
    Math.abs(value) >= 1000
      ? value.toPrecision(6)
      : Math.abs(value) >= 1
        ? value.toFixed(6)
        : value.toPrecision(6)
  return rounded.replace(/\.?0+$/, '')
}

type SolveOk = { ok: true; result: CircuitSolveResult }
type SolveErr = { ok: false; error: string }

function visitNodes(items: Node[], fn: (node: Node) => void) {
  for (const node of items) {
    fn(node)
    if (node.kind === 'series') visitNodes(node.items, fn)
    if (node.kind === 'parallel') {
      for (const b of node.branches) visitNodes(b.items, fn)
    }
  }
}

function seriesItemsForCircuit(circuit: Circuit): Node[] {
  if (circuit.route.mode === 'u') return [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
  return [...(circuit.items ?? [])]
}

function parseResistorIndex(name: string): number | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return null
  // Accept: R1, R_1, R{1}, R_{1}, r 1
  const m = trimmed.match(/^R\s*(?:[_-]?\s*)?(?:\{?\s*_?\s*\{?\s*)?(\d+)\s*\}*\s*$/i)
  if (!m) return null
  const idx = Number(m[1])
  if (!Number.isInteger(idx)) return null
  return idx
}

function parseAmmeterIndex(name: string): number | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return null
  // Accept: A1, A_1, A{1}, A_{1}, a 1
  const m = trimmed.match(/^A\s*(?:[_-]?\s*)?(?:\{?\s*_?\s*\{?\s*)?(\d+)\s*\}*\s*$/i)
  if (!m) return null
  const idx = Number(m[1])
  if (!Number.isInteger(idx)) return null
  return idx
}

function assignResistorIndices(
  circuit: Circuit,
  includeGeneratedResistors: boolean,
): { ok: true; indexById: Record<string, number> } | { ok: false; error: string } {
  const resistors: Resistor[] = []
  const root = seriesItemsForCircuit(circuit)
  visitNodes(root, (n) => {
    if (n.kind !== 'resistor') return
    if (!includeGeneratedResistors && n.generated) return
    resistors.push(n)
  })

  const used = new Map<number, string>()
  const indexById: Record<string, number> = {}
  const unspecified: Resistor[] = []

  for (const r of resistors) {
    const label = r.name?.trim() ?? ''
    if (label.length === 0) {
      unspecified.push(r)
      continue
    }
    const idx = parseResistorIndex(label)
    if (idx === null) {
      return {
        ok: false,
        error: `Invalid resistor label "${label}". Use R1 / R_1 / R{1} / R_{1} to set its index.`,
      }
    }
    if (idx <= 0) return { ok: false, error: `Invalid resistor index R_${idx}. Indices must be positive integers (>= 1).` }
    const prev = used.get(idx)
    if (prev) return { ok: false, error: `Duplicate resistor index R_${idx}. Each resistor must have a unique index.` }
    used.set(idx, r.id)
    indexById[r.id] = idx
  }

  let next = 1
  for (const r of unspecified) {
    while (used.has(next)) next += 1
    used.set(next, r.id)
    indexById[r.id] = next
    next += 1
  }

  return { ok: true, indexById }
}

function assignAmmeterIndices(
  circuit: Circuit,
): { ok: true; indexById: Record<string, number> } | { ok: false; error: string } {
  const ammeters: Ammeter[] = []
  const root = seriesItemsForCircuit(circuit)
  visitNodes(root, (n) => {
    if (n.kind !== 'ammeter') return
    ammeters.push(n)
  })

  const used = new Map<number, string>()
  const indexById: Record<string, number> = {}
  const unspecified: Ammeter[] = []

  for (const a of ammeters) {
    const label = a.name?.trim() ?? ''
    if (label.length === 0) {
      unspecified.push(a)
      continue
    }
    const idx = parseAmmeterIndex(label)
    if (idx === null) {
      return {
        ok: false,
        error: `Invalid ammeter label "${label}". Use A1 / A_1 / A{1} / A_{1} to set its index.`,
      }
    }
    if (idx <= 0) return { ok: false, error: `Invalid ammeter index A_${idx}. Indices must be positive integers (>= 1).` }
    const prev = used.get(idx)
    if (prev) return { ok: false, error: `Duplicate ammeter index A_${idx}. Each ammeter must have a unique index.` }
    used.set(idx, a.id)
    indexById[a.id] = idx
  }

  let next = 1
  for (const a of unspecified) {
    while (used.has(next)) next += 1
    used.set(next, a.id)
    indexById[a.id] = next
    next += 1
  }

  return { ok: true, indexById }
}

export function solveCircuit(
  circuit: Circuit,
  analysis?: { externalSupplyVolts?: number },
  options?: SolveOptions,
): SolveOk | SolveErr {
  const includeGenerated = options?.includeGeneratedResistors ?? false
  const assigned = assignResistorIndices(circuit, includeGenerated)
  if (!assigned.ok) return { ok: false, error: assigned.error }
  const resistorIndexById = assigned.indexById
  const assignedAmmeters = assignAmmeterIndices(circuit)
  if (!assignedAmmeters.ok) return { ok: false, error: assignedAmmeters.error }
  const ammeterIndexById = assignedAmmeters.indexById

  const externalSupplyVolts = analysis?.externalSupplyVolts
  if (typeof externalSupplyVolts === 'number' && (!Number.isFinite(externalSupplyVolts) || externalSupplyVolts < 0)) {
    return { ok: false, error: 'External supply voltage must be a finite, non-negative number.' }
  }

  const solved = solveCircuitBySuperposition(circuit, { externalSupplyVolts })
  if (!solved.ok) return solved

  const graph = buildCircuitGraph(circuit, { externalSupplyVolts })
  const resistorElements = graph.elements.filter((e) => e.kind === 'resistor')
  const ammeterElements = graph.elements
    .filter((e) => e.kind === 'vsource' && e.id.startsWith('ammeter:'))
    .map((e) => ({ id: e.id.slice('ammeter:'.length), name: e.name }))

  const resistors: ResistorResult[] = []
  for (const r of resistorElements) {
    if (!includeGenerated && r.generated) continue
    const idx = resistorIndexById[r.id]
    if (!idx) return { ok: false, error: 'Internal error: missing resistor index assignment.' }
    const currentA = solved.totalResistorCurrentsById[r.id] ?? 0
    const voltageV = solved.totalResistorVoltagesById[r.id] ?? currentA * r.ohms
    resistors.push({
      id: r.id,
      index: idx,
      ohms: r.ohms,
      currentA,
      voltageV,
      currentFormulaLatex: `\\frac{${formatNum(voltageV)}}{${formatNum(r.ohms)}} = ${formatNum(currentA)}\\,\\mathrm{A}`,
      generated: r.generated,
      name: r.name,
    })
  }
  resistors.sort((a, b) => a.index - b.index)

  const ammeters: AmmeterResult[] = []
  for (const a of ammeterElements) {
    const idx = ammeterIndexById[a.id]
    if (!idx) return { ok: false, error: 'Internal error: missing ammeter index assignment.' }
    const currentA = solved.totalVoltageSourceCurrentsById[`ammeter:${a.id}`] ?? 0
    ammeters.push({
      id: a.id,
      index: idx,
      currentA,
      currentFormulaLatex: `${formatNum(currentA)}\\,\\mathrm{A}`,
      name: a.name,
    })
  }
  ammeters.sort((a, b) => a.index - b.index)

  const externalSupplyCurrentA =
    typeof externalSupplyVolts === 'number' && Number.isFinite(externalSupplyVolts)
      ? solved.totalVoltageSourceCurrentsById['external_supply']
      : undefined

  return {
    ok: true,
    result: {
      externalSupplyVolts,
      externalSupplyCurrentA,
      resistors,
      ammeters,
      resistorIndexById,
      ammeterIndexById,
      superposition: {
        sources: solved.sources,
        cases: solved.cases,
        totalNodeVoltages: solved.totalNodeVoltages,
        totalVoltageSourceCurrentsById: solved.totalVoltageSourceCurrentsById,
      },
    },
  }
}
