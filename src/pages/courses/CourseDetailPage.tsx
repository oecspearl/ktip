import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { CheckCircle, ExternalLink, GraduationCap } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { useExternalCourse } from '../../hooks/useExternalCourses'
import { useMyKtipEnrollments } from '../../hooks/useMyKtipEnrollments'
import { useEnrollInCourse } from '../../hooks/useEnrollInCourse'
import { usePageTitle } from '../../hooks/usePageTitle'
import { truncate } from '../../lib/utils'

const COURSES_HREF = '/resources?tab=courses'

/**
 * A Virtual Campus course, on KTIP.
 *
 * The catalog has no single-course endpoint, so this reads the same cached
 * list the Courses tab does and shows whatever fields the campus filled in.
 * Enrolling happens here. The one link out to the campus is "Continue course",
 * shown once the member is enrolled, because the course itself is taught there.
 */
export default function CourseDetailPage() {
  const { t } = useLingui()
  const params = useParams()
  const toast = useToast()

  const { course, loading, error, refetch } = useExternalCourse(params.id)
  const { enrollmentsByCourseId, loading: enrollmentsLoading } = useMyKtipEnrollments()
  const { enroll, enrolling } = useEnrollInCourse()
  // The enrolment list refetches after enrolling, but the response already
  // carries the course link, so the button can switch over at once.
  const [enrolledUrl, setEnrolledUrl] = useState<string | null>(null)

  usePageTitle(course?.title ? t`${course.title} | Courses` : t`Course`)

  if (loading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-8">
        <div className="max-w-page-mid mx-auto">
          <div className="bg-hero-base min-h-[180px] rounded-none animate-pulse" />
          <div className="p-8 animate-pulse">
            <div className="h-4 w-24 bg-ktip-sand-100 rounded mb-4" />
            <div className="h-8 w-3/4 bg-ktip-sand-100 rounded mb-4" />
            <div className="h-4 w-full bg-ktip-sand-100 rounded mb-2" />
            <div className="h-4 w-2/3 bg-ktip-sand-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error && !course) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <GraduationCap size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          <Trans>Course catalog is temporarily unavailable</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>Please try again shortly.</Trans>
        </p>
        <Button onClick={() => void refetch()}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <GraduationCap size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Course not found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This course is not in the catalog right now.</Trans>
        </p>
        <Link
          to={COURSES_HREF}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
        >
          <Trans>Back to Courses</Trans>
        </Link>
      </div>
    )
  }

  const enrollment = enrollmentsByCourseId.get(course.course_id)
  const courseUrl = enrollment?.course_url || enrolledUrl
  const progress = enrollment?.progress_percentage

  const handleEnroll = async () => {
    try {
      const res = await enroll(course.course_id)
      if (res.course_url) setEnrolledUrl(res.course_url)
      toast.success(
        res.is_new_user
          ? t`Enrolled! Check your email to set up your Virtual Campus sign-in.`
          : t`Enrolled! You can access the course now.`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Could not enroll in this course.`)
    }
  }

  const facts: { label: string; value: string }[] = [
    course.provider_name ? { label: t`Provider`, value: course.provider_name } : null,
    course.subject_area ? { label: t`Subject`, value: course.subject_area } : null,
    course.difficulty ? { label: t`Level`, value: course.difficulty } : null,
    course.grade_level ? { label: t`Grade level`, value: course.grade_level } : null,
    course.language ? { label: t`Language`, value: course.language } : null,
  ].filter((f): f is { label: string; value: string } => f !== null)

  return (
    <>
      <PageHero
        eyebrow={t`Course`}
        title={course.title}
        imageSeed={course.course_id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Courses`, href: COURSES_HREF },
          { label: truncate(course.title, 30) },
        ]}
      >
        {(course.subject_area || course.difficulty) && (
          <div className="flex flex-wrap items-center gap-2">
            {course.subject_area && (
              <Badge className="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
                {course.subject_area}
              </Badge>
            )}
            {course.difficulty && (
              <Badge className="bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200">
                {course.difficulty}
              </Badge>
            )}
          </div>
        )}
      </PageHero>

      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">
          {/* === Main Column === */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-4 mb-6">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt=""
                  className="w-20 h-20 rounded-xl object-cover bg-ktip-sand-50 border border-ktip-sand-100 shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-20 h-20 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
                  <GraduationCap size={36} className="text-ktip-ocean-600" />
                </div>
              )}
              <h2 className="text-xl font-bold text-ktip-sand-900">{course.title}</h2>
            </div>

            {course.short_description ? (
              <p className="text-lg text-ktip-sand-800 leading-relaxed whitespace-pre-wrap mb-6">
                {course.short_description}
              </p>
            ) : (
              <p className="text-gray-500 mb-6">
                <Trans>The Virtual Campus has not published a description for this course yet.</Trans>
              </p>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Take this course</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">
                <Trans>Taught on the OECS Virtual Campus</Trans>
              </p>

              {enrollmentsLoading && !courseUrl ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto" />
                </div>
              ) : courseUrl ? (
                <div className="space-y-3">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ktip-tropical-700">
                    <CheckCircle size={16} />
                    {typeof progress === 'number' ? (
                      <Trans>Enrolled · {Math.round(progress)}% complete</Trans>
                    ) : (
                      <Trans>Enrolled</Trans>
                    )}
                  </p>
                  {/* The only way out to the campus, on purpose: the course is
                      taught there, so this one link cannot stay on KTIP. */}
                  <a
                    href={courseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Trans>Continue course</Trans>
                    <ExternalLink size={16} />
                  </a>
                  <p className="text-xs text-ktip-sand-500">
                    <Trans>Opens the Virtual Campus in a new tab.</Trans>
                  </p>
                </div>
              ) : course.enrollable === false ? (
                <p className="text-sm text-ktip-sand-600">
                  <Trans>Not open for enrollment</Trans>
                </p>
              ) : (
                <Button fullWidth loading={enrolling} onClick={() => void handleEnroll()}>
                  {enrolling ? t`Enrolling…` : t`Enroll`}
                </Button>
              )}
            </div>

            {facts.length > 0 && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-4">
                  <Trans>Details</Trans>
                </h3>
                <dl className="text-sm divide-y divide-ktip-sand-100">
                  {facts.map((fact) => (
                    <div key={fact.label} className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-500">{fact.label}</dt>
                      <dd className="text-ktip-sand-900 text-right">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="mb-10">
              <Link
                to={COURSES_HREF}
                className="w-full px-4 py-2.5 border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-800 hover:border-ktip-ocean-300 text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <GraduationCap size={16} />
                <Trans>Browse all courses</Trans>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
