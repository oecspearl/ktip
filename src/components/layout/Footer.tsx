import { Link } from 'react-router'
import { Github, Twitter, Linkedin, Mail } from 'lucide-react'
import { APP_NAME, APP_FULL_NAME } from '../../lib/constants'

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
    <footer className="bg-gray-900 text-white mt-auto">
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Logo & Mission */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-5">
              <img src="/ktiplogo.png" alt="KTIP Logo" className="w-12 h-12 rounded-xl" />
              <div>
                <h3 className="text-xl font-display font-bold text-white">{APP_NAME}</h3>
                <p className="text-xs text-gray-400">Innovation Platform</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
              {APP_FULL_NAME} - Empowering Caribbean innovators, mentors, and investors
              to collaborate and drive transformative change across the region.
            </p>
          </div>

          {/* Nav columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="font-display font-bold text-white text-lg mb-6">{column.title}</h4>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
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
      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              &copy; {currentYear} OECS. All rights reserved.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
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
