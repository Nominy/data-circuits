import { createEquivalentResistor } from './factory'
import type { Ammeter, Circuit, Node, ParallelBlock, Resistor, SeriesBlock, SeriesListKey } from './model'
import { isAtomic, listKeyForBranch, listKeyForSeriesBlock } from './model'

export type ReductionKind = 'series_list' | 'series_block' | 'parallel_block'

export type ReductionRecord = {
  kind: ReductionKind
  depth: number
  eqName: string
  resultOhms: number
  inputsOhms: number[]
}

export type ReductionLevel = {
  index: number
  circuit: Circuit
  reductions: ReductionRecord[]
  latexAligned: string
  latexAlign: string
}

type AtomicNode = Resistor | Ammeter

type Candidate =
  | { type: 'series_list'; depth: number; listKey: SeriesListKey; items: AtomicNode[] }
  | { type: 'u_root'; depth: number; items: AtomicNode[] }
  | { type: 'series_block'; depth: number; node: SeriesBlock }
  | { type: 'parallel_block'; depth: number; node: ParallelBlock }

function formatOhms(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const rounded =
    Math.abs(value) >= 1000
      ? value.toPrecision(6)
      : Math.abs(value) >= 1
        ? value.toFixed(6)
        : value.toPrecision(6)
  return rounded.replace(/\.?0+$/, '')
}

function atomicOhms(node: AtomicNode): number {
  return node.kind === 'ammeter' ? 0 : node.ohms
}

function sumOhms(items: AtomicNode[]): number {
  let sum = 0
  for (const node of items) sum += atomicOhms(node)
  return sum
}

function isWireLike(node: Node): boolean {
  if (node.kind !== 'series') return false
  if (node.items.length === 0) return true
  return node.items.every(isWireLike)
}

function seriesEquivalentOrError(items: Node[]): { ohms: number } | { error: string } {
  if (items.length === 0) return { error: 'Empty series group acts like a wire (0Ω) and would create a short.' }
  if (!items.every((n) => isAtomic(n) || isWireLike(n))) return { error: 'Internal error: expected atomic/wire series items.' }
  const atoms = items.filter(isAtomic) as AtomicNode[]
  const total = sumOhms(atoms)
  if (total === 0) return { error: 'Short circuit detected (0Ω series path).' }
  if (total < 0 || !Number.isFinite(total)) return { error: 'Invalid resistance value during reduction.' }
  return { ohms: total }
}

function parallelEquivalentOrError(node: ParallelBlock): { ohms: number; branchOhms: number[] } | { error: string } {
  if (node.branches.length < 2) return { error: 'Parallel block must have at least 2 branches.' }
  const branchOhms: number[] = []
  for (const branch of node.branches) {
    if (branch.items.length === 0) return { error: 'Empty parallel branch acts like a wire (0Ω) and creates a short.' }
    if (!branch.items.every(isAtomic)) return { error: 'Internal error: expected atomic parallel branches.' }
    const r = sumOhms(branch.items as AtomicNode[])
    if (r === 0) return { error: 'Short circuit detected: a parallel branch has 0Ω.' }
    branchOhms.push(r)
  }
  const denom = branchOhms.reduce((acc, r) => acc + 1 / r, 0)
  const eq = 1 / denom
  if (eq === 0) return { error: 'Short circuit detected (0Ω equivalent).' }
  if (eq < 0 || !Number.isFinite(eq)) return { error: 'Invalid resistance value during reduction.' }
  return { ohms: eq, branchOhms }
}

function scanCandidates(circuit: Circuit): { candidates: Candidate[]; error?: string } {
  const candidates: Candidate[] = []
  let error: string | undefined

  const scanList = (listKey: SeriesListKey, depth: number, items: Node[]) => {
    if (items.length === 0) return
    if (items.length >= 2 && items.every((n) => isAtomic(n) || isWireLike(n))) {
      const atoms = items.filter(isAtomic) as AtomicNode[]
      if (atoms.length >= 2) candidates.push({ type: 'series_list', depth, listKey, items: atoms })
      else if (atoms.length === 1 && items.some(isWireLike)) candidates.push({ type: 'series_list', depth, listKey, items: atoms })
    }
    for (const node of items) scanNode(node, depth)
  }

  const scanNode = (node: Node, depth: number) => {
    if (error) return
    if (node.kind === 'series') {
      if (node.items.length === 0) return
      if (node.items.every(isAtomic)) candidates.push({ type: 'series_block', depth, node })
      scanList(listKeyForSeriesBlock(node.id), depth + 1, node.items)
      return
    }

    if (node.kind === 'parallel') {
      if (node.branches.length < 2) return
      for (const branch of node.branches) scanList(listKeyForBranch(node.id, branch.id), depth + 1, branch.items)

      for (const branch of node.branches) {
        if (branch.items.length === 0) {
          error = 'Short circuit detected: an empty parallel branch is a wire (0Ω).'
          return
        }
        if (!branch.items.every(isAtomic)) return
        const r = sumOhms(branch.items as AtomicNode[])
        if (r === 0) {
          error = 'Short circuit detected: a parallel branch has 0Ω (ammeter-only path).'
          return
        }
      }
      candidates.push({ type: 'parallel_block', depth, node })
    }
  }

  if (circuit.route.mode === 'u') {
    const top = circuit.top ?? []
    const right = circuit.right ?? []
    const bottom = circuit.bottom ?? []
    scanList('root:top', 0, top)
    scanList('root:right', 0, right)
    scanList('root:bottom', 0, bottom)

    const canCombine =
      top.every((n) => isAtomic(n) || isWireLike(n)) &&
      right.every((n) => isAtomic(n) || isWireLike(n)) &&
      bottom.every((n) => isAtomic(n) || isWireLike(n)) &&
      top.filter((n) => !isWireLike(n)).length <= 1 &&
      right.filter((n) => !isWireLike(n)).length <= 1 &&
      bottom.filter((n) => !isWireLike(n)).length <= 1
    if (canCombine) {
      const combined = [...top, ...right, ...bottom].filter(isAtomic) as AtomicNode[]
      if (combined.length >= 2) candidates.push({ type: 'u_root', depth: 0, items: combined })
    }
  } else {
    scanList('root', 0, circuit.items ?? [])
  }

  return { candidates, error }
}

function reductionsToLatexAligned(reductions: ReductionRecord[]): { aligned: string; align: string } {
  if (reductions.length === 0) return { aligned: '', align: '' }

  const alignedLines: string[] = []
  const alignLines: string[] = []

  for (let i = 0; i < reductions.length; i += 1) {
    const r = reductions[i]
    const tag = i + 1
    const lhs = `R_{\\mathrm{eq},${tag}}`

    if (r.kind === 'parallel_block') {
      const invParts = r.inputsOhms.map((v) => `\\frac{1}{${formatOhms(v)}}`).join(' + ')
      alignedLines.push(
        `${lhs} &= \\left(${invParts}\\right)^{-1} = ${formatOhms(r.resultOhms)}\\,\\Omega\\quad\\text{(${tag})}`,
      )
      alignLines.push(
        `${lhs} &= \\left(${invParts}\\right)^{-1} = ${formatOhms(r.resultOhms)}\\,\\Omega \\tag{${tag}}`,
      )
      continue
    }

    const sumParts = r.inputsOhms.map((v) => formatOhms(v)).join(' + ')
    alignedLines.push(`${lhs} &= ${sumParts} = ${formatOhms(r.resultOhms)}\\,\\Omega\\quad\\text{(${tag})}`)
    alignLines.push(`${lhs} &= ${sumParts} = ${formatOhms(r.resultOhms)}\\,\\Omega \\tag{${tag}}`)
  }

  const alignedBody = alignedLines.join(' \\\\\n')
  const alignBody = alignLines.join(' \\\\\n')
  return {
    aligned: `\\begin{aligned}\n${alignedBody}\n\\end{aligned}`,
    align: `\\begin{align}\n${alignBody}\n\\end{align}`,
  }
}

export function reduceOneLevel(
  circuit: Circuit,
  levelIndex: number,
): { circuit: Circuit; reductions: ReductionRecord[]; latexAligned: string; latexAlign: string } | { error: string } {
  const { candidates, error } = scanCandidates(circuit)
  if (error) return { error }
  if (candidates.length === 0) return { circuit, reductions: [], latexAligned: '', latexAlign: '' }

  const maxDepth = Math.max(...candidates.map((c) => c.depth))
  const targets = candidates.filter((c) => c.depth === maxDepth)

  const seriesListTargets = new Map<SeriesListKey, Resistor>()
  const seriesBlockTargets = new Map<string, Resistor>()
  const parallelBlockTargets = new Map<string, Resistor>()
  let uRootReplacement: Resistor | null = null

  const reductions: ReductionRecord[] = []
  let eqCounter = 0

  for (const target of targets) {
    eqCounter += 1
    const eqName = `Req${levelIndex}.${eqCounter}`

    if (target.type === 'series_list') {
      const eq = seriesEquivalentOrError(target.items)
      if ('error' in eq) return { error: eq.error }
      const resistor = createEquivalentResistor(eq.ohms, eqName)
      seriesListTargets.set(target.listKey, resistor)
      reductions.push({
        kind: 'series_list',
        depth: target.depth,
        eqName,
        resultOhms: eq.ohms,
        inputsOhms: target.items.map(atomicOhms),
      })
      continue
    }

    if (target.type === 'u_root') {
      const eq = seriesEquivalentOrError(target.items)
      if ('error' in eq) return { error: eq.error }
      uRootReplacement = createEquivalentResistor(eq.ohms, eqName)
      reductions.push({
        kind: 'series_list',
        depth: target.depth,
        eqName,
        resultOhms: eq.ohms,
        inputsOhms: target.items.map(atomicOhms),
      })
      continue
    }

    if (target.type === 'series_block') {
      const eq = seriesEquivalentOrError(target.node.items)
      if ('error' in eq) return { error: eq.error }
      const resistor = createEquivalentResistor(eq.ohms, eqName)
      seriesBlockTargets.set(target.node.id, resistor)
      reductions.push({
        kind: 'series_block',
        depth: target.depth,
        eqName,
        resultOhms: eq.ohms,
        inputsOhms: (target.node.items as AtomicNode[]).map(atomicOhms),
      })
      continue
    }

    if (target.type === 'parallel_block') {
      const eq = parallelEquivalentOrError(target.node)
      if ('error' in eq) return { error: eq.error }
      const resistor = createEquivalentResistor(eq.ohms, eqName)
      parallelBlockTargets.set(target.node.id, resistor)
      const flatInputs = target.node.branches.map((b) => sumOhms(b.items as AtomicNode[]))
      reductions.push({
        kind: 'parallel_block',
        depth: target.depth,
        eqName,
        resultOhms: eq.ohms,
        inputsOhms: flatInputs,
      })
    }
  }

  const transformList = (listKey: SeriesListKey, depth: number, items: Node[]): Node[] => {
    const replacement = seriesListTargets.get(listKey)
    if (replacement) return [replacement]
    return items.map((n) => transformNode(n, depth))
  }

  const transformNode = (node: Node, depth: number): Node => {
    if (node.kind === 'series') {
      const replacement = seriesBlockTargets.get(node.id)
      if (replacement) return replacement
      return { ...node, items: transformList(listKeyForSeriesBlock(node.id), depth + 1, node.items) }
    }
    if (node.kind === 'parallel') {
      const replacement = parallelBlockTargets.get(node.id)
      if (replacement) return replacement
      return {
        ...node,
        branches: node.branches.map((b) => ({
          ...b,
          items: transformList(listKeyForBranch(node.id, b.id), depth + 1, b.items),
        })),
      }
    }
    return node
  }

  let nextCircuit: Circuit
  if (circuit.route.mode === 'u') {
    if (uRootReplacement) {
      // Once the U-root is collapsed to a single equivalent resistor, switch to a straight circuit for clarity.
      nextCircuit = { kind: 'circuit', id: circuit.id, route: { mode: 'straight' }, items: [uRootReplacement] }
    } else {
      nextCircuit = {
        ...circuit,
        top: transformList('root:top', 0, circuit.top ?? []),
        right: transformList('root:right', 0, circuit.right ?? []),
        bottom: transformList('root:bottom', 0, circuit.bottom ?? []),
      }
    }
  } else {
    nextCircuit = { ...circuit, items: transformList('root', 0, circuit.items ?? []) }
  }

  const { aligned, align } = reductionsToLatexAligned(reductions)
  return { circuit: nextCircuit, reductions, latexAligned: aligned, latexAlign: align }
}

export function computeReductionLevels(
  circuit: Circuit,
  maxLevels = 50,
): { levels: ReductionLevel[] } | { error: string; levels: ReductionLevel[] } {
  const levels: ReductionLevel[] = [{ index: 0, circuit, reductions: [], latexAligned: '', latexAlign: '' }]

  let current = circuit
  for (let i = 1; i <= maxLevels; i += 1) {
    const result = reduceOneLevel(current, i)
    if ('error' in result) return { error: result.error, levels }
    if (result.reductions.length === 0) return { levels }
    current = result.circuit
    levels.push({
      index: i,
      circuit: current,
      reductions: result.reductions,
      latexAligned: result.latexAligned,
      latexAlign: result.latexAlign,
    })
  }
  return { error: 'Reduction limit reached.', levels }
}
