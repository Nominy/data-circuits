import type { Circuit, Node, ParallelBlock, SeriesBlock, SeriesListKey } from './model'

function findSeriesBlock(nodes: Node[], seriesId: string): SeriesBlock | null {
  for (const node of nodes) {
    if (node.kind === 'series' && node.id === seriesId) return node
    if (node.kind === 'series') {
      const found = findSeriesBlock(node.items, seriesId)
      if (found) return found
    }
    if (node.kind === 'parallel') {
      for (const branch of node.branches) {
        const found = findSeriesBlock(branch.items, seriesId)
        if (found) return found
      }
    }
  }
  return null
}

function findParallelBlock(nodes: Node[], parallelId: string): ParallelBlock | null {
  for (const node of nodes) {
    if (node.kind === 'parallel' && node.id === parallelId) return node
    if (node.kind === 'series') {
      const found = findParallelBlock(node.items, parallelId)
      if (found) return found
    }
    if (node.kind === 'parallel') {
      for (const branch of node.branches) {
        const found = findParallelBlock(branch.items, parallelId)
        if (found) return found
      }
    }
  }
  return null
}

export function getSeriesListByKey(circuit: Circuit, listKey: SeriesListKey): Node[] {
  if (listKey === 'root') {
    if (circuit.route.mode !== 'straight') return []
    return circuit.items ?? []
  }
  if (listKey === 'root:top') {
    if (circuit.route.mode !== 'u') return []
    return circuit.top ?? []
  }
  if (listKey === 'root:right') {
    if (circuit.route.mode !== 'u') return []
    return circuit.right ?? []
  }
  if (listKey === 'root:bottom') {
    if (circuit.route.mode !== 'u') return []
    return circuit.bottom ?? []
  }
  if (listKey.startsWith('series:')) {
    const seriesId = listKey.slice('series:'.length)
    const roots: Node[] =
      circuit.route.mode === 'u'
        ? [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
        : [...(circuit.items ?? [])]
    return findSeriesBlock(roots, seriesId)?.items ?? []
  }
  if (listKey.startsWith('branch:')) {
    const [, parallelId, branchId] = listKey.split(':')
    const roots: Node[] =
      circuit.route.mode === 'u'
        ? [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
        : [...(circuit.items ?? [])]
    const parallel = findParallelBlock(roots, parallelId)
    return parallel?.branches.find((b) => b.id === branchId)?.items ?? []
  }
  return []
}
