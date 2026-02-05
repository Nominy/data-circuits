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

function seriesItemsForCircuit(circuit: Circuit): Node[] {
  if (circuit.route.mode === 'u') return [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
  return [...(circuit.items ?? [])]
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
  const resistors: ResistorResult[] = []
  const resistorIndexById: Record<string, number> = {}
  let resistorCounter = 0

  type CurrentContext = { formulaLatex: string }

  const recordResistor = (node: Resistor, currentA: number, voltageV: number, ctx: CurrentContext) => {
    if (!includeGenerated && node.generated) return
    resistorCounter += 1
    resistorIndexById[node.id] = resistorCounter
    resistors.push({
      id: node.id,
      index: resistorCounter,
      ohms: node.ohms,
      currentA,
      voltageV,
      currentFormulaLatex: ctx.formulaLatex,
      generated: node.generated,
      name: node.name,
    })
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
      recordResistor(node, currentA, voltageV, ctx)
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
