import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { ChevronDown, Download, ExternalLink, Smartphone } from 'lucide-react'
import { cn } from '../../lib/utils'
import { detectPlatform, isMobilePlatform, isTouchDevice, type Platform } from '../../lib/platform'
import {
  appsForPlatform,
  GET_AUTHENTICATOR_PATH,
  storeLinkFor,
  type AuthenticatorApp,
} from '../../lib/authenticator-apps'
import { analytics } from '../../hooks/useAnalytics'
import { StepDrawing } from './illustrations'

interface AuthenticatorAppGuideProps {
  /**
   * `setup` — beside the enrolment QR: every step, plus "I don't have an app".
   * `get`   — the public page a phone lands on: every step and the store links,
   *           without the "no app" section (the whole page IS that section).
   * `help`  — on the sign-in challenge: only where to find the code.
   */
  mode: 'setup' | 'get' | 'help'
  /** The otpauth:// link, for a phone that holds the authenticator itself. */
  uri?: string | null
  className?: string
}

/**
 * The per-app walkthrough (150). A row of app cards; pick yours and it opens
 * to three or four illustrated steps written for that app.
 *
 * The device decides the order, never the contents: an iPhone sees Apple
 * Passwords first because it is already installed, a Windows laptop sees the
 * desktop and browser options first. Everything else is still there below,
 * because the member in front of the laptop may be about to reach for the phone
 * in their pocket.
 */
export function AuthenticatorAppGuide({ mode, uri, className }: AuthenticatorAppGuideProps) {
  const { i18n } = useLingui()
  const platform = useMemo(() => detectPlatform(), [])
  const touch = useMemo(() => isTouchDevice(), [])
  const apps = useMemo(() => appsForPlatform(platform), [platform])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noApp, setNoApp] = useState(false)
  const selected = apps.find((app) => app.id === selectedId) ?? null

  const choose = (app: AuthenticatorApp) => {
    const next = selectedId === app.id ? null : app.id
    setSelectedId(next)
    if (next) analytics.funnel('mfa', 'app_chosen', { app: app.id, platform, mode })
  }

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-body-sm font-medium text-ktip-sand-800">
        {mode === 'help' ? (
          <Trans>Which app do you use? Pick one to see where your code is.</Trans>
        ) : (
          <Trans>Which app will you use? Pick one for step-by-step help.</Trans>
        )}
      </p>

      <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {apps.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            platform={platform}
            selected={selectedId === app.id}
            onSelect={() => choose(app)}
          />
        ))}
      </div>

      {selected && (
        <AppSteps app={selected} platform={platform} mode={mode} uri={uri} />
      )}

      {mode === 'setup' && (
        <div className="border-t border-ktip-sand-200 pt-4">
          <button
            type="button"
            onClick={() => {
              setNoApp((open) => !open)
              if (!noApp) analytics.funnel('mfa', 'no_app_opened', { platform, touch })
            }}
            className="flex items-center gap-2 text-body-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            <ChevronDown
              size={16}
              className={noApp ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
            <Trans>I don't have an app yet</Trans>
          </button>

          {noApp && (
            <div className="mt-3">
              {touch ? (
                <GetAppOnThisPhone apps={apps} platform={platform} uri={uri} />
              ) : (
                <GetAppQr />
              )}
            </div>
          )}
        </div>
      )}

      {/* Screen readers get the same content as text; the drawings are decoration. */}
      <span className="sr-only">{selected ? i18n._(selected.tagline) : null}</span>
    </div>
  )
}

function AppCard({
  app,
  platform,
  selected,
  onSelect,
}: {
  app: AuthenticatorApp
  platform: Platform
  selected: boolean
  onSelect: () => void
}) {
  const { i18n } = useLingui()
  const onDevice = app.builtIn && (platform === 'ios' || platform === 'mac')
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'min-w-0 rounded-xl border-2 px-3 py-2.5 text-left',
        'transition-[border-color,background-color,box-shadow] duration-200',
        selected
          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 shadow-sm'
          : 'border-ktip-sand-200 hover:border-ktip-ocean-300 hover:bg-ktip-sand-50/60',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="block truncate text-body-sm font-semibold text-ktip-sand-900">{app.name}</span>
        {onDevice && (
          <span className="ml-auto shrink-0 rounded-full bg-ktip-tropical-100 px-2 py-0.5 text-micro font-bold uppercase tracking-wide text-ktip-tropical-800">
            <Trans>On your device</Trans>
          </span>
        )}
        {!onDevice && app.noPhone && (
          <span className="ml-auto shrink-0 rounded-full bg-ktip-sand-100 px-2 py-0.5 text-micro font-bold uppercase tracking-wide text-ktip-sand-700">
            <Trans>No phone needed</Trans>
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-caption text-ktip-sand-600">{i18n._(app.tagline)}</span>
    </button>
  )
}

function AppSteps({
  app,
  platform,
  mode,
  uri,
}: {
  app: AuthenticatorApp
  platform: Platform
  mode: 'setup' | 'get' | 'help'
  uri?: string | null
}) {
  const { i18n } = useLingui()
  const store = storeLinkFor(app, platform)
  // On the challenge page the member already set the app up; only the last
  // step — where the code is — still applies.
  const steps = mode === 'help' ? app.steps.slice(-1) : app.steps

  return (
    <div className="rounded-xl border border-ktip-sand-200 bg-ktip-sand-50/60 p-4">
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3">
            <div className="h-16 w-24 shrink-0 rounded-lg bg-white text-ktip-ocean-700 border border-ktip-sand-200 p-1">
              <StepDrawing kind={step.illustration} />
            </div>
            <div className="min-w-0">
              <p className="text-micro font-bold uppercase tracking-wide text-ktip-sand-500">
                {mode === 'help' ? <Trans>Your code</Trans> : <Trans>Step {index + 1}</Trans>}
              </p>
              <p className="text-body-sm text-ktip-sand-800">{i18n._(step.text)}</p>
            </div>
          </li>
        ))}
      </ol>

      {mode === 'help' && (
        <p className="mt-4 text-caption text-ktip-sand-600">
          <Trans>
            KTIP not in the list? The app was set up on another device. Use a recovery code below
            instead.
          </Trans>
        </p>
      )}

      {mode !== 'help' && (store || (uri && isMobilePlatform(platform))) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {store && (
            <a
              href={store}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => analytics.funnel('mfa', 'store_link', { app: app.id, platform })}
              className="inline-flex items-center gap-2 rounded-full border border-ktip-ocean-200 bg-white px-3 py-1.5 text-body-sm font-medium text-ktip-ocean-700 hover:bg-ktip-ocean-50"
            >
              <Download size={15} />
              <Trans>Get {app.name}</Trans>
              <ExternalLink size={13} className="opacity-60" />
            </a>
          )}
          {uri && isMobilePlatform(platform) && (
            <a
              href={uri}
              className="inline-flex items-center gap-2 rounded-full border border-ktip-sand-200 bg-white px-3 py-1.5 text-body-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50"
            >
              <Smartphone size={15} />
              <Trans>Open in my authenticator app</Trans>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * On a phone, a QR code cannot be scanned by the device showing it. Offer the
 * store links directly, and the otpauth link that opens an installed app.
 */
function GetAppOnThisPhone({
  apps,
  platform,
  uri,
}: {
  apps: AuthenticatorApp[]
  platform: Platform
  uri?: string | null
}) {
  const withStore = apps.filter((app) => storeLinkFor(app, platform))
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ktip-sand-700">
        <Trans>Get one of these from your app store, then come back here and tap “Open in my authenticator app”.</Trans>
      </p>
      <div className="flex flex-wrap gap-2">
        {withStore.map((app) => (
          <a
            key={app.id}
            href={storeLinkFor(app, platform)!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => analytics.funnel('mfa', 'store_link', { app: app.id, platform })}
            className="inline-flex items-center gap-2 rounded-full border border-ktip-ocean-200 bg-white px-3 py-1.5 text-body-sm font-medium text-ktip-ocean-700 hover:bg-ktip-ocean-50"
          >
            <Download size={15} />
            {app.name}
          </a>
        ))}
      </div>
      {uri && (
        <a
          href={uri}
          className="inline-flex items-center gap-2 text-body-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          <Smartphone size={16} />
          <Trans>Open in my authenticator app</Trans>
        </a>
      )}
    </div>
  )
}

/**
 * The SECOND QR: a plain link to the public /get-authenticator page, which
 * works out the phone's platform and shows its store. Deliberately a different
 * code from the enrolment QR — that one carries the secret, and the secret
 * never goes into a URL KTIP serves. The library is loaded only when this
 * opens; most members never see it.
 */
function GetAppQr() {
  const [src, setSrc] = useState<string | null>(null)
  const url = `${window.location.origin}${GET_AUTHENTICATOR_PATH}`

  useEffect(() => {
    let cancelled = false
    analytics.funnel('mfa', 'get_app_qr_shown')
    void import('qrcode')
      .then((QRCode) => QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }))
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        /* the link below still works */
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      {src ? (
        <img
          src={src}
          alt=""
          width={144}
          height={144}
          className="shrink-0 rounded-control border border-ktip-sand-200 bg-white p-2"
        />
      ) : (
        <div className="h-36 w-36 shrink-0 rounded-control bg-ktip-sand-100 animate-pulse" />
      )}
      <div className="space-y-2 text-body-sm text-ktip-sand-700">
        <p>
          <Trans>
            Point your phone's camera at this code. It opens a page that shows you the right app
            for your phone and how to add KTIP to it.
          </Trans>
        </p>
        <p className="text-caption text-ktip-sand-500">
          <Trans>Then come back to this screen and scan the code above with the app.</Trans>
        </p>
        <p className="text-caption text-ktip-sand-500 break-all">{url}</p>
      </div>
    </div>
  )
}
