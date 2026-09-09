import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { Platform } from './platform'

/**
 * The authenticator apps the walkthrough knows how to describe (150).
 *
 * Pure data. Copy is wrapped in msg`` in place, exactly as ROLE_DEFINITIONS
 * does in permissions.ts, so lingui extracts it without this module having to
 * be listed in the harvest rules. Rendered with i18n._() at the call site.
 *
 * Every step points at one of five generic drawings rather than at a
 * screenshot of the app: screenshots go stale every time an app redesigns,
 * carry somebody else's trademark, and bake English into pixels. A drawing of
 * "a plus button" is true of every app and every language at once.
 *
 * Order matters and is the order they are offered: the thing already on the
 * member's device first, then the two names most people have heard of, then
 * the answers for a member with no smartphone at all. Authy is absent on
 * purpose — its desktop app was discontinued in 2024 and it needs a phone
 * number, which is the one thing this list exists to route around.
 */

export type AppPlatform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'browser'

/** The five drawings in components/security/illustrations.tsx. */
export type StepIllustration = 'store' | 'add' | 'scan' | 'key' | 'code'

export interface AuthenticatorStep {
  text: MessageDescriptor
  illustration: StepIllustration
}

export interface AuthenticatorApp {
  id: string
  /** Product name — a trademark, never translated. */
  name: string
  tagline: MessageDescriptor
  platforms: AppPlatform[]
  /** Where to get it. Absent for something already on the device. */
  store: Partial<Record<'ios' | 'android' | 'desktop' | 'browser', string>>
  /** Ships with the operating system: nothing to install. */
  builtIn?: boolean
  /** Works on a computer, for the member with no smartphone. */
  noPhone?: boolean
  steps: AuthenticatorStep[]
}

/** The public page a phone lands on after scanning the "get an app" QR. */
export const GET_AUTHENTICATOR_PATH = '/get-authenticator'

const SCAN_OR_KEY = msg`Choose “Scan a QR code” and point the camera at the code KTIP shows — or choose “Enter a setup key” and type the key from under “Can't scan the code?”.`
const READ_CODE = msg`The app now shows a 6-digit code for KTIP that changes every 30 seconds. Type it into KTIP to finish.`

export const AUTHENTICATOR_APPS: AuthenticatorApp[] = [
  {
    id: 'apple-passwords',
    name: 'Apple Passwords',
    tagline: msg`Already on every iPhone, iPad and Mac. Nothing to install.`,
    platforms: ['ios', 'mac'],
    store: {},
    builtIn: true,
    steps: [
      {
        text: msg`Open the Passwords app (on iOS 15 to 17, open Settings, then Passwords) and go to Codes.`,
        illustration: 'add',
      },
      {
        text: msg`Tap + and choose “Scan QR Code”, then point the camera at the code KTIP shows. Or choose “Enter Setup Key” and type the key from under “Can't scan the code?”.`,
        illustration: 'scan',
      },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
  {
    id: 'google-authenticator',
    name: 'Google Authenticator',
    tagline: msg`Free, simple, and the one most people have heard of.`,
    platforms: ['ios', 'android'],
    store: {
      ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
      android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
    },
    steps: [
      {
        text: msg`Install Google Authenticator from the App Store or Google Play, then open it.`,
        illustration: 'store',
      },
      { text: msg`Tap the + button in the bottom corner.`, illustration: 'add' },
      { text: SCAN_OR_KEY, illustration: 'scan' },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
  {
    id: 'microsoft-authenticator',
    name: 'Microsoft Authenticator',
    tagline: msg`You may already have it for a work or school Microsoft account.`,
    platforms: ['ios', 'android'],
    store: {
      ios: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
      android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
    },
    steps: [
      {
        text: msg`Install Microsoft Authenticator from the App Store or Google Play, then open it.`,
        illustration: 'store',
      },
      {
        text: msg`Tap + and choose “Other account (Google, Facebook, etc.)”.`,
        illustration: 'add',
      },
      { text: SCAN_OR_KEY, illustration: 'scan' },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
  {
    id: 'ente-auth',
    name: 'Ente Auth',
    tagline: msg`Free and open source. Works on a computer as well as a phone.`,
    platforms: ['ios', 'android', 'windows', 'mac', 'linux'],
    store: {
      ios: 'https://apps.apple.com/app/ente-auth/id6444121398',
      android: 'https://play.google.com/store/apps/details?id=io.ente.auth',
      desktop: 'https://ente.io/auth',
    },
    noPhone: true,
    steps: [
      {
        text: msg`Download Ente Auth for your computer from ente.io/auth, or from the app store on a phone, and open it.`,
        illustration: 'store',
      },
      { text: msg`Choose + to add a code.`, illustration: 'add' },
      {
        text: msg`On a computer, choose “Enter details manually” and paste the setup key from under “Can't scan the code?”. On a phone, scan the QR code instead.`,
        illustration: 'key',
      },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
  {
    id: 'proton-authenticator',
    name: 'Proton Authenticator',
    tagline: msg`Free, from the Proton Mail people. Phone and computer.`,
    platforms: ['ios', 'android', 'windows', 'mac', 'linux'],
    store: {
      desktop: 'https://proton.me/authenticator',
      ios: 'https://proton.me/authenticator',
      android: 'https://proton.me/authenticator',
    },
    noPhone: true,
    steps: [
      {
        text: msg`Download Proton Authenticator from proton.me/authenticator for your phone or computer, and open it.`,
        illustration: 'store',
      },
      { text: msg`Choose + to add a code.`, illustration: 'add' },
      {
        text: msg`On a computer, choose to enter the details manually and paste the setup key from under “Can't scan the code?”. On a phone, scan the QR code instead.`,
        illustration: 'key',
      },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
  {
    id: '2fas',
    name: '2FAS',
    tagline: msg`A browser extension for Chrome, Edge or Firefox. No phone needed.`,
    platforms: ['browser', 'ios', 'android'],
    store: {
      browser: 'https://2fas.com/browser-extension',
      ios: 'https://2fas.com',
      android: 'https://2fas.com',
    },
    noPhone: true,
    steps: [
      {
        text: msg`Add the 2FAS extension to your browser from 2fas.com/browser-extension.`,
        illustration: 'store',
      },
      { text: msg`Click the 2FAS icon in the toolbar and choose to add a new service.`, illustration: 'add' },
      {
        text: msg`Let it read the QR code on this page, or paste the setup key from under “Can't scan the code?”.`,
        illustration: 'key',
      },
      { text: READ_CODE, illustration: 'code' },
    ],
  },
]

const APP_BY_ID = new Map(AUTHENTICATOR_APPS.map((app) => [app.id, app]))

export function authenticatorApp(id: string): AuthenticatorApp | undefined {
  return APP_BY_ID.get(id)
}

/**
 * Every app, with the ones that fit this device first. Nothing is hidden —
 * a member on a Windows laptop may well be about to install something on the
 * phone in their pocket — the order just puts the likely answer at the top.
 */
export function appsForPlatform(platform: Platform): AuthenticatorApp[] {
  const fits = (app: AuthenticatorApp) => {
    if (platform === 'unknown') return false
    if (platform === 'ios' || platform === 'android') return app.platforms.includes(platform)
    // A desktop: the apps that run on this computer, browser extensions included.
    return app.platforms.includes(platform) || app.platforms.includes('browser')
  }
  return [...AUTHENTICATOR_APPS.filter(fits), ...AUTHENTICATOR_APPS.filter((app) => !fits(app))]
}

/** The store link that suits this device, or null when there is nothing to get. */
export function storeLinkFor(app: AuthenticatorApp, platform: Platform): string | null {
  if (platform === 'ios') return app.store.ios ?? null
  if (platform === 'android') return app.store.android ?? null
  return app.store.desktop ?? app.store.browser ?? null
}
