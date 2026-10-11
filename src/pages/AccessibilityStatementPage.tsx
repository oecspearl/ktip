import { Link } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { openA11y } from '../a11y/viridion'
import { PageHero } from '../components/layout/PageHero'
import { usePageTitle } from '../hooks/usePageTitle'
import { OPEN_FEEDBACK_EVENT } from '../a11y/A11yHost'

/**
 * What KTIP does for disabled members, what each of them can change, and
 * where it still falls short. Public, and outside the legal bundles: nothing
 * here is agreed to.
 *
 * Careful with claims. KTIP has not been audited, so WCAG 2.2 AA is stated
 * as the target, not as conformance. Update "Last reviewed" whenever a
 * limitation is fixed or found.
 */
export default function AccessibilityStatementPage() {
  const { t } = useLingui()
  usePageTitle(t`Accessibility`)

  const button =
    'font-medium text-ktip-ocean-600 underline underline-offset-2 hover:text-ktip-ocean-700 dark:text-ktip-ocean-500'

  return (
    <>
      <PageHero
        eyebrow={t`Accessibility`}
        title={t`Accessibility statement`}
        subtitle={t`How KTIP works for people with disabilities, what you can change, and where it still falls short.`}
        imageSeed="legal"
        compact
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Accessibility` }]}
      />

      <article className="mx-auto w-full max-w-prose px-4 py-10 text-body text-ktip-sand-800 [&>h2:first-child]:mt-0 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-title-sm [&_h2]:font-bold [&_h2]:text-ktip-sand-900 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h2 data-spy={t`Our aim`}>
          <Trans>Our aim</Trans>
        </h2>
        <p>
          <Trans>
            KTIP should work for every member, including members with disabilities. We aim to meet the Web Content
            Accessibility Guidelines (WCAG) 2.2 at level AA. KTIP has not yet been audited by an outside expert, so this is a target
            we are working towards, not a claim that we already meet it.
          </Trans>
        </p>

        <h2 data-spy={t`Change KTIP to suit you`}>
          <Trans>Change KTIP to suit you</Trans>
        </h2>
        <p>
          <Trans>
            Every page has an accessibility button. On most pages it is in the round button at the bottom right; on
            the sign-in pages it stands on its own.{' '}
            <button type="button" className={button} onClick={(e) => openA11y('panel', e.currentTarget)}>
              Open accessibility settings
            </button>
            .
          </Trans>
        </p>
        <ul>
          <li>
            <Trans>Text size from 90% to 150%, and extra space between letters and lines.</Trans>
          </li>
          <li>
            <Trans>Three easier fonts: Atkinson Hyperlegible, Lexend and OpenDyslexic.</Trans>
          </li>
          <li>
            <Trans>Higher contrast in light and dark themes. The page can also be made dimmer or brighter, with softer colours.</Trans>
          </li>
          <li>
            <Trans>Underlined links, highlighted headings, larger buttons, a large pointer and a strong focus outline.</Trans>
          </li>
          <li>
            <Trans>Reading aloud, paragraph by paragraph, in English, French or Spanish where your device has a voice for it.</Trans>
          </li>
          <li>
            <Trans>Keyboard shortcuts, and voice commands in Chrome, Edge and Safari.</Trans>
          </li>
          <li>
            <Trans>Animations and page transitions switched off.</Trans>
          </li>
        </ul>
        <p>
          <Trans>
            Once you are signed in, your settings follow you to your other devices. A short setup, offered once after
            you join, asks what would help and lets you try the changes on real pages. You can run it again from the
            same button.
          </Trans>
        </p>
        <p>
          <Trans>
            Your browser's own settings still apply: zoom, a larger default text size, reduced motion and Windows
            high-contrast themes.
          </Trans>
        </p>

        <h2 data-spy={t`Keyboard`}>
          <Trans>Keyboard</Trans>
        </h2>
        <p>
          <Trans>
            Most of KTIP can be used with the keyboard alone. Hold Alt and Shift (Option and Shift on a Mac) and press a
            number from 1 to 9 to go to a main page, C for the main content, F to search, A for accessibility
            settings, or K for{' '}
            <button type="button" className={button} onClick={() => openA11y('help')}>
              the full list
            </button>
            . These keys do not clash with screen readers. Single-key shortcuts are off unless you switch them on.
          </Trans>
        </p>

        <h2 data-spy={t`Voice commands`}>
          <Trans>Voice commands</Trans>
        </h2>
        <p>
          <Trans>
            Voice commands use the speech recognition built into your browser. To turn speech into text, Chrome sends
            your voice to Google, Edge to Microsoft and Safari to Apple. KTIP never receives the recording. Firefox
            has no speech recognition, so the commands are not offered there. The French and Spanish commands are new
            and may not understand every way of saying something.
          </Trans>
        </p>

        <h2 data-spy={t`Known limitations`}>
          <Trans>Known limitations</Trans>
        </h2>
        <ul>
          <li>
            <Trans>The virtual venue map and some charts are hard to use without sight.</Trans>
          </li>
          <li>
            <Trans>Photos uploaded by members may have no text description.</Trans>
          </li>
          <li>
            <Trans>Higher contrast does not change the colours inside photos, videos or content embedded from other sites.</Trans>
          </li>
          <li>
            <Trans>In live rooms, captions appear only when the person speaking has turned them on.</Trans>
          </li>
          <li>
            <Trans>Some admin tools have not yet been checked with a screen reader.</Trans>
          </li>
        </ul>

        <h2 data-spy={t`Tell us about a problem`}>
          <Trans>Tell us about a problem</Trans>
        </h2>
        <p>
          <Trans>
            If something on KTIP is hard to use, we want to know.{' '}
            <button
              type="button"
              className={button}
              onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
            >
              Send feedback
            </button>{' '}
            from any page, or read the <Link to="/help">help centre</Link>.
          </Trans>
        </p>

        <p className="mt-10 text-caption text-ktip-sand-600">
          <Trans>Last reviewed 11 October 2026.</Trans>
        </p>
      </article>
    </>
  )
}
