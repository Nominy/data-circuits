import { layoutCircuit } from '../circuit/layout'
import type { ComponentDrawable, Drawable, WireDrawable } from '../circuit/layout'
import { useCircuitStore } from '../store/circuitStore'

type Props = {
  title?: string
  circuit: Parameters<typeof layoutCircuit>[0]
}

function isWire(d: Drawable): d is WireDrawable {
  return d.kind === 'wire'
}

function isComponent(d: Drawable): d is ComponentDrawable {
  return d.kind === 'resistor' || d.kind === 'ammeter'
}

export function CircuitView({ title, circuit }: Props) {
  const settings = useCircuitStore((s) => s.settings)
  const { drawables, bounds } = layoutCircuit(circuit)
  const pad = 1.4
  const minX = bounds.minX - pad
  const minY = bounds.minY - pad
  const width = bounds.maxX - bounds.minX + pad * 2
  const height = bounds.maxY - bounds.minY + pad * 2

  return (
    <div className="circuitView">
      {title ? <div className="seriesListTitle">{title}</div> : null}
      <svg viewBox={`${minX} ${minY} ${width} ${height}`} width="100%" height="320" role="img">
        <g stroke="rgba(255,255,255,0.9)" strokeWidth={0.08} fill="none" vectorEffect="non-scaling-stroke">
          {drawables.filter(isWire).map((w, i) => (
            <polyline
              key={i}
              points={w.points.map((p) => `${p.x},${p.y}`).join(' ')}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>

        {drawables.filter((d) => d.kind === 'terminal').map((t, i) => (
          <g key={i}>
            <circle cx={t.at.x} cy={t.at.y} r={0.16} fill="rgba(255,255,255,0.9)" />
            <text
              x={t.at.x + (t.polarity === 'plus' ? -0.25 : 0.25)}
              y={t.at.y - 0.25}
              fontSize={0.34}
              textAnchor={t.polarity === 'plus' ? 'end' : 'start'}
              fill="rgba(255,255,255,0.9)"
            >
              {t.polarity === 'plus' ? '+' : '-'}
            </text>
          </g>
        ))}

        {drawables.filter(isComponent).map((c) => {
          const dx = c.to.x - c.from.x
          const dy = c.to.y - c.from.y
          const horizontal = Math.abs(dx) >= Math.abs(dy)

          const midX = (c.from.x + c.to.x) / 2
          const midY = (c.from.y + c.to.y) / 2

          if (c.kind === 'ammeter') {
            return (
              <g key={`${c.kind}_${c.from.x}_${c.from.y}_${c.to.x}_${c.to.y}`}>
                <circle
                  cx={midX}
                  cy={midY}
                  r={0.26}
                  fill="rgba(0,0,0,0.65)"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={0.08}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={midX} y={midY + 0.12} fontSize={0.26} textAnchor="middle" fill="rgba(255,255,255,0.9)">
                  A
                </text>
                {c.label ? (
                  <text
                    x={midX + (horizontal ? 0 : 0.55)}
                    y={midY + (horizontal ? -0.42 : 0.05)}
                    fontSize={0.25}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.85)"
                  >
                    {c.label}
                  </text>
                ) : null}
              </g>
            )
          }

          const displayLabel = c.generated && !settings.showGeneratedLabels ? undefined : c.label
          const fill = c.generated ? 'rgba(128,160,255,0.18)' : 'rgba(0,0,0,0.55)'
          const stroke = c.generated ? 'rgba(128,160,255,0.75)' : 'rgba(255,255,255,0.9)'
          const dash = c.generated ? '0.14 0.14' : undefined

          if (horizontal) {
            const x = Math.min(c.from.x, c.to.x)
            const w = Math.abs(dx)
            return (
              <g key={`${c.kind}_${c.from.x}_${c.from.y}_${c.to.x}_${c.to.y}`}>
                <rect
                  x={x}
                  y={midY - 0.22}
                  width={w}
                  height={0.44}
                  rx={0.08}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.08}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={dash}
                />
                {displayLabel ? (
                  <text x={midX} y={midY - 0.42} fontSize={0.25} textAnchor="middle" fill="rgba(255,255,255,0.85)">
                    {displayLabel}
                  </text>
                ) : null}
                {settings.showValuesOnDiagram && typeof c.ohms === 'number' ? (
                  <text x={midX} y={midY + 0.52} fontSize={0.25} textAnchor="middle" fill="rgba(255,255,255,0.75)">
                    {c.ohms}Ω
                  </text>
                ) : null}
              </g>
            )
          }

          const y = Math.min(c.from.y, c.to.y)
          const h = Math.abs(dy)
          return (
            <g key={`${c.kind}_${c.from.x}_${c.from.y}_${c.to.x}_${c.to.y}`}>
              <rect
                x={midX - 0.22}
                y={y}
                width={0.44}
                height={h}
                rx={0.08}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.08}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={dash}
              />
              {displayLabel ? (
                <text x={midX + 0.55} y={midY + 0.05} fontSize={0.25} textAnchor="middle" fill="rgba(255,255,255,0.85)">
                  {displayLabel}
                </text>
              ) : null}
              {settings.showValuesOnDiagram && typeof c.ohms === 'number' ? (
                <text x={midX + 0.55} y={midY + 0.40} fontSize={0.25} textAnchor="middle" fill="rgba(255,255,255,0.75)">
                  {c.ohms}Ω
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

