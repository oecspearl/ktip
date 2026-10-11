import { useMemo } from 'react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import type { MessageDescriptor } from '@lingui/core'
import type { JourneyStop, SetupGate } from './viridion'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsConsent } from '../lib/analytics-consent'
import { useHasSeenWelcome } from '../lib/welcome-panel'

interface StopDef {
  id: string
  path: string
  title: MessageDescriptor
  body: MessageDescriptor
  target?: string
  tryIt?: string[]
}

/**
 * The setup walkthrough: the main pages in Navbar order, each with one thing
 * to try there. Targets are optional; a stop whose element is missing (an
 * empty list, say) shows its card centred instead.
 */
const STOPS: StopDef[] = [
  {
    id: 'home',
    path: '/',
    title: msg`Text size`,
    body: msg`The home page has a bit of everything. Make the text bigger or smaller until it is comfortable to read.`,
    tryIt: ['fontScale', 'font'],
  },
  {
    id: 'projects',
    path: '/projects',
    title: msg`Hear a page read aloud`,
    body: msg`Turn on the reading bar, then press play. Each paragraph lights up as it is read.`,
    tryIt: ['readerBar', 'ttsRate'],
  },
  {
    id: 'events',
    path: '/events',
    title: msg`Moving around by keyboard`,
    body: msg`Press Alt and Shift and a number to jump between pages, or Alt, Shift and K to see every shortcut.`,
    tryIt: ['shortcuts', 'focusRing'],
  },
  {
    id: 'grants',
    path: '/grants',
    title: msg`Contrast and brightness`,
    body: msg`Funding calls carry a lot of small print. Try higher contrast, or dim the page if it glares.`,
    tryIt: ['contrast', 'pageBrightness', 'theme'],
  },
  {
    id: 'forums',
    path: '/forums',
    title: msg`Voice commands`,
    body: msg`Turn on voice commands, press the microphone and say "go to directory".`,
    tryIt: ['voiceNav'],
  },
  {
    id: 'directory',
    path: '/directory',
    title: msg`Links and buttons`,
    body: msg`Underlined links and larger buttons make a page of people easier to scan and to click.`,
    tryIt: ['underlineLinks', 'bigTargets'],
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    title: msg`Calm the page down`,
    body: msg`Your dashboard is where you will spend most time. Stop the animations if they distract you.`,
    tryIt: ['reduceMotion', 'highlightHeadings'],
  },
  {
    id: 'preferences',
    path: '/dashboard/preferences',
    title: msg`Change it all later`,
    body: msg`Every setting lives here, and on the accessibility button in the corner of each page.`,
    target: '#accessibility',
  },
]

export function useKtipJourney(): JourneyStop[] {
  const { i18n } = useLingui()
  return useMemo(
    () => STOPS.map((s) => ({ ...s, title: i18n._(s.title), body: i18n._(s.body) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, i18n.locale]
  )
}

/**
 * Home only: it is where sign-in lands, and the one main page with no tour of
 * its own to collide with.
 */
const ENTRY_PATHS = ['/']

/**
 * When setup may open by itself: signed in, onboarding and the MFA steps done,
 * and every other first-visit screen (welcome panel, analytics question)
 * already answered, so it never stacks on top of one.
 */
export function useKtipSetupGate(): SetupGate {
  const auth = useAuth()
  const welcomeSeen = useHasSeenWelcome()
  const consent = useAnalyticsConsent()
  const p = auth.profile
  const ready =
    !!auth.user &&
    !!p &&
    !auth.loading &&
    !auth.profileLoading &&
    (p.roles?.length ?? 0) > 0 &&
    !p.requires_age_declaration &&
    !p.requires_consent &&
    !p.requires_mfa_enrollment &&
    !auth.mfaChallengeLoading &&
    !auth.mfaChallengeRequired &&
    welcomeSeen &&
    consent !== 'pending'
  // VITE_A11Y_SETUP=off keeps it from opening unasked; the panel button still runs it
  const enabled = import.meta.env.VITE_A11Y_SETUP !== 'off'
  return useMemo(() => ({ enabled, ready, entryPaths: ENTRY_PATHS }), [enabled, ready])
}
