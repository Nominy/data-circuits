import type { ReductionLevel } from './reduce'
import { exportCircuitikz, type CircuitikzOptions } from './circuitikz'
import { circuitHasIndependentSources } from './graph'
import type { NodeCircuit } from './nodeCircuit'
import { solveNodeCircuitBySuperposition } from './nodeCircuitSolve'
import { solveCircuit } from './solve'

type AnalysisOptions = {
  supplyVolts?: number
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

export function exportSolutionLatex(
  levels: ReductionLevel[],
  options?: CircuitikzOptions,
  analysis?: AnalysisOptions,
  nodeCircuit?: NodeCircuit,
): string {
  const supplyVolts = analysis?.supplyVolts
  const rootCircuit = levels[0]?.circuit
  const includeTerminals =
    typeof supplyVolts === 'number' && Number.isFinite(supplyVolts)
      ? true
      : rootCircuit
        ? !circuitHasIndependentSources(rootCircuit)
        : true
  const shouldSolve =
    !!rootCircuit &&
    (circuitHasIndependentSources(rootCircuit) ||
      (typeof supplyVolts === 'number' && Number.isFinite(supplyVolts)))
  const solved = shouldSolve && rootCircuit ? solveCircuit(rootCircuit, typeof supplyVolts === 'number' ? { externalSupplyVolts: supplyVolts } : undefined) : null
  const directionalSolved = nodeCircuit ? solveNodeCircuitBySuperposition(nodeCircuit) : null
  const currentArrowLabelsByResistorId: Record<string, string> = {}
  const currentArrowDirectionsByResistorId: Record<string, 1 | -1> = {}
  const resistorAutoLabelsById: Record<string, string> = {}
  if (solved?.ok) {
    for (const r of solved.result.resistors) {
      currentArrowLabelsByResistorId[r.id] = `I_{R${r.index}}`
      currentArrowDirectionsByResistorId[r.id] = r.currentA >= 0 ? 1 : -1
      resistorAutoLabelsById[r.id] = `R${r.index}`
    }
  }

  const lines: string[] = []
  lines.push('\\documentclass{article}')
  lines.push('\\usepackage{amsmath}')
  lines.push('\\usepackage{graphicx}')
  lines.push('\\usepackage{adjustbox}')
  lines.push('\\usepackage[margin=1in]{geometry}')
  lines.push('\\usepackage{circuitikz}')
  lines.push('\\begin{document}')
  lines.push('\\section*{Circuit reduction}')
  lines.push('\\ctikzset{european}')

  for (const level of levels) {
    lines.push(`\\subsection*{Level ${level.index}}`)
    const circuitikz = exportCircuitikz(level.circuit, {
      ...(options ?? {}),
      includeCtikzset: false,
      includeTerminals,
      ...(level.index === 0 && Object.keys(currentArrowLabelsByResistorId).length > 0
        ? { currentArrowLabelsByResistorId, currentArrowDirectionsByResistorId, resistorAutoLabelsById }
        : {}),
    })
    lines.push('\\begin{center}')
    lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.55\\textheight},center}')
    lines.push(circuitikz)
    lines.push('\\end{adjustbox}')
    lines.push('\\end{center}')
    if (level.index > 0 && level.latexAligned.trim().length > 0) {
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.25\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push(level.latexAligned)
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
    }
    lines.push('')
  }

  if (shouldSolve) {
    lines.push('\\section*{Superposition (currents and voltages)}')
    if (!solved) {
      lines.push('{\\small Could not compute currents/voltages.}')
    } else if (!solved.ok) {
      lines.push(`{\\small \\textbf{Cannot compute currents/voltages:} ${solved.error}}`)
    } else if (solved.result.resistors.length === 0 && solved.result.ammeters.length === 0) {
      lines.push('{\\small No resistors or ammeters found to compute currents.}')
    } else {
      const ext = solved.result.externalSupplyVolts
      if (typeof ext === 'number' && Number.isFinite(ext)) {
        lines.push(`{\\small External supply voltage $U_s = ${formatNum(ext)}\\,\\mathrm{V}$ (between + and - terminals).}`)
        if (typeof solved.result.externalSupplyCurrentA === 'number' && Number.isFinite(solved.result.externalSupplyCurrentA)) {
          lines.push(`{\\small Total supply current $I_s = ${formatNum(solved.result.externalSupplyCurrentA)}\\,\\mathrm{A}$.}`)
        }
        lines.push('')
      }

      lines.push('{\\small For each independent source, deactivate all other independent sources:')
      lines.push('\\begin{itemize}')
      lines.push('\\item Voltage sources: set $U=0$ (short circuit).')
      lines.push('\\item Current sources: set $I=0$ (open circuit).')
      lines.push('\\end{itemize}')
      lines.push('}')
      lines.push('')

      const cases = solved.result.superposition.cases
      const directionalCasesBySourceId: Record<string, (typeof cases)[number]> | null =
        directionalSolved && directionalSolved.ok
          ? Object.fromEntries(directionalSolved.cases.map((caseEntry) => [caseEntry.source.id, caseEntry]))
          : null
      for (const [caseIndex, c] of cases.entries()) {
        const s = c.source
        const srcMath = s.name && s.name.trim().length > 0 ? s.name : s.kind === 'vsource' ? `U_{${caseIndex + 1}}` : `I_{${caseIndex + 1}}`
        const unit = s.unit === 'V' ? '\\,\\mathrm{V}' : '\\,\\mathrm{A}'
        lines.push(`\\subsection*{Source ${caseIndex + 1}: $${srcMath} = ${formatNum(s.value)}${unit}$}`)
        lines.push('\\begin{center}')
        lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
        lines.push('{\\small $\\displaystyle')
        lines.push('\\begin{aligned}')
        for (const r of solved.result.resistors) {
          const i = c.resistorCurrentsById[r.id] ?? 0
          lines.push(`I_{R${r.index}}^{(${caseIndex + 1})} &= ${formatNum(i)}\\,\\mathrm{A} \\\\`)
        }
        for (const a of solved.result.ammeters) {
          const directionalCase = directionalCasesBySourceId ? directionalCasesBySourceId[s.id] ?? null : null
          const iUi = directionalCase ? directionalCase.voltageSourceCurrentsById[`ammeter:${a.id}`] ?? 0 : c.voltageSourceCurrentsById[`ammeter:${a.id}`] ?? 0
          lines.push(`I_{A${a.index}}^{(${caseIndex + 1})} &= ${formatNum(iUi)}\\,\\mathrm{A} \\\\`)
        }
        lines.push('\\end{aligned}')
        lines.push('$}')
        lines.push('\\end{adjustbox}')
        lines.push('\\end{center}')
        lines.push('')
      }

      lines.push('\\subsection*{Sum of contributions}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.85\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        const parts: string[] = []
        for (let i = 0; i < cases.length; i += 1) parts.push(`I_{R${r.index}}^{(${i + 1})}`)
        const rhs = parts.length > 0 ? parts.join(' + ') : '0'
        lines.push(`I_{R${r.index}} &= ${rhs} = ${formatNum(r.currentA)}\\,\\mathrm{A} \\\\`)
      }
      for (const a of solved.result.ammeters) {
        const parts: string[] = []
        for (let i = 0; i < cases.length; i += 1) parts.push(`I_{A${a.index}}^{(${i + 1})}`)
        const rhs = parts.length > 0 ? parts.join(' + ') : '0'
        const iUi =
          directionalSolved && directionalSolved.ok ? directionalSolved.voltageSourceCurrentsById[`ammeter:${a.id}`] ?? 0 : a.currentA
        lines.push(`I_{A${a.index}} &= ${rhs} = ${formatNum(iUi)}\\,\\mathrm{A} \\\\`)
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Resistances}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(`R_{R${r.index}} &= ${formatNum(r.ohms)}\\,\\Omega \\\\`)
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Currents (computed)}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(`I_{R${r.index}} &= ${r.currentFormulaLatex} \\\\`)
      }
      for (const a of solved.result.ammeters) {
        const iUi =
          directionalSolved && directionalSolved.ok ? directionalSolved.voltageSourceCurrentsById[`ammeter:${a.id}`] ?? 0 : a.currentA
        lines.push(`I_{A${a.index}} &= ${formatNum(iUi)}\\,\\mathrm{A} \\\\`)
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Voltages on resistors}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(
          `U_{R${r.index}} &= I_{R${r.index}}\\cdot R_{R${r.index}} = ${formatNum(r.currentA)}\\cdot ${formatNum(r.ohms)} = ${formatNum(r.voltageV)}\\,\\mathrm{V} \\\\`,
        )
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
    }
    lines.push('')
  }

  lines.push('\\end{document}')
  return lines.join('\n')
}
