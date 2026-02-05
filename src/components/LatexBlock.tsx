import katex from 'katex'
import 'katex/dist/katex.min.css'

type Props = {
  latex: string
}

export function LatexBlock({ latex }: Props) {
  if (!latex) return null
  const html = katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    strict: 'ignore',
  })
  return <div className="latex" dangerouslySetInnerHTML={{ __html: html }} />
}

