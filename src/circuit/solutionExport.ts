import type { ReductionLevel } from './reduce'
import { exportCircuitikz, type CircuitikzOptions } from './circuitikz'

export function exportSolutionLatex(
  levels: ReductionLevel[],
  options?: CircuitikzOptions,
): string {
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
    const circuitikz = exportCircuitikz(level.circuit, { ...(options ?? {}), includeCtikzset: false })
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

  lines.push('\\end{document}')
  return lines.join('\n')
}
