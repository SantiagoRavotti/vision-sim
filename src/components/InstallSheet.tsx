import type { InstallRoute } from '../pwa/useInstallState'

interface Props {
  route: InstallRoute
  onClose: () => void
}

/**
 * Shown only for iOS routes. On Chromium the pill fires the native prompt
 * directly - putting a sheet in front of it would just add a tap.
 */
export function InstallSheet({ route, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>Install Vision Sim</h2>

        {route === 'ios-other-browser' ? (
          <>
            <p>
              Only <strong>Safari</strong> can add Vision Sim to your home screen as a real app. In
              this browser it would just become a bookmark.
            </p>
            <p className="fine">
              Copy this page's link, open it in Safari, then tap Install again.
            </p>
          </>
        ) : (
          <>
            <ol className="steps">
              <li>
                Tap <IosShareGlyph /> <strong>Share</strong> in the Safari toolbar
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>
              </li>
              <li>
                Make sure <strong>Open as Web App</strong> is on
              </li>
              <li>
                Tap <strong>Add</strong>
              </li>
            </ol>
            <p className="fine">
              Then launch Vision Sim from its icon. It opens straight into the camera, with no
              browser bars.
            </p>
          </>
        )}

        <button type="button" className="cta" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

/** The iOS share symbol, so step 1 points at something recognisable. */
function IosShareGlyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v11M12 3l-3.2 3.2M12 3l3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M7 10.5H5.6A1.6 1.6 0 0 0 4 12.1v7.3A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6v-7.3a1.6 1.6 0 0 0-1.6-1.6H17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Download-tray glyph for the topbar install pill. */
export function InstallGlyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v10M12 13l-3.4-3.4M12 13l3.4-3.4M4.5 17.5v1.4A2.1 2.1 0 0 0 6.6 21h10.8a2.1 2.1 0 0 0 2.1-2.1v-1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
