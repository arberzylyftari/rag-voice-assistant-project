import './MicButton.css'

interface MicButtonProps {
  isRecording: boolean
  disabled?: boolean
  onToggle: () => void
}

/**
 * Push-to-talk control: press to start recording, press again to stop.
 *
 * This milestone renders the control and its states only — microphone
 * capture is wired up in the speech-to-text milestone.
 */
export function MicButton({ isRecording, disabled = false, onToggle }: MicButtonProps) {
  const label = isRecording ? 'Ndalo regjistrimin' : 'Shtyp për të folur'

  return (
    <div className="mic">
      <button
        type="button"
        className={`mic__button ${isRecording ? 'mic__button--recording' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        aria-label={label}
        aria-pressed={isRecording}
      >
        <MicIcon />
      </button>
      <span className="mic__label">{label}</span>
    </div>
  )
}

function MicIcon() {
  return (
    <svg
      className="mic__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}
