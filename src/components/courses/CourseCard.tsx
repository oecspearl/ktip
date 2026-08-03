import { ExternalLink, GraduationCap } from 'lucide-react'
import { useEnrollInCourse } from '../../hooks/useEnrollInCourse'
import { useToast } from '../../contexts/ToastContext'
import type { ExternalCourse, KtipEnrollment } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface CourseCardProps {
  course: ExternalCourse
  enrollment?: KtipEnrollment | null
  onEnrolled?: () => void
}

export function CourseCard({ course, enrollment, onEnrolled }: CourseCardProps) {
    const { t } = useLingui()
  const { enroll, enrolling } = useEnrollInCourse()
  const toast = useToast()

  const courseUrl = enrollment?.course_url

  const handleEnroll = async () => {
    try {
      const res = await enroll(course.course_id)
      onEnrolled?.()
      toast.success(
        res.is_new_user
          ? t`Enrolled! Check your email to set up your Virtual Campus sign-in.`
          : t`Enrolled! You can access the course now.`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Could not enroll in this course.`)
    }
  }

  return (
    <div className="bg-ktip-cream border border-gray-200 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-12 h-12 rounded-xl object-cover bg-ktip-sand-50 border border-ktip-sand-100 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
            <GraduationCap size={22} className="text-ktip-ocean-600" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-display font-bold text-ktip-sand-900 truncate">{course.title}</h3>
          {course.subject_area && (
            <span className="text-xs text-ktip-ocean-600 font-medium">{course.subject_area}</span>
          )}
        </div>
      </div>

      {course.short_description && (
        <p className="text-sm text-ktip-sand-600 line-clamp-3 flex-1 mb-3">
          {course.short_description}
        </p>
      )}

      {(course.grade_level || course.provider_name) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {course.grade_level && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
              {course.grade_level}
            </span>
          )}
          {course.provider_name && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
              {course.provider_name}
            </span>
          )}
        </div>
      )}

      {courseUrl ? (
        <a
          href={courseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ktip-tropical-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-tropical-700 transition-colors"
        >
          <Trans>Go to course</Trans>
          <ExternalLink size={14} />
        </a>
      ) : course.enrollable === false ? (
        <span className="inline-flex items-center justify-center px-4 py-2 bg-ktip-sand-100 text-ktip-sand-500 text-sm font-bold rounded-lg cursor-not-allowed">
          <Trans>Not open for enrollment</Trans>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleEnroll}
          disabled={enrolling}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {enrolling ? t`Enrolling…` : t`Enroll`}
        </button>
      )}
    </div>
  )
}
