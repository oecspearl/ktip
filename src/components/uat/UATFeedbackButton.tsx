import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { UATFeedbackForm } from './UATFeedbackForm'
import { UATReminderPopup } from './UATReminderPopup'

export function UATFeedbackButton() {
  const [formOpen, setFormOpen] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [showReminder, setShowReminder] = useState(false)

  // Keep latest values available inside timers without re-scheduling them
  const hasSubmittedRef = useRef(hasSubmitted)
  const formOpenRef = useRef(formOpen)
  const showReminderRef = useRef(showReminder)
  useEffect(() => {
    hasSubmittedRef.current = hasSubmitted
  }, [hasSubmitted])
  useEffect(() => {
    formOpenRef.current = formOpen
  }, [formOpen])
  useEffect(() => {
    showReminderRef.current = showReminder
  }, [showReminder])

  useEffect(() => {
    const submitted = localStorage.getItem('ktip_uat_submitted')
    if (submitted === 'true') {
      setHasSubmitted(true)
    }
  }, [])

  // Schedule periodic reminders (every 5 minutes if not submitted)
  useEffect(() => {
    const scheduleReminder = () => {
      if (hasSubmittedRef.current) return

      const dismissed = localStorage.getItem('ktip_uat_reminder_dismissed')
      if (dismissed) {
        const dismissedAt = new Date(dismissed).getTime()
        const fiveMinutes = 5 * 60 * 1000
        if (Date.now() - dismissedAt < fiveMinutes) return
      }

      // Show first reminder after 2 minutes, then every 5 minutes
      const firstDelay = dismissed ? 5 * 60 * 1000 : 2 * 60 * 1000

      setTimeout(() => {
        if (!hasSubmittedRef.current && !formOpenRef.current) {
          setShowReminder(true)
        }
      }, firstDelay)
    }

    scheduleReminder()

    // Re-check every minute
    const interval = setInterval(() => {
      if (!hasSubmittedRef.current && !formOpenRef.current && !showReminderRef.current) {
        const dismissed = localStorage.getItem('ktip_uat_reminder_dismissed')
        if (dismissed) {
          const dismissedAt = new Date(dismissed).getTime()
          if (Date.now() - dismissedAt >= 5 * 60 * 1000) {
            setShowReminder(true)
          }
        }
      }
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const handleDismissReminder = () => {
    setShowReminder(false)
    localStorage.setItem('ktip_uat_reminder_dismissed', new Date().toISOString())
  }

  const handleOpenFromReminder = () => {
    setShowReminder(false)
    setFormOpen(true)
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    const submitted = localStorage.getItem('ktip_uat_submitted')
    if (submitted === 'true') {
      setHasSubmitted(true)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!hasSubmitted && (
        <button
          onClick={() => setFormOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
          aria-label="Provide UAT Feedback"
        >
          <MessageSquarePlus size={20} className="group-hover:scale-110 transition-transform" />
          <span className="text-sm font-semibold hidden sm:inline">Give Feedback</span>
          {/* Pulse indicator */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ktip-tropical-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-ktip-tropical-500" />
          </span>
        </button>
      )}

      {/* Already submitted - small subtle button */}
      {hasSubmitted && (
        <button
          onClick={() => setFormOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-white border border-ktip-sand-200 text-ktip-sand-600 rounded-full shadow-soft hover:shadow-medium hover:border-ktip-ocean-300 transition-all duration-300"
          aria-label="Submit additional feedback"
        >
          <MessageSquarePlus size={18} />
          <span className="text-xs font-medium hidden sm:inline">More Feedback</span>
        </button>
      )}

      {/* Feedback form modal */}
      <UATFeedbackForm open={formOpen} onClose={handleCloseForm} />

      {/* Reminder popup */}
      <UATReminderPopup
        open={showReminder}
        onDismiss={handleDismissReminder}
        onOpen={handleOpenFromReminder}
      />
    </>
  )
}
