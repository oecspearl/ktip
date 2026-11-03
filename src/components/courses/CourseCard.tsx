import { Link } from 'react-router'
import { ArrowRight, CheckCircle, GraduationCap } from 'lucide-react'
import type { ExternalCourse, KtipEnrollment } from '../../types'
import { coursePath } from '../../hooks/useExternalCourses'
import { Trans } from '@lingui/react/macro'

interface CourseCardProps {
  course: ExternalCourse
  enrollment?: KtipEnrollment | null
}

/**
 * One Virtual Campus course in the Resources grid. The whole card opens the
 * course's page on KTIP; enrolling and the one link out to the campus live
 * there, so a visitor without an account meets the sign-up step first.
 */
export function CourseCard({ course, enrollment }: CourseCardProps) {
  return (
    <Link
      to={coursePath(course.course_id)}
      className="group bg-ktip-cream border border-gray-200 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-ktip-ocean-500"
    >
      <div className="flex items-center gap-3 mb-3">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt=""
            className="w-12 h-12 rounded-xl object-cover bg-ktip-sand-50 border border-ktip-sand-100 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
            <GraduationCap size={22} className="text-ktip-ocean-600" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-display font-bold text-ktip-sand-900 truncate group-hover:text-ktip-ocean-700">
            {course.title}
          </h3>
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

      <div className="mt-auto flex items-center justify-between gap-2 text-sm font-bold">
        {enrollment ? (
          <span className="inline-flex items-center gap-1.5 text-ktip-tropical-700">
            <CheckCircle size={14} />
            <Trans>Enrolled</Trans>
          </span>
        ) : course.enrollable === false ? (
          <span className="text-ktip-sand-500">
            <Trans>Not open for enrollment</Trans>
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 text-ktip-ocean-600 group-hover:text-ktip-ocean-700">
          <Trans>View course</Trans>
          <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  )
}
