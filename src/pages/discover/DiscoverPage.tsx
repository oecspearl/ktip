import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Button } from '../../components/ui/Button'

import { PreRegistrationModal } from '../../components/PreRegistrationModal'
import { useAuth } from '../../contexts/AuthContext'
import { analytics } from '../../hooks/useAnalytics'

import { useProjects, useFeaturedProjects } from '../../hooks/useProjects'
import {
  FolderKanban,
  Calendar,
  DollarSign,
  MessageSquare,
  Users,
  BookOpen,
  ArrowRight,

  MapPin,
  ChevronRight,
  Zap,
} from 'lucide-react'

export default function DiscoverPage() {
  usePageTitle('Discover')
  const auth = useAuth()

  const { projects } = useProjects()
  const { projects: featuredProjects } = useFeaturedProjects()

  // Pre-registration modal — auto-open for unauthenticated visitors (once per session)
  const [preregOpen, setPreregOpen] = useState(false)

  useEffect(() => {
    if (!auth.user && !sessionStorage.getItem('ktip_prereg_dismissed')) {
      const timer = setTimeout(() => {
        setPreregOpen(true)
        analytics.funnel('prereg', 'modal_auto_opened')
      }, 2000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreregClose = () => {
    setPreregOpen(false)
    sessionStorage.setItem('ktip_prereg_dismissed', '1')
  }

  // --- Hero Slider ---
  const [currentSlide, setCurrentSlide] = useState(0)
  const totalSlides = 3

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  // --- Event Countdown ---
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    // Countdown to OECS Super Regional Robotics Competition — March 16, 2026
    const targetDate = new Date('2026-03-16T08:00:00').getTime()

    const tick = () => {
      const now = Date.now()
      const diff = Math.max(0, targetDate - now)
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      })
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  // --- Count-Up Animation ---
  const [animatedStats, setAnimatedStats] = useState({ nations: 0, projects: 0, grants: 0, innovators: 0 })
  const [statsVisible, setStatsVisible] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!statsRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!statsVisible) return

    const targets = { nations: 12, projects: 200, grants: 2, innovators: 1500 }
    const duration = 2000
    const steps = 60
    const stepTime = duration / steps
    let step = 0
    let done = false

    const interval = setInterval(() => {
      if (done) return
      step++
      const progress = Math.min(step / steps, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      setAnimatedStats({
        nations: Math.round(eased * targets.nations),
        projects: Math.round(eased * targets.projects),
        grants: Math.round(eased * targets.grants * 10) / 10,
        innovators: Math.round(eased * targets.innovators),
      })
      if (step >= steps) {
        done = true
        clearInterval(interval)
      }
    }, stepTime)

    return () => {
      done = true
      clearInterval(interval)
    }
  }, [statsVisible])

  const features = [
    {
      title: 'Projects',
      category: 'Collaboration',
      description: 'Launch and collaborate on innovative projects with creators across the Caribbean.',
      href: '/projects',
      icon: FolderKanban,
      bgColor: 'bg-ktip-ocean-600',
      textColor: 'text-white',
      strip: 'Launch & collaborate',
    },
    {
      title: 'Events',
      category: 'Community',
      description: 'Discover workshops, hackathons, and networking events happening near you.',
      href: '/events',
      icon: Calendar,
      bgColor: 'bg-ktip-tropical-600',
      textColor: 'text-white',
      strip: 'Workshops & hackathons',
    },
    {
      title: 'Grants',
      category: 'Funding',
      description: 'Find funding opportunities and grants to turn your ideas into reality.',
      href: '/grants',
      icon: DollarSign,
      bgColor: 'bg-purple-600',
      textColor: 'text-white',
      strip: 'Find funding',
    },
    {
      title: 'Messages',
      category: 'Communication',
      description: 'Connect directly with mentors, investors, and fellow innovators.',
      href: '/messages',
      icon: MessageSquare,
      bgColor: 'bg-indigo-600',
      textColor: 'text-white',
      strip: 'Direct messaging',
    },
    {
      title: 'Forums',
      category: 'Discussion',
      description: 'Join discussions, share knowledge, and engage with the community.',
      href: '/forums',
      icon: Users,
      bgColor: 'bg-pink-600',
      textColor: 'text-white',
      strip: 'Community threads',
    },
    {
      title: 'Resources',
      category: 'Knowledge',
      description: 'Access articles, guides, case studies, and tools for Caribbean innovation.',
      href: '/resources',
      icon: BookOpen,
      bgColor: 'bg-orange-600',
      textColor: 'text-white',
      strip: 'Guides & articles',
    },
    {
      title: 'Directory',
      category: 'Network',
      description: 'Browse the member directory and connect with innovators across the Caribbean.',
      href: '/directory',
      icon: Users,
      bgColor: 'bg-teal-600',
      textColor: 'text-white',
      strip: 'Browse members',
    },
  ]

  return (
    <>
      {/* === Section 1: Three-Panel Action Band (hidden on mobile, shown in hamburger menu) === */}
      <div className="hidden md:grid grid-cols-3">
        <Link
          to="/projects/new"
          className="flex items-center justify-between px-6 py-4 bg-ktip-tropical-600 text-white hover:bg-ktip-tropical-700 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Zap size={20} />
            <span className="font-display font-semibold text-sm md:text-base">Become a Contributor</span>
          </div>
          <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          to="/grants"
          className="flex items-center justify-between px-6 py-4 bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <DollarSign size={20} />
            <span className="font-display font-semibold text-sm md:text-base">Browse Grants</span>
          </div>
          <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          to="/projects"
          className="flex items-center justify-between px-6 py-4 bg-amber-600 text-white hover:bg-amber-700 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <FolderKanban size={20} />
            <div>
              <span className="font-display font-semibold text-sm md:text-base">Explore Now</span>
              {projects && (
                <p className="text-xs text-white/80">{projects.length} Active Projects</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {projects && (
              <div className="w-16 h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((projects.length / 50) * 100, 100)}%` }}
                />
              </div>
            )}
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* === Section 2: Full-Bleed Hero Slider === */}
      <div className="relative min-h-[400px] md:min-h-[600px] bg-gray-900 overflow-hidden">
        {/* Background image — faded, sits at the very back */}
        <img
          src="/ktiphero.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
          loading="eager"
        />

        {/* Slide color overlays — semi-transparent so image bleeds through */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-ktip-ocean-900/70 via-ktip-ocean-800/60 to-gray-900/70 transition-opacity duration-1000"
          style={{ opacity: currentSlide === 0 ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(0,102,204,0.35), transparent 70%)' }} />
        </div>
        <div
          className="absolute inset-0 bg-gradient-to-br from-gray-900/70 via-ktip-tropical-900/60 to-gray-900/70 transition-opacity duration-1000"
          style={{ opacity: currentSlide === 1 ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 70% 60%, rgba(34,197,94,0.3), transparent 70%)' }} />
        </div>
        <div
          className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-gray-900/60 to-ktip-ocean-900/70 transition-opacity duration-1000"
          style={{ opacity: currentSlide === 2 ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(217,119,6,0.25), transparent 70%)' }} />
        </div>

        {/* Dark vignette overlay for text readability */}
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)' }} />

        {/* Content */}
        <div className="relative flex items-center justify-center min-h-[400px] md:min-h-[600px]">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-display font-extrabold text-white mb-6 animate-fade-in">
              Innovate. Collaborate.{' '}
              <span className="text-ktip-tropical-300">Transform.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 animate-slide-up">
              The Knowledge, Technology and Innovation Platform connecting visionaries, mentors,
              and investors across the Caribbean to build a brighter future together.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up">
              {!auth.user && (
                <Button
                  size="lg"
                  className="bg-ktip-tropical-500 hover:bg-ktip-tropical-600 text-white shadow-medium"
                  onClick={() => {
                    setPreregOpen(true)
                    analytics.click('hero_prereg_cta', 'Pre-Register Now')
                    analytics.funnel('prereg', 'modal_cta_opened')
                  }}
                >
                  Pre-Register Now
                </Button>
              )}
              <Link to="/projects" className="hidden sm:block">
                <Button size="lg" className="bg-white text-ktip-ocean-700 hover:bg-white/90 shadow-medium">
                  Explore Projects
                </Button>
              </Link>
              <Link to="/events" className="hidden sm:block">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-white hover:bg-white/10"
                >
                  Browse Events
                </Button>
              </Link>
            </div>

            {/* Slide indicators */}
            <div className="flex items-center justify-center gap-2 mt-10">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    currentSlide === i
                      ? 'bg-white w-8'
                      : 'bg-white/40 hover:bg-white/60 w-2.5'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* === Section 3: Cause-Style Feature Cards === */}
      <div className="bg-white py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-ktip-sand-900 mb-3">
              Everything you need to innovate
            </h2>
            <p className="text-lg text-ktip-sand-600 max-w-xl mx-auto">
              Discover tools and resources designed to empower Caribbean innovation.
            </p>
          </div>

          {/* Mobile: horizontal scroll carousel — one card per screen */}
          <div className="sm:hidden -mx-4 overflow-x-auto scrollbar-hide">
            <div className="flex snap-x snap-mandatory">
              {features.map((feature) => (
                <Link
                  key={feature.title}
                  to={feature.href}
                  className="group bg-white rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden hover:shadow-hard transition-all duration-300 snap-center shrink-0 w-[calc(100vw-2rem)] mx-4"
                >
                  <div className={`h-24 ${feature.bgColor} flex items-center justify-center`}>
                    <feature.icon size={36} className={feature.textColor} />
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ktip-sand-400 mb-1">
                      {feature.category}
                    </p>
                    <h3 className="text-lg font-display font-bold text-ktip-sand-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-ktip-sand-600 mb-3 text-sm leading-relaxed line-clamp-3">
                      {feature.description}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-600">
                      Explore <ArrowRight size={16} />
                    </span>
                  </div>
                  <div className="border-t border-ktip-sand-100 px-5 py-2.5 bg-ktip-sand-50/50">
                    <p className="text-xs text-ktip-sand-500">{feature.strip}</p>
                  </div>
                </Link>
              ))}
            </div>
            {/* Scroll hint */}
            <div className="flex justify-center gap-1.5 mt-4">
              {features.map((feature) => (
                <div key={feature.title} className="w-1.5 h-1.5 rounded-full bg-ktip-sand-300" />
              ))}
            </div>
          </div>

          {/* Desktop/tablet: grid layout */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature) => (
              <Link
                key={feature.title}
                to={feature.href}
                className="group bg-white rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden hover:shadow-hard hover:scale-105 transition-all duration-300"
              >
                <div className={`h-28 ${feature.bgColor} flex items-center justify-center`}>
                  <feature.icon size={40} className={feature.textColor} />
                </div>
                <div className="p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ktip-sand-400 mb-1">
                    {feature.category}
                  </p>
                  <h3 className="text-xl font-display font-bold text-ktip-sand-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-ktip-sand-600 mb-4 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-600 group-hover:gap-2 transition-all">
                    Explore <ArrowRight size={16} />
                  </span>
                </div>
                <div className="border-t border-ktip-sand-100 px-6 py-3 bg-ktip-sand-50/50">
                  <p className="text-xs text-ktip-sand-500">{feature.strip}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* === Section 4: Statistics Counter Bar === */}
      <div ref={statsRef} className="bg-ktip-ocean-700 py-14">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            <div>
              <p className="text-4xl md:text-5xl font-display font-bold text-white">
                {animatedStats.nations}
              </p>
              <p className="text-sm text-white/70 mt-2 font-medium">OECS Member States</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-display font-bold text-white">
                {animatedStats.projects}+
              </p>
              <p className="text-sm text-white/70 mt-2 font-medium">Active Projects</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-display font-bold text-white">
                ${animatedStats.grants}M+
              </p>
              <p className="text-sm text-white/70 mt-2 font-medium">Grants Available</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-display font-bold text-white">
                {animatedStats.innovators.toLocaleString()}+
              </p>
              <p className="text-sm text-white/70 mt-2 font-medium">Innovators</p>
            </div>
          </div>
        </div>
      </div>

      {/* === Section 5: Featured Projects === */}
      <div className="bg-gray-900 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-ktip-ocean-900/50 text-ktip-ocean-300 rounded-full px-4 py-2 mb-4">
              <FolderKanban size={18} />
              <span className="text-sm font-medium">Featured Projects</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
              Projects Making an Impact
            </h2>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Discover innovative projects from across the OECS region driving real change.
            </p>
          </div>

          {featuredProjects && featuredProjects.length > 0 ? (
            <>
              {/* Mobile: horizontal scroll carousel — one card per screen */}
              <div className="sm:hidden -mx-4 overflow-x-auto scrollbar-hide">
                <div className="flex snap-x snap-mandatory">
                  {featuredProjects.map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="group bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden hover:shadow-hard transition-all duration-300 snap-center shrink-0 w-[calc(100vw-2rem)] mx-4"
                    >
                      <div className="h-24 bg-ktip-ocean-900/40 flex items-center justify-center">
                        <FolderKanban size={36} className="text-ktip-ocean-400" />
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-ktip-ocean-900/50 text-ktip-ocean-300 text-[10px] font-bold uppercase tracking-wider rounded-full">
                            {(project as any).category || 'Project'}
                          </span>
                          {(project as any).country && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin size={12} />
                              {(project as any).country}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-display font-bold text-white mb-2 line-clamp-2">
                          {project.title}
                        </h3>
                        <p className="text-sm text-gray-400 line-clamp-3 mb-3">
                          {project.description}
                        </p>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-400">
                          View Project <ArrowRight size={14} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="flex justify-center gap-1.5 mt-4">
                  {featuredProjects.map((project) => (
                    <div key={project.id} className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  ))}
                </div>
              </div>

              {/* Desktop/tablet: grid layout */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {featuredProjects.map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="group bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden hover:shadow-hard hover:scale-105 transition-all duration-300"
                  >
                    <div className="h-24 bg-ktip-ocean-900/40 flex items-center justify-center">
                      <FolderKanban size={36} className="text-ktip-ocean-400" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-ktip-ocean-900/50 text-ktip-ocean-300 text-[10px] font-bold uppercase tracking-wider rounded-full">
                          {(project as any).category || 'Project'}
                        </span>
                        {(project as any).country && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={12} />
                            {(project as any).country}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-display font-bold text-white mb-2 line-clamp-2">
                        {project.title}
                      </h3>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                        {project.description}
                      </p>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-400 group-hover:gap-2 transition-all">
                        View Project <ArrowRight size={14} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* View All link */}
              <div className="text-center mt-8">
                <Link to="/projects">
                  <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white">
                    View All Projects <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="max-w-lg mx-auto">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center">
                <div className="w-16 h-16 bg-ktip-ocean-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderKanban size={32} className="text-ktip-ocean-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white mb-2">
                  No Featured Projects Yet
                </h3>
                <p className="text-gray-400 mb-6 text-sm">
                  Featured projects will appear here once selected by an administrator.
                </p>
                <Link to="/projects">
                  <Button size="md" className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700">
                    Browse All Projects
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === Section 6: Featured Event === */}
      <div className="bg-gray-800 py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Section label */}
          <div className="text-center mb-6 md:mb-8">
            <div className="inline-flex items-center gap-2 bg-ktip-tropical-900/50 text-ktip-tropical-300 rounded-full px-4 py-2 mb-3">
              <Calendar size={18} />
              <span className="text-sm font-medium">Featured Event</span>
            </div>
          </div>

          {/* Mobile: compact card */}
          <div className="sm:hidden">
            <div className="bg-gray-900/50 rounded-2xl border border-gray-700 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-ktip-tropical-500/20 text-ktip-tropical-400 text-[10px] font-bold uppercase tracking-wider rounded-full">
                  Active
                </span>
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-full">
                  Extended!
                </span>
              </div>

              <h3 className="text-xl font-display font-bold text-white mb-1">
                OECS Super Regional Robotics Competition 2026
              </h3>
              <p className="text-sm text-ktip-ocean-300 font-medium mb-4">
                The Premier Robotics Championship of the Eastern Caribbean
              </p>

              <div className="flex flex-col gap-2 text-sm mb-4">
                <span className="inline-flex items-center gap-1.5 text-gray-300">
                  <Calendar size={14} className="text-ktip-tropical-400" />
                  March 16 – 20, 2026
                </span>
                <span className="inline-flex items-center gap-1.5 text-gray-300">
                  <MapPin size={14} className="text-ktip-tropical-400" />
                  Saint Kitts and Nevis
                </span>
              </div>

              {/* Compact countdown */}
              <div className="flex items-center justify-center gap-2 mb-5">
                {[
                  { label: 'D', value: countdown.days },
                  { label: 'H', value: countdown.hours },
                  { label: 'M', value: countdown.minutes },
                  { label: 'S', value: countdown.seconds },
                ].map((unit) => (
                  <div key={unit.label} className="text-center">
                    <div className="w-14 h-14 bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
                      <span className="text-xl font-display font-bold text-white">
                        {String(unit.value).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1 uppercase tracking-wider font-medium">
                      {unit.label}
                    </p>
                  </div>
                ))}
              </div>

              <a
                href="https://www.steamtournament.com/public-registration?tournament=126b27b2-cf70-443b-b54e-1233b10aaa9d"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button size="md" className="w-full bg-ktip-tropical-600 text-white hover:bg-ktip-tropical-700">
                  View Event
                </Button>
              </a>
            </div>
          </div>

          {/* Desktop: full layout */}
          <div className="hidden sm:block max-w-full">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2.5 py-1 bg-ktip-tropical-500/20 text-ktip-tropical-400 text-xs font-bold uppercase tracking-wider rounded-full">
                    Active
                  </span>
                  <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full">
                    Extended!
                  </span>
                </div>
                <h3 className="text-2xl md:text-3xl font-display font-bold text-white">
                  OECS Super Regional Robotics Competition 2026
                </h3>
                <p className="text-ktip-ocean-300 font-medium mt-1">
                  The Premier Robotics Championship of the Eastern Caribbean
                </p>
              </div>
              <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-4 py-3 border border-gray-700">
                <span className="text-3xl font-display font-bold text-white">10</span>
                <span className="text-sm text-gray-400">teams<br/>registered</span>
              </div>
            </div>

            <div className="bg-gray-900/50 rounded-2xl border border-gray-700 p-6 mb-8">
              <p className="text-gray-300 leading-relaxed mb-4">
                The OECS Super Regional Robotics Competition is the ultimate robotics and STEAM championship of the Eastern Caribbean, uniting national teams from across the OECS and the Caribbean to compete, collaborate, and innovate through advanced technology challenges.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                This prestigious event provides a dynamic platform for young innovators to showcase their technical expertise in robotics design, programming, and engineering, while tackling real-world challenges through creativity, critical thinking, and teamwork.
              </p>
              <p className="text-gray-400 leading-relaxed mb-5">
                Beyond the competition, participants will experience the true spirit of regional unity through:
              </p>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-lg mb-1">🤝</p>
                  <p className="text-sm font-semibold text-white">Cross-Island Collaboration</p>
                  <p className="text-xs text-gray-400 mt-1">Building bridges across OECS member states</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-lg mb-1">🌍</p>
                  <p className="text-sm font-semibold text-white">Cultural Exchange</p>
                  <p className="text-xs text-gray-400 mt-1">Celebrating the diversity and shared identity of the Caribbean</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-lg mb-1">💡</p>
                  <p className="text-sm font-semibold text-white">21st-Century Skills</p>
                  <p className="text-xs text-gray-400 mt-1">Preparing youth for success in the digital economy</p>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Participants will engage in hands-on robotics challenges, technical showcases, and networking sessions with educators, mentors, and industry leaders. Join us as we celebrate innovation, teamwork, and the spirit of Caribbean excellence in technology and education — empowering the next generation of inventors and leaders!
              </p>
            </div>

            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-5 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} className="text-ktip-tropical-400" />
                  <span className="text-white font-medium">March 16 – 20, 2026</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-ktip-tropical-400" />
                  <span className="text-white font-medium">Saint Kitts and Nevis</span>
                </span>
                <span className="text-gray-500">10 teams registered / 10 max</span>
              </div>

              <div className="flex items-center gap-5">
                {[
                  { label: 'Days', value: countdown.days },
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Minutes', value: countdown.minutes },
                  { label: 'Seconds', value: countdown.seconds },
                ].map((unit) => (
                  <div key={unit.label} className="text-center">
                    <div className="w-20 h-20 bg-gray-900 rounded-xl border border-gray-700 flex items-center justify-center">
                      <span className="text-3xl font-display font-bold text-white">
                        {String(unit.value).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 uppercase tracking-wider font-medium">
                      {unit.label}
                    </p>
                  </div>
                ))}
              </div>

              <a
                href="https://www.steamtournament.com/public-registration?tournament=126b27b2-cf70-443b-b54e-1233b10aaa9d"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="md" className="bg-ktip-tropical-600 text-white hover:bg-ktip-tropical-700">
                  View Event
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* === Section 7: Progress to Impact + Bottom CTA === */}
      <div className="bg-ktip-ocean-700 py-10 md:py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-6">
            <h2 className="text-xl md:text-2xl font-display font-bold text-white">
              Progress Toward Regional Impact
            </h2>
          </div>

          {/* Inline stats row */}
          <div className="flex items-center justify-center gap-6 md:gap-12 mb-8">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-display font-bold text-white">1,500+</p>
              <p className="text-xs md:text-sm text-white/70">Contributors</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-display font-bold text-white">200+</p>
              <p className="text-xs md:text-sm text-white/70">Projects</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-display font-bold text-white">$2M+</p>
              <p className="text-xs md:text-sm text-white/70">Grants</p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/80 text-sm mb-4">
              Ready to make an impact? Join Caribbean innovators building the future.
            </p>
            <Link to="/projects/new">
              <Button size="lg" className="bg-white text-ktip-ocean-700 hover:bg-white/90 shadow-medium">
                Start Your Project
              </Button>
            </Link>
          </div>
        </div>
      </div>
      {/* Pre-Registration Modal */}
      <PreRegistrationModal open={preregOpen} onClose={handlePreregClose} />
    </>
  )
}
