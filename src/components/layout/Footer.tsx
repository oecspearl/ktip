import { For } from 'solid-js'
import { A } from '@solidjs/router'
import { Github, Twitter, Linkedin, Mail, MapPin, Phone, BookOpen } from 'lucide-solid'
import { APP_NAME, APP_FULL_NAME } from '../../lib/constants'

export function Footer() {
  const currentYear = new Date().getFullYear()

  const contactInfo = [
    { icon: MapPin, text: 'Morne Fortune, Castries, Saint Lucia' },
    { icon: Phone, text: '+1 (758) 455-6327' },
    { icon: Mail, text: 'support@ktip.org' },
  ]

  const whatWeDo = [
    { label: 'Innovation Grants', percent: 75 },
    { label: 'Project Mentorship', percent: 60 },
    { label: 'Community Events', percent: 85 },
  ]

  const socialLinks = [
    { name: 'Twitter', icon: Twitter, href: 'https://twitter.com/ktip' },
    { name: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/ktip' },
    { name: 'GitHub', icon: Github, href: 'https://github.com/ktip' },
    { name: 'Email', icon: Mail, href: 'mailto:support@ktip.org' },
  ]

  return (
    <footer class="bg-gray-900 text-white mt-auto">
      <div class="container mx-auto px-4 py-14">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* Left Column: Logo, Mission, Contact */}
          <div>
            <div class="flex items-center gap-3 mb-5">
              <img src="/ktiplogo.png" alt="KTIP Logo" class="w-12 h-12 rounded-xl" />
              <div>
                <h3 class="text-xl font-display font-bold text-white">{APP_NAME}</h3>
                <p class="text-xs text-gray-400">Innovation Platform</p>
              </div>
            </div>
            <p class="text-gray-400 mb-6 text-sm leading-relaxed max-w-sm">
              {APP_FULL_NAME} - Empowering Caribbean innovators, mentors, and investors
              to collaborate and drive transformative change across the region.
            </p>
            <div class="space-y-3">
              <For each={contactInfo}>
                {(item) => (
                  <div class="flex items-center gap-3 text-sm text-gray-400">
                    <item.icon size={16} class="text-ktip-tropical-400 shrink-0" />
                    <span>{item.text}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Center Column: What We Do */}
          <div>
            <h4 class="font-display font-bold text-white text-lg mb-6">What We Do</h4>
            <div class="space-y-6">
              <For each={whatWeDo}>
                {(item) => (
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm text-gray-300 font-medium">{item.label}</span>
                      <span class="text-xs text-ktip-tropical-400 font-semibold">{item.percent}%</span>
                    </div>
                    <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-gradient-to-r from-ktip-tropical-500 to-ktip-ocean-500 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Right Column: Featured Resource */}
          <div>
            <h4 class="font-display font-bold text-white text-lg mb-6">Featured</h4>
            <div class="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <div class="w-10 h-10 bg-ktip-ocean-900/50 rounded-lg flex items-center justify-center mb-3">
                <BookOpen size={20} class="text-ktip-ocean-400" />
              </div>
              <h5 class="font-display font-semibold text-white text-sm mb-1">
                Caribbean Innovation Report 2026
              </h5>
              <p class="text-xs text-gray-400 mb-3 line-clamp-3">
                Explore the latest trends in technology, agriculture, and climate resilience
                across OECS member states.
              </p>
              <A
                href="/resources"
                class="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-400 hover:text-ktip-ocean-300 transition-colors"
              >
                Read More <span aria-hidden="true">&rarr;</span>
              </A>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bottom Bar */}
      <div class="border-t border-gray-800">
        <div class="container mx-auto px-4 py-5">
          <div class="flex flex-col md:flex-row items-center justify-between gap-4">
            <p class="text-sm text-gray-500">
              &copy; {currentYear} OECS. All rights reserved.
            </p>
            <div class="flex items-center gap-3">
              <For each={socialLinks}>
                {(link) => (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
                    aria-label={link.name}
                  >
                    <link.icon size={16} />
                  </a>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
