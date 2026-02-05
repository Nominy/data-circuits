import { layoutCircuit } from './layout'
import type { Circuit } from './model'

export type CircuitikzOptions = {
  includeValues?: boolean
  includeLabels?: boolean
  includeGeneratedLabels?: boolean
  includeCtikzset?: boolean
  invertY?: boolean
  currentArrowLabelsByResistorId?: Record<string, string>
  resistorAutoLabelsById?: Record<string, string>
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

function escapeLatexText(text: string): string {
  return text.replace(/[#$%&_{}]/g, (m) => `\\${m}`).replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
}

function point(x: number, y: number): string {
  return `(${formatNum(x)},${formatNum(y)})`
}

function unitVec(from: { x: number; y: number }, to: { x: number; y: number }): { ux: number; uy: number; len: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return { ux: 0, uy: 0, len: 0 }
  return { ux: dx / len, uy: dy / len, len }
}

export function exportCircuitikz(circuit: Circuit, options?: CircuitikzOptions): string {
  const opts: Required<CircuitikzOptions> = {
    includeValues: options?.includeValues ?? true,
    includeLabels: options?.includeLabels ?? true,
    includeGeneratedLabels: options?.includeGeneratedLabels ?? true,
    includeCtikzset: options?.includeCtikzset ?? true,
    invertY: options?.invertY ?? true,
    currentArrowLabelsByResistorId: options?.currentArrowLabelsByResistorId ?? {},
    resistorAutoLabelsById: options?.resistorAutoLabelsById ?? {},
  }

  const { drawables } = layoutCircuit(circuit)
  const lines: string[] = []

  const pt = (x: number, y: number) => point(x, opts.invertY ? -y : y)

  if (opts.includeCtikzset) lines.push('\\ctikzset{european}')
  lines.push('\\begin{circuitikz}[x=1cm,y=1cm]')

  for (const d of drawables) {
    if (d.kind === 'wire') {
      const pts = d.points.map((p) => pt(p.x, p.y)).join(' -- ')
      lines.push(`\\draw ${pts};`)
      continue
    }
    if (d.kind === 'terminal') {
      const label = d.polarity === 'plus' ? '+' : '-'
      const anchor = d.polarity === 'plus' ? 'left' : 'right'
      lines.push(`\\draw ${pt(d.at.x, d.at.y)} node[ocirc]{} node[${anchor}]{$${label}$};`)
      continue
    }
    if (d.kind === 'ammeter') {
      const parts: string[] = ['ammeter']
      if (opts.includeLabels && d.label && d.label.trim().length > 0) {
        parts.push(`l=$\\mathrm{${escapeLatexText(d.label)}}$`)
      }
      lines.push(`\\draw ${pt(d.from.x, d.from.y)} to[${parts.join(',')}] ${pt(d.to.x, d.to.y)};`)
      continue
    }
    if (d.kind === 'resistor') {
      const parts: string[] = ['R']
      const labelAllowed = opts.includeLabels && (!d.generated || opts.includeGeneratedLabels)
      if (labelAllowed) {
        const label = d.label && d.label.trim().length > 0 ? d.label : opts.resistorAutoLabelsById[d.id]
        if (label && label.trim().length > 0) parts.push(`l=$\\mathrm{${escapeLatexText(label)}}$`)
      }
      if (opts.includeValues && typeof d.ohms === 'number') {
        parts.push(`a=$${formatNum(d.ohms)}\\,\\Omega$`)
      }
      lines.push(`\\draw ${pt(d.from.x, d.from.y)} to[${parts.join(',')}] ${pt(d.to.x, d.to.y)};`)

      const currentLabel = opts.currentArrowLabelsByResistorId[d.id]
      if (currentLabel) {
        const { ux, uy, len } = unitVec(d.from, d.to)
        if (len > 0) {
          const arrowLen = 0.6
          const sx = d.from.x - ux * arrowLen
          const sy = d.from.y - uy * arrowLen
          const labelPos = Math.abs(d.to.x - d.from.x) >= Math.abs(d.to.y - d.from.y) ? 'above' : 'right'
          lines.push(
            `\\draw[->] ${pt(sx, sy)} -- ${pt(d.from.x, d.from.y)} node[midway,${labelPos}]{$${currentLabel}$};`,
          )
        }
      }
      continue
    }
  }

  lines.push('\\end{circuitikz}')
  return lines.join('\n')
}
