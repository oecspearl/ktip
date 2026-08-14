import { Link } from 'react-router'
import { Instagram, Linkedin, Facebook, Youtube } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { APP_NAME, APP_FULL_NAME } from '../../lib/constants'
import { FlipWatermark } from '../ui/FlipWatermark'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'

interface FooterLink {
  label: MessageDescriptor
  href: string
  external?: boolean
}

interface FooterColumn {
  title: MessageDescriptor
  links: FooterLink[]
}

/**
 * `msg` rather than `t`: these live at module scope, evaluated once at import,
 * long before anyone has chosen a language. The macro compiles each one to an
 * inert descriptor that `i18n._()` resolves at render — which is also what makes
 * the whole table re-read correctly when the language changes.
 */
const footerColumns: FooterColumn[] = [
  {
    title: msg`Explore`,
    links: [
      { label: msg`Discover`, href: '/' },
      { label: msg`Projects`, href: '/projects' },
      { label: msg`Events`, href: '/events' },
      { label: msg`Grants`, href: '/grants' },
    ],
  },
  {
    title: msg`Community`,
    links: [
      { label: msg`Forums`, href: '/forums' },
      { label: msg`Directory`, href: '/directory' },
      { label: msg`Collaborate`, href: '/collaborate' },
      { label: msg`Resources & Integrations`, href: '/resources' },
    ],
  },
  {
    title: msg`Support`,
    links: [
      { label: msg`Help Center`, href: '/help' },
      { label: msg`My Reports`, href: '/grievances/my-reports' },
      { label: msg`Contact`, href: 'mailto:support@ktip.org', external: true },
    ],
  },
  {
    title: msg`Legal`,
    links: [
      { label: msg`Terms of Use`, href: '/legal/terms' },
      { label: msg`Privacy Policy`, href: '/legal/privacy' },
      { label: msg`IP & Licensing`, href: '/legal/content-licence' },
      // In the footer because a rightsholder with no KTIP account has nowhere
      // else to look, and they are exactly who needs to find it.
      { label: msg`Report infringement`, href: '/legal/copyright/report' },
      { label: msg`All policies`, href: '/legal' },
    ],
  },
]

const socialLinks = [
  { name: 'Instagram', icon: Instagram, href: 'https://www.instagram.com/_oecscommission/' },
  { name: 'LinkedIn', icon: Linkedin, href: 'https://www.linkedin.com/company/organisation-of-eastern-caribbean-states/' },
  { name: 'Facebook', icon: Facebook, href: 'https://www.facebook.com/OECSCommission' },
  { name: 'YouTube', icon: Youtube, href: 'https://www.youtube.com/oecstv' },
]

export function Footer() {
  const currentYear = new Date().getFullYear()
  // `i18n._()` resolves the module-scope descriptors above. Reading it here is
  // also what subscribes this component to the active catalog.
  const { i18n } = useLingui()

  return (
    <footer className="relative bg-ktip-ink text-white mt-auto overflow-hidden border-t border-ktip-line/40">
      {/* Same rotating watermark as the homepage */}
      <FlipWatermark
        className="-bottom-[0.18em] right-0 md:-right-4"
        charClassName="text-white/[0.04]"
      />

      <div className="relative container mx-auto px-6 md:px-12 py-10 md:py-12">
        {/* Six columns, not four: the logo cell spans two and each of the four
            nav columns takes one. A fifth cell in a four-column grid wrapped
            raggedly, and at md the logo now spans the full width with the nav
            columns pairing 2×2 underneath it. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8">
          {/* Logo & Mission */}
          <div className="md:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <img src="/ktip-logo-128.webp" alt="KTiP" loading="lazy" decoding="async" width={48} height={48} className="w-12 h-12 object-contain" />
              <div>
                <h3 className="text-xl font-display font-extrabold tracking-tight text-white">
                  {APP_NAME}
                </h3>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">
                  <Trans>Innovation Platform</Trans>
                </p>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed max-w-sm">
              {/* One message, not a fragment plus a variable. A translator has to
                  be able to move {name} — French and Spanish both want it in a
                  different position from English here. */}
              <Trans>
                {APP_FULL_NAME} - Empowering Caribbean innovators, mentors, and investors to
                collaborate and drive transformative change across the region.
              </Trans>
            </p>
          </div>

          {/* Nav columns */}
          {footerColumns.map((column) => (
            // Keyed by href, not by label: the label is now a descriptor, and a
            // key that changes with the language would remount the whole column
            // on every switch.
            <div key={column.links[0].href}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50 mb-4">
                {i18n._(column.title)}
              </h4>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        {i18n._(link.label)}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        {i18n._(link.label)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Bottom Bar */}
      <div className="relative border-t border-white/10">
        <div className="container mx-auto px-6 md:px-12 py-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/40">
              <Trans>&copy; {currentYear} OECS. All rights reserved.</Trans>
            </p>
            <div className="flex items-center gap-3">
              {/* In the footer because that is where a logged-out visitor looks
                  for it, and because it is on every page including the ones
                  outside MainLayout. */}
              <LanguageSwitcher className="mr-1" />
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-white/10 text-white/70 hover:bg-white hover:text-brand-navy flex items-center justify-center transition-colors"
                  aria-label={link.name}
                >
                  <link.icon size={16} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
