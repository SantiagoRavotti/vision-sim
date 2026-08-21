interface Props {
  holding: boolean
  onHoldChange: (holding: boolean) => void
  disabled: boolean
}

/**
 * Press-and-hold reveals normal vision; releasing returns to the simulation.
 *
 * Chosen over a tap-toggle because the default state should be the simulated
 * view - that is the thing worth looking at - and because a held thumb makes
 * the before/after switch instantaneous and repeatable without anyone having
 * to aim at a small control. Pointer events cover touch, pen and mouse in one
 * path; pointercancel matters because iOS fires it when a scroll or system
 * gesture steals the touch, and without it the button can latch.
 */
export function HoldToCompare({ holding, onHoldChange, disabled }: Props) {
  const release = () => {
    if (holding) onHoldChange(false)
  }
  return (
    <button
      type="button"
      className={`hold ${holding ? 'hold-on' : ''}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        onHoldChange(true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {holding ? 'Normal vision' : 'Hold to see normally'}
    </button>
  )
}
