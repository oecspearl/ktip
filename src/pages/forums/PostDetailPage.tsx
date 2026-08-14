import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { useContentModeration } from '../../hooks/useContentModeration'
import { ReplyItem } from '../../components/forums/ReplyItem'
import {
  useForumPost,
  useForumReplies,
  useCreateForumReply,
  useDeleteForumPost,
  useDeleteForumReply,
} from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { forumReplySchema } from '../../lib/validation'
import { truncate } from '../../lib/utils'
import { PageHero } from '../../components/layout/PageHero'
import { ReportButton } from '../../components/moderation/ReportButton'
import {
  Trash2,
  Pin,
  Send,
  MessageCircle,
  FileText,
} from 'lucide-react'
import { formatDate, formatRelativeTime } from '../../lib/utils'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'

export default function PostDetailPage() {
  const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const { openMember } = useMemberPanel()

  const { post, loading: postLoading } = useForumPost(params.postId)
  useCanonicalSlug(params.postId, post)
  const { replies, refetch: refetchReplies } = useForumReplies(params.postId)
  const { createReply, loading: replyLoading } = useCreateForumReply()
  const { deletePost } = useDeleteForumPost()
  const { deleteReply } = useDeleteForumReply()

  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState('')

  const moderation = useContentModeration(
    [{ name: 'content', value: replyContent, label: t`Reply`, ai: true }],
    { surface: 'forum_reply', onChange: (_field, next) => setReplyContent(next) }
  )

  const isAuthor = post?.author_id === auth.user?.id
  const authorName = post?.author?.display_name || t`Unknown User`

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault()
    setReplyError('')

    const result = forumReplySchema.safeParse({ content: replyContent })
    if (!result.success) {
      setReplyError(result.error.issues[0]?.message || t`Invalid reply`)
      return
    }

    const gate = await moderation.checkBeforeSubmit()
    if (!gate.ok) {
      setReplyError(gate.errors.content ?? '')
      return
    }

    if (!auth.user || !post) return

    try {
      await createReply({
        post_id: post.id,
        author_id: auth.user.id,
        content: replyContent,
      })
      setReplyContent('')
      refetchReplies()
    } catch (err: any) {
      setReplyError(err.message || t`Failed to post reply`)
    }
  }

  const handleDeletePost = async () => {
    if (!post) return
    if (!confirm(t`Are you sure you want to delete this post?`)) return

    try {
      await deletePost(post.id)
      navigate(`/forums/${params.slug}`)
    } catch (err: any) {
      console.error('Failed to delete post:', err)
    }
  }

  const handleDeleteReply = async (replyId: string) => {
    try {
      await deleteReply(replyId)
      refetchReplies()
    } catch (err: any) {
      console.error('Failed to delete reply:', err)
    }
  }

  if (postLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
        <p className="mt-4 text-ktip-sand-600"><Trans>Loading post...</Trans></p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Post Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6"><Trans>This post doesn't exist or was deleted.</Trans></p>
        <button
          onClick={() => navigate('/forums')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          <Trans>Back to Forums</Trans>
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Forum Post`}
        title={post.title}
        imageSeed={post.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Forums`, href: '/forums' },
          ...(post.board ? [{ label: post.board.name, href: `/forums/${params.slug}` }] : []),
          { label: truncate(post.title, 30) },
        ]}
        actions={
          isAuthor ? (
            <button
              onClick={handleDeletePost}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-400 text-red-300 text-sm font-medium rounded-lg hover:bg-red-500/20 transition-colors"
              title={t`Delete post`}
            >
              <Trash2 size={14} />
              <Trans>Delete</Trans>
            </button>
          ) : (
            <ReportButton
              targetType="forum_post"
              targetId={post.id}
              targetAuthorId={post.author_id}
              contentSnapshot={post.content}
              targetLabel={t`this post`}
              className="text-white/70 hover:text-red-300"
            />
          )
        }
      >
        {post.is_pinned && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" size="sm">
              <Pin size={12} className="mr-1" />
              <Trans>Pinned</Trans>
            </Badge>
          </div>
        )}
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Author info */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-ktip-sand-200">
              <DiamondAvatar src={post.author?.avatar_url} name={authorName} size={40} />
              <div>
                <button
                  type="button"
                  onClick={() => openMember(post.author_id)}
                  className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                >
                  {authorName}
                </button>
                <p className="text-xs text-gray-400">
                  {formatRelativeTime(post.created_at)}
                </p>
              </div>
            </div>

            {/* Content */}
            <div
              id="post"
              data-spy="Post"
              className="scroll-mt-24 text-gray-700 whitespace-pre-wrap leading-relaxed text-base mb-8"
            >
              {post.content}
            </div>

            {/* Replies Section */}
            <div id="replies" data-spy="Replies" className="scroll-mt-24 border-t border-ktip-sand-200 pt-8">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                {t`Replies (${replies?.length || 0})`}
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-6"><Trans>Join the discussion</Trans></p>

              {replies?.length ? (
                <div className="mb-6">
                  {replies.map((reply) => (
                    <ReplyItem
                      key={reply.id}
                      reply={reply}
                      isAuthor={reply.author_id === auth.user?.id}
                      onDelete={() => handleDeleteReply(reply.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <MessageCircle size={36} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm"><Trans>No replies yet. Be the first to reply!</Trans></p>
                </div>
              )}

              {/* Reply Form */}
              <form onSubmit={handleSubmitReply} className="mt-4 pt-4 border-t border-ktip-sand-200">
                <ModeratedTextarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={t`Write a reply...`}
                  rows={4}
                  moderation={moderation.fields.content}
                  fullWidth
                />
                <ContentWarningModal
                  state={moderation.warning}
                  onClose={moderation.dismissWarning}
                />
                {replyError && (
                  <p className="text-sm text-red-600 mt-1">{replyError}</p>
                )}
                <div className="flex justify-end mt-3">
                  <Button
                    type="submit"
                    size="sm"
                    loading={replyLoading || moderation.checking}
                    disabled={!replyContent.trim() || moderation.blocked}
                    icon={<Send size={16} />}
                  >
                    <Trans>Post Reply</Trans>
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Board Info */}
            {post.board && (
              <div className="mb-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  {post.board.name}
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">
                  {post.board.description}
                </p>
                <Link to={`/forums/${params.slug}`}>
                  <button className="w-full px-4 py-2.5 btn-brand text-sm font-bold rounded-lg flex items-center justify-center gap-1.5">
                    <Trans>View All Posts</Trans>
                  </button>
                </Link>
              </div>
            )}

            {/* Widget 2: Post Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Post Details</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Key information</Trans></p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Posted</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(post.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Replies</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {replies?.length || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
