import { newId } from './id'
import type { Circuit, Node as SpNode, ParallelBranch } from './model'
import type { NodeCircuit, NodeCircuitEdge } from './nodeCircuit'

type Expr =
  | { kind: 'resistor'; id: string; name?: string; ohms: number }
  | { kind: 'ammeter'; id: string; name?: string }
  | { kind: 'vsource'; id: string; name?: string; volts: number }
  | { kind: 'isource'; id: string; name?: string; amps: number }
  | { kind: 'series'; items: Expr[] }
  | { kind: 'parallel'; branches: Expr[] }

type EdgeRecord = {
  id: string
  from: number
  to: number
  expr: Expr // oriented from -> to
}

function reverseExpr(expr: Expr): Expr {
  if (expr.kind === 'resistor') return expr
  if (expr.kind === 'ammeter') return expr
  if (expr.kind === 'vsource') return { ...expr, volts: -expr.volts }
  if (expr.kind === 'isource') return { ...expr, amps: -expr.amps }
  if (expr.kind === 'series') return { kind: 'series', items: expr.items.slice().reverse().map(reverseExpr) }
  return { kind: 'parallel', branches: expr.branches.map(reverseExpr) }
}

function flattenSeries(items: Expr[]): Expr[] {
  const out: Expr[] = []
  for (const it of items) {
    if (it.kind === 'series') out.push(...it.items)
    else out.push(it)
  }
  return out
}

function makeSeries(items: Expr[]): Expr {
  const flat = flattenSeries(items)
  if (flat.length === 1) return flat[0]
  return { kind: 'series', items: flat }
}

function makeParallel(branches: Expr[]): Expr {
  if (branches.length === 1) return branches[0]
  return { kind: 'parallel', branches }
}

function exprToTreeNode(expr: Expr): SpNode {
  if (expr.kind === 'resistor') return { kind: 'resistor', id: expr.id, name: expr.name, ohms: expr.ohms }
  if (expr.kind === 'ammeter') return { kind: 'ammeter', id: expr.id, name: expr.name }
  if (expr.kind === 'vsource') return { kind: 'vsource', id: expr.id, name: expr.name, volts: expr.volts }
  if (expr.kind === 'isource') return { kind: 'isource', id: expr.id, name: expr.name, amps: expr.amps }
  if (expr.kind === 'series') {
    const items = expr.items.map(exprToTreeNode).flatMap((n) => (n.kind === 'series' ? n.items : [n]))
    if (items.length === 1) return items[0]
    return { kind: 'series', id: newId('s'), items }
  }
  const branches: ParallelBranch[] = expr.branches.map((b) => {
    const node = exprToTreeNode(b)
    const items = node.kind === 'series' ? node.items : [node]
    return { id: newId('b'), items }
  })
  return { kind: 'parallel', id: newId('p'), branches }
}

function buildIndexMap(nodes: NodeCircuit['nodes']): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < nodes.length; i += 1) m.set(nodes[i].id, i)
  return m
}

function orderPair(u: number, v: number): string {
  return u < v ? `${u}:${v}` : `${v}:${u}`
}

function canonicalOrient(edge: EdgeRecord, u: number, v: number): EdgeRecord {
  if (edge.from === u && edge.to === v) return edge
  return { ...edge, from: u, to: v, expr: reverseExpr(edge.expr) }
}

function parallelGroups(edges: EdgeRecord[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    const key = orderPair(e.from, e.to)
    const arr = m.get(key)
    if (arr) arr.push(i)
    else m.set(key, [i])
  }
  for (const [k, arr] of [...m.entries()]) {
    if (arr.length < 2) m.delete(k)
  }
  return m
}

function degree(edges: EdgeRecord[], node: number): number {
  let d = 0
  for (const e of edges) if (e.from === node || e.to === node) d += 1
  return d
}

function incident(edges: EdgeRecord[], node: number): number[] {
  const idx: number[] = []
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    if (e.from === node || e.to === node) idx.push(i)
  }
  return idx
}

function removeEdgesByIndex(edges: EdgeRecord[], indices: number[]) {
  const set = new Set(indices)
  const next: EdgeRecord[] = []
  for (let i = 0; i < edges.length; i += 1) if (!set.has(i)) next.push(edges[i])
  edges.length = 0
  edges.push(...next)
}

function edgeToExpr(edge: NodeCircuitEdge): Expr {
  if (edge.kind === 'wire') return { kind: 'resistor', id: edge.id, name: edge.name, ohms: 0 }
  if (edge.kind === 'resistor') return { kind: 'resistor', id: edge.id, name: edge.name, ohms: edge.ohms }
  if (edge.kind === 'ammeter') return { kind: 'ammeter', id: edge.id, name: edge.name }
  if (edge.kind === 'vsource') return { kind: 'vsource', id: edge.id, name: edge.name, volts: edge.volts }
  return { kind: 'isource', id: edge.id, name: edge.name, amps: edge.amps }
}

export function nodeCircuitToSeriesParallelCircuit(nodeCircuit: NodeCircuit): { ok: true; circuit: Circuit } | { ok: false; error: string } {
  const nodeIndex = buildIndexMap(nodeCircuit.nodes)
  const hasNode = (id: string | null): id is string => typeof id === 'string' && nodeIndex.has(id)
  const explicitPlus = hasNode(nodeCircuit.plusNodeId) ? nodeIndex.get(nodeCircuit.plusNodeId)! : undefined
  const explicitMinus = hasNode(nodeCircuit.minusNodeId) ? nodeIndex.get(nodeCircuit.minusNodeId)! : undefined

  let plus = explicitPlus
  let minus = explicitMinus
  if (plus === undefined || minus === undefined) {
    const firstV = nodeCircuit.edges.find((e) => e.kind === 'vsource')
    if (firstV) {
      const a = nodeIndex.get(firstV.a)
      const b = nodeIndex.get(firstV.b)
      if (a === undefined || b === undefined) return { ok: false, error: 'Invalid circuit: an edge references a missing node.' }
      plus = a
      minus = b
    } else if (nodeCircuit.nodes.length >= 2) {
      plus = 0
      minus = 1
    } else {
      return { ok: false, error: 'Invalid circuit: add nodes/components (need at least 2 nodes).' }
    }
  }
  if (plus === minus) return { ok: false, error: 'Invalid circuit: terminals cannot be the same node.' }

  // Contract wires (node merges), so "wire" edges behave like ideal shorts in the editor graph.
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
    if (a === undefined || b === undefined) return { ok: false, error: 'Invalid circuit: an edge references a missing node.' }
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

  const plusN = oldToNew[plus]
  const minusN = oldToNew[minus]
  if (plusN === minusN) return { ok: false, error: 'Invalid circuit: reference terminals are shorted by wire.' }

  const edges: EdgeRecord[] = []
  for (const e of nodeCircuit.edges) {
    if (e.kind === 'wire') continue
    const a = nodeIndex.get(e.a)
    const b = nodeIndex.get(e.b)
    if (a === undefined || b === undefined) return { ok: false, error: 'Invalid circuit: an edge references a missing node.' }
    const u = oldToNew[a]
    const v = oldToNew[b]
    if (u === v) {
      // Component is bypassed/shorted by wires.
      if (e.kind === 'vsource' && e.volts !== 0) return { ok: false, error: 'Invalid circuit: a voltage source is shorted by wire.' }
      continue
    }
    edges.push({ id: e.id, from: u, to: v, expr: edgeToExpr(e) })
  }
  if (edges.length === 0) return { ok: false, error: 'Invalid circuit: no components.' }

  for (let guard = 0; guard < 10000; guard += 1) {
    if (edges.length === 1) {
      const only = edges[0]
      const endpoints = orderPair(only.from, only.to)
      const terminals = orderPair(plusN, minusN)
      if (endpoints !== terminals) return { ok: false, error: 'Circuit does not connect + and - terminals.' }

      const oriented = canonicalOrient(only, plusN, minusN)
      const rootNode = exprToTreeNode(oriented.expr)
      const items = rootNode.kind === 'series' ? rootNode.items : [rootNode]
      return { ok: true, circuit: { kind: 'circuit', id: newId('circuit'), route: { mode: 'straight' }, items } }
    }

    // Parallel reduction
    const par = parallelGroups(edges)
    const firstPar = par.entries().next()
    if (!firstPar.done) {
      const [key, idxs] = firstPar.value
      const [uStr, vStr] = key.split(':')
      const u = Number(uStr)
      const v = Number(vStr)
      const group = idxs.map((i) => canonicalOrient(edges[i], u, v))
      const expr = makeParallel(group.map((e) => e.expr))
      removeEdgesByIndex(edges, idxs)
      edges.push({ id: newId('eP'), from: u, to: v, expr })
      continue
    }

    // Series reduction: any non-terminal node with degree exactly 2
    let reduced = false
    for (let n = 0; n < nodeCount; n += 1) {
      if (n === plusN || n === minusN) continue
      if (degree(edges, n) !== 2) continue
      const inc = incident(edges, n)
      if (inc.length !== 2) continue
      const e1 = edges[inc[0]]
      const e2 = edges[inc[1]]
      const a = e1.from === n ? e1.to : e1.from
      const b = e2.from === n ? e2.to : e2.from
      if (a === b) continue // would become parallel; handled above

      // Create a->b oriented series. Need child 1 oriented a->n, child 2 oriented n->b.
      const c1 = e1.from === a ? e1 : { ...e1, from: a, to: n, expr: reverseExpr(e1.expr) }
      const c2 = e2.from === n ? e2 : { ...e2, from: n, to: b, expr: reverseExpr(e2.expr) }

      const expr = makeSeries([canonicalOrient(c1, a, n).expr, canonicalOrient(c2, n, b).expr])
      removeEdgesByIndex(edges, inc)
      edges.push({ id: newId('eS'), from: a, to: b, expr })
      reduced = true
      break
    }
    if (reduced) continue

    return { ok: false, error: 'Circuit is not reducible by series/parallel reductions.' }
  }

  return { ok: false, error: 'Reduction limit reached.' }
}
