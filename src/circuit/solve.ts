import type { Circuit, Node, ParallelBlock, Resistor } from './model'

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

export type CircuitSolveResult = {
  supplyVolts: number
  totalOhms: number
  totalCurrentA: number
  resistors: ResistorResult[]
  resistorIndexById: Record<string, number>
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

type EqOk = { ok: true; ohms: number }
type EqErr = { ok: false; error: string }

function eqErr(error: string): EqErr {
  return { ok: false, error }
}

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

function equivalentResistanceOfParallel(node: ParallelBlock): EqOk | EqErr {
  if (node.branches.length < 2) return eqErr('Parallel block must have at least 2 branches.')
  const branchOhms: number[] = []
  for (const b of node.branches) {
    const r = equivalentResistanceOfSeries(b.items)
    if (!r.ok) return r
    if (r.ohms === 0) return eqErr('Short circuit detected: a parallel branch has 0Ω.')
    branchOhms.push(r.ohms)
  }
  const denom = branchOhms.reduce((acc, r) => acc + 1 / r, 0)
  const ohms = 1 / denom
  if (ohms === 0) return eqErr('Short circuit detected (0Ω equivalent).')
  if (!Number.isFinite(ohms) || ohms < 0) return eqErr('Invalid resistance value during reduction.')
  return { ok: true, ohms }
}

function equivalentResistanceOfNode(node: Node): EqOk | EqErr {
  if (node.kind === 'ammeter') return { ok: true, ohms: 0 }
  if (node.kind === 'resistor') {
    if (!Number.isFinite(node.ohms) || node.ohms <= 0) return eqErr('Invalid resistance value.')
    return { ok: true, ohms: node.ohms }
  }
  if (node.kind === 'series') return equivalentResistanceOfSeries(node.items)
  return equivalentResistanceOfParallel(node)
}

function equivalentResistanceOfSeries(items: Node[]): EqOk | EqErr {
  if (items.length === 0) return { ok: true, ohms: 0 }
  let sum = 0
  for (const n of items) {
    const r = equivalentResistanceOfNode(n)
    if (!r.ok) return r
    sum += r.ohms
  }
  if (!Number.isFinite(sum) || sum < 0) return eqErr('Invalid resistance value during reduction.')
  return { ok: true, ohms: sum }
}

export function solveCircuitCurrentsAndVoltages(
  circuit: Circuit,
  supplyVolts: number,
  options?: SolveOptions,
): { ok: true; result: CircuitSolveResult } | { ok: false; error: string } {
  if (!Number.isFinite(supplyVolts)) return { ok: false, error: 'Supply voltage must be a finite number.' }
  if (supplyVolts < 0) return { ok: false, error: 'Supply voltage must be non-negative.' }

  const rootItems = seriesItemsForCircuit(circuit)
  const totalR = equivalentResistanceOfSeries(rootItems)
  if (!totalR.ok) return { ok: false, error: totalR.error }
  if (totalR.ohms === 0) return { ok: false, error: 'Short circuit detected (0Ω total resistance).' }

  const totalCurrentA = supplyVolts / totalR.ohms
  if (!Number.isFinite(totalCurrentA)) return { ok: false, error: 'Invalid current result.' }

  const includeGenerated = options?.includeGeneratedResistors ?? false
  const assigned = assignResistorIndices(circuit, includeGenerated)
  if (!assigned.ok) return { ok: false, error: assigned.error }
  const indexByResistorId = assigned.indexById

  const resistors: ResistorResult[] = []
  const resistorIndexById: Record<string, number> = { ...indexByResistorId }

  type CurrentContext = { formulaLatex: string }

  const recordResistor = (node: Resistor, currentA: number, voltageV: number, ctx: CurrentContext): EqErr | null => {
    if (!includeGenerated && node.generated) return null
    const idx = indexByResistorId[node.id]
    if (!idx) return eqErr('Internal error: missing resistor index assignment.')
    resistors.push({
      id: node.id,
      index: idx,
      ohms: node.ohms,
      currentA,
      voltageV,
      currentFormulaLatex: ctx.formulaLatex,
      generated: node.generated,
      name: node.name,
    })
    return null
  }

  const solveSeries = (items: Node[], currentA: number, ctx: CurrentContext) => {
    for (const n of items) {
      const r = equivalentResistanceOfNode(n)
      if (!r.ok) return r
      const v = currentA * r.ohms
      const solved = solveNode(n, currentA, v, ctx)
      if (!solved.ok) return solved
    }
    return { ok: true as const }
  }

  const solveNode = (node: Node, currentA: number, voltageV: number, ctx: CurrentContext): { ok: true } | EqErr => {
    if (node.kind === 'ammeter') return { ok: true }
    if (node.kind === 'resistor') {
      const err = recordResistor(node, currentA, voltageV, ctx)
      if (err) return err
      return { ok: true }
    }
    if (node.kind === 'series') return solveSeries(node.items, currentA, ctx)

    // parallel: voltage shared, currents split
    for (const b of node.branches) {
      const rBranch = equivalentResistanceOfSeries(b.items)
      if (!rBranch.ok) return rBranch
      if (rBranch.ohms === 0) return eqErr('Short circuit detected: a parallel branch has 0Ω.')
      const iBranch = voltageV / rBranch.ohms
      if (!Number.isFinite(iBranch)) return eqErr('Invalid current result.')
      const branchCtx: CurrentContext = {
        formulaLatex: `\\frac{${formatNum(voltageV)}}{${formatNum(rBranch.ohms)}} = ${formatNum(iBranch)}\\,\\mathrm{A}`,
      }
      const solved = solveSeries(b.items, iBranch, branchCtx)
      if (!solved.ok) return solved
    }
    return { ok: true }
  }

  const rootCtx: CurrentContext = {
    formulaLatex: `\\frac{U_s}{R_{\\mathrm{eq}}} = \\frac{${formatNum(supplyVolts)}}{${formatNum(totalR.ohms)}} = ${formatNum(totalCurrentA)}\\,\\mathrm{A}`,
  }
  const solvedRoot = solveSeries(rootItems, totalCurrentA, rootCtx)
  if (!solvedRoot.ok) return { ok: false, error: solvedRoot.error }

  resistors.sort((a, b) => a.index - b.index)

  return {
    ok: true,
    result: {
      supplyVolts,
      totalOhms: totalR.ohms,
      totalCurrentA,
      resistors,
      resistorIndexById,
    },
  }
}
