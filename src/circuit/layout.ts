import type { Circuit, Node, ParallelBlock } from './model'

export type Point = { x: number; y: number }

export type WireDrawable = { kind: 'wire'; points: Point[] }
export type ComponentDrawable =
  | {
      kind: 'resistor'
      id: string
      from: Point
      to: Point
      label?: string
      ohms?: number
      generated?: boolean
    }
  | {
      kind: 'ammeter'
      id: string
      from: Point
      to: Point
      label?: string
    }
  | {
      kind: 'vsource'
      id: string
      from: Point
      to: Point
      label?: string
      volts?: number
    }
  | {
      kind: 'isource'
      id: string
      from: Point
      to: Point
      label?: string
      amps?: number
    }
export type TerminalDrawable = { kind: 'terminal'; at: Point; polarity: 'plus' | 'minus' }

export type Drawable = WireDrawable | ComponentDrawable | TerminalDrawable

export type LayoutOptions = {
  wire: number
  resistorLen: number
  ammeterLen: number
  sourceLen: number
  includeTerminals: boolean
  branchGap: number
  minBranchHeight: number
}

export type LayoutResult = {
  drawables: Drawable[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const defaultOptions: LayoutOptions = {
  wire: 1,
  resistorLen: 2,
  ammeterLen: 1.6,
  sourceLen: 1.6,
  includeTerminals: true,
  branchGap: 2,
  minBranchHeight: 1,
}

type Measure = { w: number; h: number }

type Frame = {
  origin: Point
  ax: Point // local +x
  ay: Point // local +y
}

function mapPoint(frame: Frame, local: Point): Point {
  return {
    x: frame.origin.x + frame.ax.x * local.x + frame.ay.x * local.y,
    y: frame.origin.y + frame.ax.y * local.x + frame.ay.y * local.y,
  }
}

function measureSeries(items: Node[], opts: LayoutOptions): Measure {
  if (items.length === 0) return { w: 2 * opts.wire, h: 0 }
  let w = opts.wire // start cap
  let h = 0
  for (const n of items) {
    const m = measureNode(n, opts)
    w += m.w + opts.wire
    h = Math.max(h, m.h)
  }
  return { w, h }
}

function measureParallel(node: ParallelBlock, opts: LayoutOptions): Measure {
  const branchMeasures = node.branches.map((b) => measureSeries(b.items, opts))
  const maxW = Math.max(...branchMeasures.map((m) => m.w))
  const heights = branchMeasures.map((m) => Math.max(m.h, opts.minBranchHeight))
  const totalH = heights.reduce((a, b) => a + b, 0) + opts.branchGap * Math.max(0, heights.length - 1)
  return { w: maxW + 2 * opts.wire, h: totalH }
}

function measureNode(node: Node, opts: LayoutOptions): Measure {
  if (node.kind === 'resistor') return { w: opts.resistorLen, h: 0 }
  if (node.kind === 'ammeter') return { w: opts.ammeterLen, h: 0 }
  if (node.kind === 'vsource' || node.kind === 'isource') return { w: opts.sourceLen, h: 0 }
  if (node.kind === 'series') return measureSeries(node.items, opts)
  return measureParallel(node, opts)
}

function expandBounds(bounds: LayoutResult['bounds'], p: Point) {
  bounds.minX = Math.min(bounds.minX, p.x)
  bounds.minY = Math.min(bounds.minY, p.y)
  bounds.maxX = Math.max(bounds.maxX, p.x)
  bounds.maxY = Math.max(bounds.maxY, p.y)
}

function addWire(drawables: Drawable[], bounds: LayoutResult['bounds'], points: Point[]) {
  if (points.length < 2) return
  drawables.push({ kind: 'wire', points })
  for (const p of points) expandBounds(bounds, p)
}

function addComponent(drawables: Drawable[], bounds: LayoutResult['bounds'], component: ComponentDrawable) {
  drawables.push(component)
  expandBounds(bounds, component.from)
  expandBounds(bounds, component.to)
}

function addTerminal(drawables: Drawable[], bounds: LayoutResult['bounds'], terminal: TerminalDrawable) {
  drawables.push(terminal)
  expandBounds(bounds, terminal.at)
}

function addWireLocal(drawables: Drawable[], bounds: LayoutResult['bounds'], frame: Frame, points: Point[]) {
  addWire(
    drawables,
    bounds,
    points.map((p) => mapPoint(frame, p)),
  )
}

type LocalComponent =
  | {
      kind: 'resistor'
      id: string
      from: Point
      to: Point
      label?: string
      ohms?: number
      generated?: boolean
    }
  | {
      kind: 'ammeter'
      id: string
      from: Point
      to: Point
      label?: string
    }
  | {
      kind: 'vsource'
      id: string
      from: Point
      to: Point
      label?: string
      volts?: number
    }
  | {
      kind: 'isource'
      id: string
      from: Point
      to: Point
      label?: string
      amps?: number
    }

function addComponentLocal(drawables: Drawable[], bounds: LayoutResult['bounds'], frame: Frame, component: LocalComponent) {
  addComponent(drawables, bounds, {
    ...component,
    from: mapPoint(frame, component.from),
    to: mapPoint(frame, component.to),
  })
}

function layoutSeriesLocal(
  items: Node[],
  start: Point,
  frame: Frame,
  drawables: Drawable[],
  bounds: LayoutResult['bounds'],
  opts: LayoutOptions,
): Point {
  let x = start.x
  const y = start.y

  // start cap
  addWireLocal(drawables, bounds, frame, [
    { x, y },
    { x: x + opts.wire, y },
  ])
  x += opts.wire

  for (const node of items) {
    const nodeStart = { x, y }
    const nodeEnd = layoutNodeLocal(node, nodeStart, frame, drawables, bounds, opts)
    x = nodeEnd.x
    addWireLocal(drawables, bounds, frame, [
      { x, y },
      { x: x + opts.wire, y },
    ])
    x += opts.wire
  }

  // end cap for empty series
  if (items.length === 0) {
    addWireLocal(drawables, bounds, frame, [
      { x, y },
      { x: x + opts.wire, y },
    ])
    x += opts.wire
  }

  return { x, y }
}

function layoutParallelLocal(
  node: ParallelBlock,
  start: Point,
  frame: Frame,
  drawables: Drawable[],
  bounds: LayoutResult['bounds'],
  opts: LayoutOptions,
): Point {
  const baseY = start.y
  const branchMeasures = node.branches.map((b) => measureSeries(b.items, opts))
  const maxW = Math.max(...branchMeasures.map((m) => m.w))
  const heights = branchMeasures.map((m) => Math.max(m.h, opts.minBranchHeight))
  const totalH = heights.reduce((a, b) => a + b, 0) + opts.branchGap * Math.max(0, heights.length - 1)

  const split = start
  const join = { x: start.x + (maxW + 2 * opts.wire), y: baseY }

  let cursorY = baseY - totalH / 2
  for (let i = 0; i < node.branches.length; i += 1) {
    const branch = node.branches[i]
    const branchH = heights[i]
    const branchY = cursorY + branchH / 2
    cursorY += branchH + opts.branchGap

    const branchStart = { x: split.x + opts.wire, y: branchY }
    addWireLocal(drawables, bounds, frame, [
      { x: split.x, y: baseY },
      { x: split.x, y: branchY },
      branchStart,
    ])

    const branchEnd = layoutSeriesLocal(branch.items, branchStart, frame, drawables, bounds, opts)

    const targetEndX = split.x + opts.wire + maxW
    if (branchEnd.x < targetEndX) {
      addWireLocal(drawables, bounds, frame, [
        branchEnd,
        { x: targetEndX, y: branchY },
      ])
    }

    addWireLocal(drawables, bounds, frame, [
      { x: targetEndX, y: branchY },
      { x: join.x, y: branchY },
      { x: join.x, y: baseY },
    ])
  }

  return { x: join.x, y: baseY }
}

function layoutNodeLocal(
  node: Node,
  start: Point,
  frame: Frame,
  drawables: Drawable[],
  bounds: LayoutResult['bounds'],
  opts: LayoutOptions,
): Point {
  if (node.kind === 'resistor') {
    const end = { x: start.x + opts.resistorLen, y: start.y }
    addComponentLocal(drawables, bounds, frame, {
      kind: 'resistor',
      id: node.id,
      from: start,
      to: end,
      label: node.name,
      ohms: node.ohms,
      generated: node.generated,
    })
    return end
  }
  if (node.kind === 'ammeter') {
    const end = { x: start.x + opts.ammeterLen, y: start.y }
    addComponentLocal(drawables, bounds, frame, { kind: 'ammeter', id: node.id, from: start, to: end, label: node.name })
    return end
  }
  if (node.kind === 'vsource') {
    const end = { x: start.x + opts.sourceLen, y: start.y }
    addComponentLocal(drawables, bounds, frame, { kind: 'vsource', id: node.id, from: start, to: end, label: node.name, volts: node.volts })
    return end
  }
  if (node.kind === 'isource') {
    const end = { x: start.x + opts.sourceLen, y: start.y }
    addComponentLocal(drawables, bounds, frame, { kind: 'isource', id: node.id, from: start, to: end, label: node.name, amps: node.amps })
    return end
  }
  if (node.kind === 'series') {
    return layoutSeriesLocal(node.items, start, frame, drawables, bounds, opts)
  }
  return layoutParallelLocal(node, start, frame, drawables, bounds, opts)
}

export function layoutCircuit(circuit: Circuit, options?: Partial<LayoutOptions>): LayoutResult {
  const opts = { ...defaultOptions, ...(options ?? {}) }
  const drawables: Drawable[] = []
  const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  const startGlobal = { x: 0, y: 0 }
  if (opts.includeTerminals) addTerminal(drawables, bounds, { kind: 'terminal', at: startGlobal, polarity: 'plus' })

  const route = circuit.route
  if (route.mode === 'u') {
    const top = circuit.top ?? []
    const mid = circuit.right ?? []
    const bot = circuit.bottom ?? []

    // Top: flow +x, parallels expand upward (local +y maps to global -y)
    const frameTop: Frame = { origin: startGlobal, ax: { x: 1, y: 0 }, ay: { x: 0, y: -1 } }
    const topW = measureSeries(top, opts).w
    const botW = measureSeries(bot, opts).w
    const width = Math.max(topW, botW)

    const endTopLocalRaw = layoutSeriesLocal(top, { x: 0, y: 0 }, frameTop, drawables, bounds, opts)
    if (endTopLocalRaw.x < width) {
      addWireLocal(drawables, bounds, frameTop, [
        endTopLocalRaw,
        { x: width, y: 0 },
      ])
    }
    const endTopGlobal = mapPoint(frameTop, { x: width, y: 0 })

    // Right: flow +y, parallels expand right (local +y maps to global +x)
    const frameRight: Frame = { origin: endTopGlobal, ax: { x: 0, y: 1 }, ay: { x: 1, y: 0 } }
    const endRightLocal = layoutSeriesLocal(mid, { x: 0, y: 0 }, frameRight, drawables, bounds, opts)
    const endRightGlobal = mapPoint(frameRight, endRightLocal)

    // Bottom: flow -x, parallels expand downward (local +y maps to global +y)
    const frameBottom: Frame = { origin: endRightGlobal, ax: { x: -1, y: 0 }, ay: { x: 0, y: 1 } }
    const endBottomLocalRaw = layoutSeriesLocal(bot, { x: 0, y: 0 }, frameBottom, drawables, bounds, opts)
    if (endBottomLocalRaw.x < width) {
      addWireLocal(drawables, bounds, frameBottom, [
        endBottomLocalRaw,
        { x: width, y: 0 },
      ])
    }
    const endBottomGlobal = mapPoint(frameBottom, { x: width, y: 0 })

    const minusAt = { x: startGlobal.x, y: endBottomGlobal.y }
    if (endBottomGlobal.x !== minusAt.x) {
      addWire(drawables, bounds, [endBottomGlobal, minusAt])
    }
    if (opts.includeTerminals) addTerminal(drawables, bounds, { kind: 'terminal', at: minusAt, polarity: 'minus' })
    return { drawables, bounds }
  }

  // Straight: flow +x, parallels expand upward
  const frame: Frame = { origin: startGlobal, ax: { x: 1, y: 0 }, ay: { x: 0, y: -1 } }
  const endLocal = layoutSeriesLocal(circuit.items ?? [], { x: 0, y: 0 }, frame, drawables, bounds, opts)
  const endGlobal = mapPoint(frame, endLocal)
  if (opts.includeTerminals) addTerminal(drawables, bounds, { kind: 'terminal', at: endGlobal, polarity: 'minus' })
  return { drawables, bounds }
}
