import './Notice.css'

interface NoticeProps {
  text: string
  tone: 'error' | 'info'
  onDismiss: () => void
}

/** Inline banner for recoverable problems and status notes. */
export function Notice({ text, tone, onDismiss }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice__text">{text}</span>
      <button
        type="button"
        className="notice__dismiss"
        onClick={onDismiss}
        aria-label="Mbyll njoftimin"
      >
        ×
      </button>
    </div>
  )
}
