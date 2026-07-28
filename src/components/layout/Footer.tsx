import { Link } from 'react-router'
import { Github, Twitter, Linkedin, Mail } from 'lucide-react'
import { APP_NAME, APP_FULL_NAME } from '../../lib/constants'
import { FlipWatermark } from '../ui/FlipWatermark'

interface FooterLink {
  label: string
  href: string
  external?: boolean
}

interface FooterColumn {
  title: string
  links: FooterLink[]
}

const footerColumns: FooterColumn[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Discover', href: '/' },
      { label: 'Projects', href: '/projects' },
      { label: 'Events', href: '/events' },
      { label: 'Grants', href: '/grants' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Forums', href: '/forums' },
      { label: 'Directory', href: '/directory' },
      { label: 'Collaborate', href: '/collaborate' },
      { label: 'Resources', href: '/resources' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', href: '/help' },
      { label: 'My Reports', href: '/grievances/my-reports' },
      { label: 'Contact', href: 'mailto:support@ktip.org', external: true },
    ],
  },
]

const socialLinks = [
  { name: 'Twitter', icon: Twitter, href: 'https://twitter.com/ktip' },
  { name: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/ktip' },
  { name: 'GitHub', icon: Github, href: 'https://github.com/ktip' },
  { name: 'Email', icon: Mail, href: 'mailto:support@ktip.org' },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative bg-ktip-ink text-white mt-auto overflow-hidden border-t border-ktip-line/40">
      {/* Same rotating watermark as the homepage */}
      <FlipWatermark
        className="-bottom-[0.18em] right-0 md:-right-4"
        charClassName="text-white/[0.04]"
      />

      <div className="relative container mx-auto px-6 md:px-12 py-10 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo & Mission */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-5">
              <img src="/ktip%20logo%20no%20bg.png" alt="KTIP Logo" className="w-12 h-12 object-contain" />
              <div>
                <h3 className="text-xl font-display font-extrabold tracking-tight text-white">
                  {APP_NAME}
                </h3>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">
                  Innovation Platform
                </p>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed max-w-sm">
              {APP_FULL_NAME} - Empowering Caribbean innovators, mentors, and investors
              to collaborate and drive transformative change across the region.
            </p>
          </div>

          {/* Nav columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50 mb-4">
                {column.title}
              </h4>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        {link.label}
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
              &copy; {currentYear} OECS. All rights reserved.
            </p>
            <div className="flex items-center gap-3">
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
