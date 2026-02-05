import { layoutCircuit } from './layout'
import type { Circuit } from './model'

export type CircuitikzOptions = {
  includeValues?: boolean
  includeLabels?: boolean
  includeGeneratedLabels?: boolean
  includeCtikzset?: boolean
  invertY?: boolean
  includeTerminals?: boolean
  currentArrowLabelsByResistorId?: Record<string, string>
  currentArrowDirectionsByResistorId?: Record<string, 1 | -1>
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
    includeTerminals: options?.includeTerminals ?? true,
    currentArrowLabelsByResistorId: options?.currentArrowLabelsByResistorId ?? {},
    currentArrowDirectionsByResistorId: options?.currentArrowDirectionsByResistorId ?? {},
    resistorAutoLabelsById: options?.resistorAutoLabelsById ?? {},
  }

  const { drawables } = layoutCircuit(circuit, { includeTerminals: opts.includeTerminals })
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
    if (d.kind === 'vsource') {
      const parts: string[] = ['V']
      if (opts.includeLabels && d.label && d.label.trim().length > 0) {
        parts.push(`l=$\\mathrm{${escapeLatexText(d.label)}}$`)
      }
      if (opts.includeValues && typeof d.volts === 'number') {
        parts.push(`a=$${formatNum(d.volts)}\\,\\mathrm{V}$`)
      }
      lines.push(`\\draw ${pt(d.from.x, d.from.y)} to[${parts.join(',')}] ${pt(d.to.x, d.to.y)};`)
      continue
    }
    if (d.kind === 'isource') {
      const parts: string[] = ['I']
      if (opts.includeLabels && d.label && d.label.trim().length > 0) {
        parts.push(`l=$\\mathrm{${escapeLatexText(d.label)}}$`)
      }
      if (opts.includeValues && typeof d.amps === 'number') {
        parts.push(`a=$${formatNum(d.amps)}\\,\\mathrm{A}$`)
      }
      lines.push(`\\draw ${pt(d.from.x, d.from.y)} to[${parts.join(',')}] ${pt(d.to.x, d.to.y)};`)
      continue
    }
    if (d.kind === 'resistor') {
      const parts: string[] = ['R']
      const labelAllowed = opts.includeLabels && (!d.generated || opts.includeGeneratedLabels)
      if (labelAllowed) {
        const auto = opts.resistorAutoLabelsById[d.id]
        const label = auto ? auto : d.label && d.label.trim().length > 0 ? d.label : undefined
        if (label && label.trim().length > 0) parts.push(`l=$\\mathrm{${escapeLatexText(label)}}$`)
      }
      if (opts.includeValues && typeof d.ohms === 'number') {
        parts.push(`a=$${formatNum(d.ohms)}\\,\\Omega$`)
      }
      lines.push(`\\draw ${pt(d.from.x, d.from.y)} to[${parts.join(',')}] ${pt(d.to.x, d.to.y)};`)

      const currentLabel = opts.currentArrowLabelsByResistorId[d.id]
      if (currentLabel) {
        const dir = opts.currentArrowDirectionsByResistorId[d.id] ?? 1
        const head = dir >= 0 ? d.from : d.to
        const other = dir >= 0 ? d.to : d.from
        const { ux, uy, len } = unitVec(head, other)
        if (len > 0) {
          const arrowLen = 0.6
          const sx = head.x - ux * arrowLen
          const sy = head.y - uy * arrowLen
          const labelPos = Math.abs(other.x - head.x) >= Math.abs(other.y - head.y) ? 'above' : 'right'
          lines.push(
            `\\draw[->] ${pt(sx, sy)} -- ${pt(head.x, head.y)} node[midway,${labelPos}]{$${currentLabel}$};`,
          )
        }
      }
      continue
    }
  }

  lines.push('\\end{circuitikz}')
  return lines.join('\n')
}
