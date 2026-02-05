import { useEffect } from 'react'

type Props = {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="modalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modalCard" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">{title}</div>
            <div className="modalSubtitle">Press Esc to close</div>
          </div>
          <button className="btn tiny" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  )
}

