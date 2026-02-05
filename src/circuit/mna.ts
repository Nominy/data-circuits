import type { GraphElement } from './graph'

export type MnaOk = {
  ok: true
  nodeVoltages: number[]
  voltageSourceCurrentsById: Record<string, number>
}

export type MnaErr = { ok: false; error: string }

function zeroMatrix(n: number): number[][] {
  const a: number[][] = new Array(n)
  for (let i = 0; i < n; i += 1) a[i] = new Array(n).fill(0)
  return a
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row) => row.slice())
  const rhs = b.slice()

  for (let col = 0; col < n; col += 1) {
    let pivot = col
    let pivotAbs = Math.abs(M[col][col])
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(M[r][col])
      if (v > pivotAbs) {
        pivotAbs = v
        pivot = r
      }
    }

    if (pivotAbs === 0 || !Number.isFinite(pivotAbs)) return null
    if (pivot !== col) {
      const tmpRow = M[col]
      M[col] = M[pivot]
      M[pivot] = tmpRow
      const tmp = rhs[col]
      rhs[col] = rhs[pivot]
      rhs[pivot] = tmp
    }

    const diag = M[col][col]
    for (let r = col + 1; r < n; r += 1) {
      const factor = M[r][col] / diag
      if (factor === 0) continue
      rhs[r] -= factor * rhs[col]
      M[r][col] = 0
      for (let c = col + 1; c < n; c += 1) M[r][c] -= factor * M[col][c]
    }
  }

  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = rhs[r]
    for (let c = r + 1; c < n; c += 1) sum -= M[r][c] * x[c]
    const diag = M[r][r]
    if (diag === 0 || !Number.isFinite(diag)) return null
    x[r] = sum / diag
  }
  return x
}

export function solveMna(elements: GraphElement[], nodeCount: number, groundNode = 0): MnaOk | MnaErr {
  if (!Number.isInteger(nodeCount) || nodeCount < 2) return { ok: false, error: 'Internal error: invalid node count.' }
  if (groundNode < 0 || groundNode >= nodeCount) return { ok: false, error: 'Internal error: invalid ground node.' }

  const voltageSources = elements.filter((e) => e.kind === 'vsource')
  const nUnknownVoltages = nodeCount - 1
  const mVoltageSources = voltageSources.length
  const dim = nUnknownVoltages + mVoltageSources

  if (dim === 0) return { ok: false, error: 'Internal error: empty system.' }

  const A = zeroMatrix(dim)
  const b = new Array(dim).fill(0)

  const nodeVar = (node: number): number | null => {
    if (node === groundNode) return null
    // Map node indices to unknown vector positions (skip ground).
    // With ground=0 (default), this is node-1. With non-zero ground, compact mapping:
    // nodes < ground: idx = node
    // nodes > ground: idx = node-1
    if (groundNode === 0) return node - 1
    return node < groundNode ? node : node - 1
  }

  const addTo = (r: number | null, c: number | null, value: number) => {
    if (r === null || c === null) return
    A[r][c] += value
  }

  // Resistors (conductances)
  for (const e of elements) {
    if (e.kind !== 'resistor') continue
    if (!Number.isFinite(e.ohms) || e.ohms <= 0) return { ok: false, error: 'Invalid resistance value.' }
    const g = 1 / e.ohms
    const a = nodeVar(e.n1)
    const bnode = nodeVar(e.n2)
    addTo(a, a, g)
    addTo(bnode, bnode, g)
    addTo(a, bnode, -g)
    addTo(bnode, a, -g)
  }

  // Current sources (RHS injections)
  for (const e of elements) {
    if (e.kind !== 'isource') continue
    if (!Number.isFinite(e.amps)) return { ok: false, error: 'Invalid current source value.' }
    const from = nodeVar(e.nFrom)
    const to = nodeVar(e.nTo)
    if (from !== null) b[from] -= e.amps
    if (to !== null) b[to] += e.amps
  }

  // Voltage sources (augment system)
  const vSourceIndexById: Record<string, number> = {}
  for (let k = 0; k < voltageSources.length; k += 1) vSourceIndexById[voltageSources[k].id] = k

  for (let k = 0; k < voltageSources.length; k += 1) {
    const vs = voltageSources[k]
    if (!Number.isFinite(vs.volts)) return { ok: false, error: 'Invalid voltage source value.' }
    const row = nUnknownVoltages + k
    b[row] = vs.volts

    const a = nodeVar(vs.nPlus)
    const bnode = nodeVar(vs.nMinus)

    // KCL coupling (B matrix)
    if (a !== null) {
      A[a][nUnknownVoltages + k] += 1
      A[row][a] += 1
    }
    if (bnode !== null) {
      A[bnode][nUnknownVoltages + k] -= 1
      A[row][bnode] -= 1
    }
  }

  const x = solveLinearSystem(A, b)
  if (!x) return { ok: false, error: 'Circuit equations are singular or inconsistent (no unique solution).' }

  const nodeVoltages = new Array(nodeCount).fill(0)
  for (let node = 0; node < nodeCount; node += 1) {
    if (node === groundNode) {
      nodeVoltages[node] = 0
      continue
    }
    const idx = nodeVar(node)
    nodeVoltages[node] = idx === null ? 0 : x[idx]
  }

  const voltageSourceCurrentsById: Record<string, number> = {}
  for (const [id, k] of Object.entries(vSourceIndexById)) {
    voltageSourceCurrentsById[id] = x[nUnknownVoltages + k]
  }

  return { ok: true, nodeVoltages, voltageSourceCurrentsById }
}

