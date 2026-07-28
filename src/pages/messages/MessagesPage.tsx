import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { ConversationList } from '../../components/messages/ConversationList'
import { ChatWindow } from '../../components/messages/ChatWindow'
import { NewConversationModal } from '../../components/messages/NewConversationModal'
import { useConversations, useCreateConversation } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import { MessageSquare, ArrowLeft } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MessagesPage() {
  usePageTitle('Messages')
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const { conversations, refetch } = useConversations(auth.user?.id)
  const { createConversation } = useCreateConversation()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showChat, setShowChat] = useState(false) // mobile toggle
  const [handledUserParam, setHandledUserParam] = useState(false)

  // Handle ?user=xxx query param to auto-start conversation (once)
  useEffect(() => {
    const targetUserId = searchParams.get('user')
    if (targetUserId && auth.user && !handledUserParam) {
      setHandledUserParam(true)
      createConversation(auth.user.id, targetUserId)
        .then((convId) => {
          setActiveConversationId(convId)
          setShowChat(true)
          refetch()
        })
        .catch((err) => {
          console.error('Failed to create conversation:', err)
          setHandledUserParam(false)
        })
    }
  }, [searchParams, auth.user, handledUserParam, createConversation, refetch])

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id)
    setShowChat(true)
  }

  const handleNewConversation = (conversationId: string) => {
    setShowNewModal(false)
    setActiveConversationId(conversationId)
    setShowChat(true)
    refetch()
  }

  const handleBack = () => {
    setShowChat(false)
  }

  const activeConversation = conversations?.find((c) => c.id === activeConversationId)

  const getOtherUserName = () => {
    const conv = activeConversation
    if (!conv?.participants) return undefined
    if (conv.is_group) return conv.name || 'Group'
    const other = conv.participants.find((p) => p.user_id !== auth.user?.id)
    return other?.user?.display_name || 'Unknown User'
  }

  const handleLeftGroup = () => {
    setActiveConversationId(null)
    setShowChat(false)
    refetch()
  }

  return (
    <>
      <PageHero
        eyebrow="Communication"
        title="Messages"
        imageSeed="messages"
        compact
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Messages' }]}
      />

      {/* Chat Layout */}
      <div className="h-[calc(100vh-64px-80px-88px)] flex bg-ktip-cream overflow-hidden border border-gray-200 mx-0 lg:mx-4 lg:mt-4">
        {/* Sidebar - Conversation List */}
        <div
          className={`w-full lg:w-80 lg:border-r border-gray-200 lg:block ${
            showChat ? 'hidden' : 'block'
          }`}
        >
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            currentUserId={auth.user?.id || ''}
            onNewConversation={() => setShowNewModal(true)}
          />
        </div>

        {/* Main Chat Area */}
        <div
          className={`flex-1 flex flex-col lg:block ${
            showChat ? 'block' : 'hidden'
          }`}
        >
          {activeConversationId ? (
            <>
              {/* Mobile back button */}
              <div className="lg:hidden p-2 border-b border-gray-200">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-ktip-sand-600 hover:text-ktip-sand-900 text-sm"
                >
                  <ArrowLeft size={18} />
                  Back to conversations
                </button>
              </div>
              <ChatWindow
                conversationId={activeConversationId}
                otherUserName={getOtherUserName()}
                conversation={activeConversation}
                onLeftGroup={handleLeftGroup}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-ktip-sand-500">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Or start a new one!</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleNewConversation}
      />
    </>
  )
}
