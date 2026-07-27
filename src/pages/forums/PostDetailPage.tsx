import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { ReplyItem } from '../../components/forums/ReplyItem'
import {
  useForumPost,
  useForumReplies,
  useCreateForumReply,
  useDeleteForumPost,
  useDeleteForumReply,
} from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { forumReplySchema } from '../../lib/validation'
import { truncate } from '../../lib/utils'
import {
  Trash2,
  Pin,
  Send,
  MessageCircle,
  ChevronRight,
} from 'lucide-react'
import {
  formatDate,
  formatRelativeTime,
  getInitials,
  generateAvatarColor,
} from '../../lib/utils'

export default function PostDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { post, loading: postLoading } = useForumPost(params.postId)
  const { replies, refetch: refetchReplies } = useForumReplies(params.postId)
  const { createReply, loading: replyLoading } = useCreateForumReply()
  const { deletePost } = useDeleteForumPost()
  const { deleteReply } = useDeleteForumReply()

  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState('')

  const isAuthor = post?.author_id === auth.user?.id
  const authorName = post?.author?.display_name || 'Unknown User'

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault()
    setReplyError('')

    const result = forumReplySchema.safeParse({ content: replyContent })
    if (!result.success) {
      setReplyError(result.error.issues[0]?.message || 'Invalid reply')
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
      setReplyError(err.message || 'Failed to post reply')
    }
  }

  const handleDeletePost = async () => {
    if (!post) return
    if (!confirm('Are you sure you want to delete this post?')) return

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
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
        <p className="mt-4 text-ktip-sand-600">Loading post...</p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📝</span>
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Post Not Found
        </h2>
        <p className="text-gray-500 mb-6">This post doesn't exist or was deleted.</p>
        <button
          onClick={() => navigate('/forums')}
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
        >
          Back to Forums
        </button>
      </div>
    )
  }

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Forum Post</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {post.is_pinned && (
                  <Badge variant="warning" size="sm">
                    <Pin size={12} className="mr-1" />
                    Pinned
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isAuthor && (
                <button
                  onClick={handleDeletePost}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-400 text-red-300 text-sm font-medium rounded-lg hover:bg-red-500/20 transition-colors"
                  title="Delete post"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <Link to="/forums" className="hover:text-white transition-colors">Forums</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                {post.board && (
                  <>
                    <Link to={`/forums/${params.slug}`} className="hover:text-white transition-colors">
                      {post.board.name}
                    </Link>
                    <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                  </>
                )}
                <span className="text-gray-300">{truncate(post.title, 30)}</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Two-Column Content Area === */}
      <div className="bg-white py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Author info */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(authorName)}`}
              >
                {getInitials(authorName)}
              </div>
              <div>
                <Link
                  to={`/profile/${post.author_id}`}
                  className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                >
                  {authorName}
                </Link>
                <p className="text-xs text-gray-400">
                  {formatRelativeTime(post.created_at)}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-base mb-8">
              {post.content}
            </div>

            {/* Replies Section */}
            <div className="border-t border-gray-200 pt-8">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Replies ({replies?.length || 0})
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-6">Join the discussion</p>

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
                  <p className="text-sm">No replies yet. Be the first to reply!</p>
                </div>
              )}

              {/* Reply Form */}
              <form onSubmit={handleSubmitReply} className="mt-4 pt-4 border-t border-gray-200">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={4}
                  fullWidth
                />
                {replyError && (
                  <p className="text-sm text-red-600 mt-1">{replyError}</p>
                )}
                <div className="flex justify-end mt-3">
                  <Button
                    type="submit"
                    size="sm"
                    loading={replyLoading}
                    disabled={!replyContent.trim()}
                    icon={<Send size={16} />}
                  >
                    Post Reply
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
                  <button className="w-full px-4 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center justify-center gap-1.5">
                    View All Posts
                  </button>
                </Link>
              </div>
            )}

            {/* Widget 2: Post Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Post Details
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Key information</p>
              <div className="text-sm divide-y divide-gray-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Posted</span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(post.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Replies</span>
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
