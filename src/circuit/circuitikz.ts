import { layoutCircuit } from './layout'
import type { Circuit } from './model'

export type CircuitikzOptions = {
  includeValues?: boolean
  includeLabels?: boolean
  includeGeneratedLabels?: boolean
  includeCtikzset?: boolean
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

export function exportCircuitikz(circuit: Circuit, options?: CircuitikzOptions): string {
  const opts: Required<CircuitikzOptions> = {
    includeValues: options?.includeValues ?? true,
    includeLabels: options?.includeLabels ?? true,
    includeGeneratedLabels: options?.includeGeneratedLabels ?? true,
    includeCtikzset: options?.includeCtikzset ?? true,
  }

  const { drawables } = layoutCircuit(circuit)
  const lines: string[] = []

  if (opts.includeCtikzset) lines.push('\\ctikzset{european}')
  lines.push('\\begin{circuitikz}[x=1cm,y=1cm]')

  for (const d of drawables) {
    if (d.kind === 'wire') {
      const pts = d.points.map((p) => point(p.x, p.y)).join(' -- ')
      lines.push(`\\draw ${pts};`)
      continue
    }
    if (d.kind === 'terminal') {
      const label = d.polarity === 'plus' ? '+' : '-'
      const anchor = d.polarity === 'plus' ? 'left' : 'right'
      lines.push(`\\draw ${point(d.at.x, d.at.y)} node[ocirc]{} node[${anchor}]{$${label}$};`)
      continue
    }
    if (d.kind === 'ammeter') {
      const parts: string[] = ['ammeter']
      if (opts.includeLabels && d.label && d.label.trim().length > 0) {
        parts.push(`l=$\\mathrm{${escapeLatexText(d.label)}}$`)
      }
      lines.push(`\\draw ${point(d.from.x, d.from.y)} to[${parts.join(',')}] ${point(d.to.x, d.to.y)};`)
      continue
    }
    if (d.kind === 'resistor') {
      const parts: string[] = ['R']
      const labelAllowed = opts.includeLabels && (!d.generated || opts.includeGeneratedLabels)
      if (labelAllowed && d.label && d.label.trim().length > 0) {
        parts.push(`l=$\\mathrm{${escapeLatexText(d.label)}}$`)
      }
      if (opts.includeValues && typeof d.ohms === 'number') {
        parts.push(`a=$${formatNum(d.ohms)}\\,\\Omega$`)
      }
      lines.push(`\\draw ${point(d.from.x, d.from.y)} to[${parts.join(',')}] ${point(d.to.x, d.to.y)};`)
      continue
    }
  }

  lines.push('\\end{circuitikz}')
  return lines.join('\n')
}
