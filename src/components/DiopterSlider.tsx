interface Props {
  /** Magnitude in diopters, 0 .. 10. Displayed as a negative value. */
  value: number
  onChange: (v: number) => void
}

const MAX_D = 10
const STEP = 0.25
const PRESETS = [0, 0.75, 2, 4, 6]

/** U+2212 MINUS SIGN, not a hyphen. Prescriptions are typeset with the real one. */
export function formatDiopters(magnitude: number): string {
  if (magnitude === 0) return '0.00 D'
  return `−${magnitude.toFixed(2)} D`
}

export function DiopterSlider({ value, onChange }: Props) {
  return (
    <div className="control">
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${Math.abs(value - p) < 1e-6 ? 'chip-on' : ''}`}
            onClick={() => onChange(p)}
          >
            {p === 0 ? 'Normal' : formatDiopters(p)}
          </button>
        ))}
      </div>

      <div className="readout">
        <span className="readout-value">{formatDiopters(value)}</span>
        <span className="readout-label">Myopia</span>
      </div>

      <input
        className="slider"
        type="range"
        min={0}
        max={MAX_D}
        step={STEP}
        value={value}
        aria-label="Myopia in diopters"
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <div className="scale">
        <span>0.00</span>
        <span>{`−${MAX_D.toFixed(2)}`}</span>
      </div>
    </div>
  )
}
