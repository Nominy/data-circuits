import { useEffect, useMemo, useRef, useState } from 'react'

import type { NodeCircuit, NodeCircuitEdge } from '../circuit/nodeCircuit'
import { solveNodeCircuitBySuperposition } from '../circuit/nodeCircuitSolve'
import { solveCircuit } from '../circuit/solve'
import { useCircuitStore } from '../store/circuitStore'

type Pt = { x: number; y: number }

type PaletteItem = 'node' | 'wire' | 'resistor' | 'ammeter' | 'vsource' | 'isource'

type Cam = { x: number; y: number; zoom: number }

type DragState =
  | { kind: 'move-node'; pointerId: number; nodeId: string; offset: Pt }
  | { kind: 'pan'; pointerId: number; lastWorld: Pt }
  | {
      kind: 'palette'
      pointerId: number
      item: PaletteItem
      startClient: Pt
      world: Pt
      hoverNodeId: string | null
      startNodeId: string | null
    }
  | null

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  const rounded = abs >= 1000 ? value.toPrecision(6) : abs >= 1 ? value.toFixed(6) : value.toPrecision(6)
  return rounded.replace(/\.?0+$/, '')
}

function labelOfNode(nodes: { id: string; name?: string }[], id: string): string {
  const n = nodes.find((x) => x.id === id)
  if (!n) return id
  const label = (n.name ?? '').trim()
  return label.length > 0 ? label : id
}

function edgeShortLabel(edge: Pick<NodeCircuitEdge, 'kind'>): string {
  if (edge.kind === 'wire') return '-'
  if (edge.kind === 'resistor') return 'R'
  if (edge.kind === 'ammeter') return 'A'
  if (edge.kind === 'vsource') return 'V'
  return 'I'
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function dist2(a: Pt, b: Pt): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function clientToWorld(svg: SVGSVGElement, clientX: number, clientY: number): Pt {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function findNodeNearPoint(nodeCircuit: NodeCircuit, p: Pt, radius: number): string | null {
  let bestId: string | null = null
  let best = Infinity
  const r2 = radius * radius
  for (const n of nodeCircuit.nodes) {
    const d = dist2({ x: n.x, y: n.y }, p)
    if (d > r2) continue
    if (d < best) {
      best = d
      bestId = n.id
    }
  }
  return bestId
}

export function CircuitEditor() {
  const circuit = useCircuitStore((s) => s.circuit)
  const nodeCircuit = useCircuitStore((s) => s.nodeCircuit)
  const nodeCircuitError = useCircuitStore((s) => s.nodeCircuitError)
  const supplyVoltsText = useCircuitStore((s) => s.analysis.supplyVoltsText)
  const resetNodeCircuit = useCircuitStore((s) => s.resetNodeCircuit)
  const addNodeCircuitNode = useCircuitStore((s) => s.addNodeCircuitNode)
  const removeNodeCircuitNode = useCircuitStore((s) => s.removeNodeCircuitNode)
  const setNodeCircuitNodePos = useCircuitStore((s) => s.setNodeCircuitNodePos)
  const addNodeCircuitEdge = useCircuitStore((s) => s.addNodeCircuitEdge)
  const removeNodeCircuitEdge = useCircuitStore((s) => s.removeNodeCircuitEdge)
  const updateNodeCircuitNodeName = useCircuitStore((s) => s.updateNodeCircuitNodeName)
  const updateNodeCircuitEdgeName = useCircuitStore((s) => s.updateNodeCircuitEdgeName)
  const updateNodeCircuitResistorOhms = useCircuitStore((s) => s.updateNodeCircuitResistorOhms)
  const updateNodeCircuitVoltageSourceVolts = useCircuitStore((s) => s.updateNodeCircuitVoltageSourceVolts)
  const updateNodeCircuitCurrentSourceAmps = useCircuitStore((s) => s.updateNodeCircuitCurrentSourceAmps)
  const updateNodeCircuitEdgeEndpoints = useCircuitStore((s) => s.updateNodeCircuitEdgeEndpoints)
  const flipNodeCircuitEdge = useCircuitStore((s) => s.flipNodeCircuitEdge)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const [viewportPx, setViewportPx] = useState<{ w: number; h: number }>({ w: 800, h: 600 })
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, zoom: 1 })
  const [drag, setDrag] = useState<DragState>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [canvasValues, setCanvasValues] = useState(true)

  const nodesById = useMemo(() => new Map(nodeCircuit.nodes.map((n) => [n.id, n])), [nodeCircuit.nodes])
  const selectedEdge = selectedEdgeId ? nodeCircuit.edges.find((e) => e.id === selectedEdgeId) ?? null : null
  const selectedNode = selectedNodeId ? nodeCircuit.nodes.find((n) => n.id === selectedNodeId) ?? null : null

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect()
      setViewportPx({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) })
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drag) setDrag(null)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return
      if (selectedEdgeId) removeNodeCircuitEdge(selectedEdgeId)
      else if (selectedNodeId) removeNodeCircuitNode(selectedNodeId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drag, removeNodeCircuitEdge, removeNodeCircuitNode, selectedEdgeId, selectedNodeId])

  const viewBox = `${cam.x} ${cam.y} ${viewportPx.w / cam.zoom} ${viewportPx.h / cam.zoom}`
  const bounds = { x: cam.x, y: cam.y, w: viewportPx.w / cam.zoom, h: viewportPx.h / cam.zoom }

  const solved = useMemo(() => {
    if (!canvasValues && !selectedEdgeId && !selectedNodeId) return null
    const raw = supplyVoltsText.trim()
    const parsed = raw.length === 0 ? undefined : Number(raw)
    const analysis = raw.length === 0 || !Number.isFinite(parsed) ? undefined : { externalSupplyVolts: parsed }
    return solveCircuit(circuit, analysis)
  }, [canvasValues, circuit, selectedEdgeId, selectedNodeId, supplyVoltsText])

  const directionalSolved = useMemo(() => {
    if (!canvasValues && !selectedEdgeId && !selectedNodeId) return null
    return solveNodeCircuitBySuperposition(nodeCircuit)
  }, [canvasValues, nodeCircuit, selectedEdgeId, selectedNodeId])

  const selectedComputed = useMemo(() => {
    if (!selectedEdge) return null
    if (!solved || !solved.ok) return null

    if (selectedEdge.kind === 'wire') return { kind: 'wire' as const }
    if (selectedEdge.kind === 'resistor') {
      const match = solved.result.resistors.find((r) => r.id === selectedEdge.id)
      if (!match) return { kind: 'resistor' as const, iA: undefined, vV: undefined, ohms: selectedEdge.ohms }
      const directionalCurrent =
        directionalSolved && directionalSolved.ok ? directionalSolved.resistorCurrentsById[selectedEdge.id] : undefined
      const iA = directionalCurrent ?? match.currentA
      const vV = match.voltageV
      return { kind: 'resistor' as const, iA, vV, ohms: selectedEdge.ohms }
    }
    if (selectedEdge.kind === 'ammeter') {
      const match = solved.result.ammeters.find((a) => a.id === selectedEdge.id)
      const directionalCurrent =
        directionalSolved && directionalSolved.ok
          ? directionalSolved.voltageSourceCurrentsById[`ammeter:${selectedEdge.id}`]
          : undefined
      const iA = directionalCurrent ?? match?.currentA
      return { kind: 'ammeter' as const, iA, vV: 0 }
    }
    if (selectedEdge.kind === 'vsource') {
      const directionalCurrent =
        directionalSolved && directionalSolved.ok ? directionalSolved.voltageSourceCurrentsById[selectedEdge.id] : undefined
      const iA = directionalCurrent ?? solved.result.superposition.totalVoltageSourceCurrentsById[selectedEdge.id]
      return { kind: 'vsource' as const, iA, vV: selectedEdge.volts }
    }
    // isource
    return { kind: 'isource' as const, iA: selectedEdge.amps, vV: undefined }
  }, [directionalSolved, selectedEdge, solved])

  const gridStep = 40
  const gridLines = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    const startX = Math.floor(bounds.x / gridStep) * gridStep
    const endX = bounds.x + bounds.w
    for (let x = startX; x <= endX; x += gridStep) xs.push(x)
    const startY = Math.floor(bounds.y / gridStep) * gridStep
    const endY = bounds.y + bounds.h
    for (let y = startY; y <= endY; y += gridStep) ys.push(y)
    return { xs, ys }
  }, [bounds.h, bounds.w, bounds.x, bounds.y])

  const fitToCircuit = () => {
    if (nodeCircuit.nodes.length === 0) return
    const pad = 120
    const xs = nodeCircuit.nodes.map((n) => n.x)
    const ys = nodeCircuit.nodes.map((n) => n.y)
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const zoom = clamp(Math.min(viewportPx.w / w, viewportPx.h / h), 0.2, 2.5)
    setCam({ x: minX, y: minY, zoom })
  }

  const beginPaletteDrag = (item: PaletteItem, pointerId: number, clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return
    svg.setPointerCapture(pointerId)
    const world = clientToWorld(svg, clientX, clientY)
    setDrag({
      kind: 'palette',
      pointerId,
      item,
      startClient: { x: clientX, y: clientY },
      world,
      hoverNodeId: null,
      startNodeId: null,
    })
  }

  const commitPaletteDrop = (d: Extract<DragState, { kind: 'palette' }>) => {
    if (d.item === 'node') {
      const id = addNodeCircuitNode(d.world)
      if (id) {
        setSelectedEdgeId(null)
        setSelectedNodeId(id)
      }
      return
    }

    const startNodeId = d.startNodeId
    if (!startNodeId) return

    const endNodeId = d.hoverNodeId && d.hoverNodeId !== startNodeId ? d.hoverNodeId : addNodeCircuitNode(d.world)
    if (!endNodeId) return
    addNodeCircuitEdge(d.item, startNodeId, endNodeId)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }

  const paletteItems: { item: PaletteItem; title: string; hint: string }[] = [
    { item: 'node', title: 'Node', hint: 'Drop anywhere' },
    { item: 'wire', title: 'Wire', hint: 'Drag: node -> node' },
    { item: 'resistor', title: 'Resistor', hint: 'Drag: node -> node' },
    { item: 'ammeter', title: 'Ammeter', hint: 'Drag: node -> node' },
    { item: 'vsource', title: 'V source', hint: 'Drag: + -> -' },
    { item: 'isource', title: 'I source', hint: 'Drag: a -> b' },
  ]

  const dragOverlay =
    drag && drag.kind === 'palette' ? (
      <g pointerEvents="none">
        <circle cx={drag.world.x} cy={drag.world.y} r={18} fill="rgba(128,160,255,0.12)" stroke="rgba(128,160,255,0.65)" />
        <text x={drag.world.x} y={drag.world.y + 5} fontSize={12} textAnchor="middle" fill="rgba(220,230,255,0.9)">
          {drag.item === 'node' ? '+' : edgeShortLabel({ kind: drag.item })}
        </text>
        {drag.startNodeId ? (
          (() => {
            const a = nodesById.get(drag.startNodeId)
            if (!a) return null
            return <line x1={a.x} y1={a.y} x2={drag.world.x} y2={drag.world.y} stroke="rgba(128,160,255,0.65)" strokeWidth={2} />
          })()
        ) : null}
      </g>
    ) : null

  return (
    <div className="canvasRoot" ref={rootRef}>
      <svg
        ref={svgRef}
        className="canvasSvg"
        viewBox={viewBox}
        role="img"
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          const svg = svgRef.current
          if (!svg) return
          e.preventDefault()
          const world = clientToWorld(svg, e.clientX, e.clientY)
          const nextZoom = clamp(cam.zoom * Math.pow(1.0015, -e.deltaY), 0.2, 3)
          if (nextZoom === cam.zoom) return
          const oldW = viewportPx.w / cam.zoom
          const oldH = viewportPx.h / cam.zoom
          const newW = viewportPx.w / nextZoom
          const newH = viewportPx.h / nextZoom
          const tx = oldW <= 0 ? 0 : (world.x - cam.x) / oldW
          const ty = oldH <= 0 ? 0 : (world.y - cam.y) / oldH
          setCam({ zoom: nextZoom, x: world.x - tx * newW, y: world.y - ty * newH })
        }}
        onPointerDown={(e) => {
          const svg = svgRef.current
          if (!svg) return
          if (e.button === 0) {
            if (e.target === e.currentTarget) {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
            }
            return
          }
          if (e.button !== 1 && e.button !== 2) return
          e.preventDefault()
          svg.setPointerCapture(e.pointerId)
          setDrag({ kind: 'pan', pointerId: e.pointerId, lastWorld: clientToWorld(svg, e.clientX, e.clientY) })
        }}
        onPointerMove={(e) => {
          const svg = svgRef.current
          if (!svg) return
          if (!drag) return
          if (drag.kind === 'move-node') {
            if (e.pointerId !== drag.pointerId) return
            const p = clientToWorld(svg, e.clientX, e.clientY)
            setNodeCircuitNodePos(drag.nodeId, { x: p.x - drag.offset.x, y: p.y - drag.offset.y })
            return
          }
          if (drag.kind === 'pan') {
            if (e.pointerId !== drag.pointerId) return
            const p = clientToWorld(svg, e.clientX, e.clientY)
            const dx = p.x - drag.lastWorld.x
            const dy = p.y - drag.lastWorld.y
            setCam((c) => ({ ...c, x: c.x - dx, y: c.y - dy }))
            setDrag({ ...drag, lastWorld: p })
            return
          }
          if (drag.kind === 'palette') {
            if (e.pointerId !== drag.pointerId) return
            const world = clientToWorld(svg, e.clientX, e.clientY)
            const hoverNodeId = findNodeNearPoint(nodeCircuit, world, 18)
            const moved = dist2(drag.startClient, { x: e.clientX, y: e.clientY }) > 36
            const startNodeId = drag.item !== 'node' && moved && !drag.startNodeId && hoverNodeId ? hoverNodeId : drag.startNodeId
            setDrag({ ...drag, world, hoverNodeId, startNodeId })
          }
        }}
        onPointerUp={(e) => {
          if (!drag) return
          if (drag.kind === 'move-node' && e.pointerId === drag.pointerId) setDrag(null)
          if (drag.kind === 'pan' && e.pointerId === drag.pointerId) setDrag(null)
          if (drag.kind === 'palette' && e.pointerId === drag.pointerId) {
            commitPaletteDrop(drag)
            setDrag(null)
          }
        }}
        style={{ touchAction: 'none' }}
      >
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.85)" />
          </marker>
        </defs>

        <g stroke="rgba(255,255,255,0.05)" strokeWidth={1}>
          {gridLines.xs.map((x) => (
            <line key={`gx_${x}`} x1={x} y1={bounds.y} x2={x} y2={bounds.y + bounds.h} />
          ))}
          {gridLines.ys.map((y) => (
            <line key={`gy_${y}`} x1={bounds.x} y1={y} x2={bounds.x + bounds.w} y2={y} />
          ))}
        </g>

        <g stroke="rgba(255,255,255,0.85)" strokeWidth={2} fill="none">
          {nodeCircuit.edges.flatMap((e) => {
            const a = nodesById.get(e.a)
            const b = nodesById.get(e.b)
            if (!a || !b) return []
            const p1 = { x: a.x, y: a.y }
            const p2 = { x: b.x, y: b.y }
            const center = midpoint(p1, p2)
            const selected = e.id === selectedEdgeId
            const stroke = selected ? 'rgba(128,160,255,0.95)' : e.kind === 'wire' ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.85)'

            return [
              <g
                key={`edge_${e.id}`}
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return
                  ev.stopPropagation()
                  setSelectedNodeId(null)
                  setSelectedEdgeId(e.id)
                }}
                style={{ cursor: 'pointer' }}
              >
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0)" strokeWidth={14} />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={3} markerEnd={e.kind === 'isource' ? 'url(#arrow)' : undefined} />
                {e.kind === 'wire' ? null : (
                  <>
                    <rect x={center.x - 14} y={center.y - 11} width={28} height={22} rx={8} fill="rgba(0,0,0,0.75)" stroke={stroke} />
                    <text x={center.x} y={center.y + 5} fontSize={12} textAnchor="middle" fill={stroke}>
                      {edgeShortLabel(e)}
                    </text>
                  </>
                )}
                {canvasValues && e.id === selectedEdgeId && solved && solved.ok && selectedComputed && selectedComputed.kind !== 'wire' ? (
                  <text x={center.x} y={center.y + 28} fontSize={11} textAnchor="middle" fill="rgba(230,235,255,0.85)">
                    {selectedComputed.iA === undefined ? '' : `I(${e.a}->${e.b})=${formatNum(selectedComputed.iA)}A`}
                    {selectedComputed.vV === undefined ? '' : `  V=${formatNum(selectedComputed.vV)}V`}
                  </text>
                ) : null}
                {e.kind === 'vsource' ? (
                  <>
                    <text x={p1.x + 10} y={p1.y - 10} fontSize={12} textAnchor="middle" fill="rgba(255,255,255,0.85)">
                      +
                    </text>
                    <text x={p2.x + 10} y={p2.y - 10} fontSize={12} textAnchor="middle" fill="rgba(255,255,255,0.85)">
                      -
                    </text>
                  </>
                ) : null}
              </g>,
            ]
          })}
        </g>

        <g>
          {nodeCircuit.nodes.map((n) => {
            const selected = n.id === selectedNodeId
            const hover = drag && drag.kind === 'palette' && drag.hoverNodeId === n.id
            const fill = selected ? 'rgba(128,160,255,0.22)' : 'rgba(0,0,0,0.65)'
            const stroke = selected ? 'rgba(128,160,255,0.95)' : hover ? 'rgba(160,190,255,0.9)' : 'rgba(255,255,255,0.82)'
            const rawLabel = (n.name ?? '').trim()
            const showLabel = rawLabel.length > 0 && rawLabel !== '+' && rawLabel !== '-'

            return (
              <g
                key={`node_${n.id}`}
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return
                  const svg = svgRef.current
                  if (!svg) return
                  ev.stopPropagation()
                  setSelectedEdgeId(null)
                  setSelectedNodeId(n.id)
                  svg.setPointerCapture(ev.pointerId)
                  const p = clientToWorld(svg, ev.clientX, ev.clientY)
                  setDrag({ kind: 'move-node', pointerId: ev.pointerId, nodeId: n.id, offset: { x: p.x - n.x, y: p.y - n.y } })
                }}
                style={{ cursor: 'grab' }}
              >
                <circle cx={n.x} cy={n.y} r={13} fill={fill} stroke={stroke} strokeWidth={2.5} />
                {showLabel ? (
                  <text x={n.x + 18} y={n.y + 4} fontSize={12} textAnchor="start" fill="rgba(255,255,255,0.85)">
                    {rawLabel}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>

        {dragOverlay}
      </svg>

      <div className="floating palette">
        <div className="floatingTitle">Palette</div>
        <div className="paletteGrid">
          {paletteItems.map((p) => (
            <div
              key={p.item}
              className="paletteItem"
              role="button"
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault()
                beginPaletteDrag(p.item, e.pointerId, e.clientX, e.clientY)
              }}
            >
              <div className="paletteItemLabel">{p.title}</div>
              <div className="paletteItemHint">{p.hint}</div>
            </div>
          ))}
        </div>

        <div className="statusPill" style={{ marginTop: 10 }}>
          {nodeCircuit.edges.length === 0 ? (
            <div style={{ color: 'rgba(220,230,255,0.75)' }}>Empty - drag components to start</div>
          ) : nodeCircuitError ? (
            <div style={{ color: 'rgba(255,140,160,0.95)' }}>Not reducible: {nodeCircuitError}</div>
          ) : (
            <div style={{ color: 'rgba(180,255,200,0.92)' }}>Reducible OK</div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button className="btn tiny" type="button" onClick={() => setCanvasValues((v) => !v)}>
            {canvasValues ? 'Canvas values: on' : 'Canvas values: off'}
          </button>
          <button className="btn tiny" type="button" onClick={fitToCircuit}>
            Fit
          </button>
          <button className="btn tiny" type="button" onClick={resetNodeCircuit}>
            Reset
          </button>
        </div>

        <div className="mutedSmall" style={{ marginTop: 10 }}>
          Tips: wheel to zoom, right/middle drag to pan, Delete to remove
        </div>
      </div>

      <div className="floating inspector">
        <div className="floatingTitle">Inspector</div>
        {selectedNode ? (
          <>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>
              Node {selectedNode.id}
            </div>
            <input className="input" placeholder="Label (optional)" value={selectedNode.name ?? ''} onChange={(e) => updateNodeCircuitNodeName(selectedNode.id, e.target.value)} />
            <div style={{ height: 10 }} />
            <div className="seriesListTitle">Computed</div>
            {solved && !solved.ok ? (
              <div className="mutedSmall" style={{ marginBottom: 10, color: 'rgba(255,140,160,0.95)' }}>
                {solved.error}
              </div>
            ) : solved && solved.ok ? (
              <div className="row addRow" style={{ gridTemplateColumns: '1fr', marginBottom: 10 }}>
                <div className="cell">
                  <div className="mutedSmall">Node quick value</div>
                  <div>Not shown in strict-solver mode.</div>
                </div>
              </div>
            ) : (
              <div className="mutedSmall" style={{ marginBottom: 10 }}>
                -
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn tiny danger"
                type="button"
                onClick={() => removeNodeCircuitNode(selectedNode.id)}
              >
                Delete
              </button>
            </div>
          </>
        ) : selectedEdge ? (
          <>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>
              {selectedEdge.kind} - {selectedEdge.id}
            </div>
            <input className="input" placeholder="Label (optional)" value={selectedEdge.name ?? ''} onChange={(e) => updateNodeCircuitEdgeName(selectedEdge.id, e.target.value)} />
            <div style={{ height: 10 }} />

            {selectedEdge.kind === 'resistor' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input className="input num" type="number" min={0.000001} step={1} value={selectedEdge.ohms} onChange={(e) => updateNodeCircuitResistorOhms(selectedEdge.id, Number(e.target.value))} />
                <div className="unit">ohm</div>
              </div>
            ) : null}
            {selectedEdge.kind === 'vsource' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input className="input num" type="number" step={0.1} value={selectedEdge.volts} onChange={(e) => updateNodeCircuitVoltageSourceVolts(selectedEdge.id, Number(e.target.value))} />
                <div className="unit">V</div>
              </div>
            ) : null}
            {selectedEdge.kind === 'isource' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input className="input num" type="number" step={0.001} value={selectedEdge.amps} onChange={(e) => updateNodeCircuitCurrentSourceAmps(selectedEdge.id, Number(e.target.value))} />
                <div className="unit">A</div>
              </div>
            ) : null}

            <div className="seriesListTitle">Computed</div>
            {!solved ? null : !solved.ok ? (
              <div className="mutedSmall" style={{ marginBottom: 10, color: 'rgba(255,140,160,0.95)' }}>
                {solved.error}
              </div>
            ) : selectedComputed?.kind === 'wire' ? (
              <div className="mutedSmall" style={{ marginBottom: 10 }}>
                Wire (short). No separate values.
              </div>
            ) : selectedComputed ? (
              <div className="row addRow" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 10 }}>
                <div className="cell">
                  <div className="mutedSmall">I</div>
                  {selectedComputed.iA === undefined ? (
                    <div>-</div>
                  ) : (
                    <div>{`${labelOfNode(nodeCircuit.nodes, selectedEdge.a)} -> ${labelOfNode(nodeCircuit.nodes, selectedEdge.b)}: ${formatNum(selectedComputed.iA)} A`}</div>
                  )}
                </div>
                <div className="cell">
                  <div className="mutedSmall">V</div>
                  <div>{selectedComputed.vV === undefined ? '-' : `${formatNum(selectedComputed.vV)} V`}</div>
                </div>
                <div className="cell">
                  <div className="mutedSmall">R</div>
                  <div>{selectedComputed.kind === 'resistor' ? `${formatNum(selectedComputed.ohms)} ohm` : '-'}</div>
                </div>
              </div>
            ) : (
              <div className="mutedSmall" style={{ marginBottom: 10 }}>
                -
              </div>
            )}

            <div className="seriesListTitle">Endpoints</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <select className="input" value={selectedEdge.a} onChange={(e) => updateNodeCircuitEdgeEndpoints(selectedEdge.id, e.target.value, selectedEdge.b)} style={{ width: 110 }}>
                {nodeCircuit.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {labelOfNode(nodeCircuit.nodes, n.id)}
                  </option>
                ))}
              </select>
              <select className="input" value={selectedEdge.b} onChange={(e) => updateNodeCircuitEdgeEndpoints(selectedEdge.id, selectedEdge.a, e.target.value)} style={{ width: 110 }}>
                {nodeCircuit.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {labelOfNode(nodeCircuit.nodes, n.id)}
                  </option>
                ))}
              </select>
              <button className="btn tiny" type="button" onClick={() => flipNodeCircuitEdge(selectedEdge.id)} title="Swap endpoints (flip polarity/direction)">
                Flip
              </button>
            </div>

            <button className="btn tiny danger" type="button" onClick={() => removeNodeCircuitEdge(selectedEdge.id)}>
              Delete edge
            </button>
          </>
        ) : (
          <div className="mutedSmall">Select a node or edge.</div>
        )}
      </div>
    </div>
  )
}

