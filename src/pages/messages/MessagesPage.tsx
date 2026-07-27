import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router'
import { ConversationList } from '../../components/messages/ConversationList'
import { ChatWindow } from '../../components/messages/ChatWindow'
import { NewConversationModal } from '../../components/messages/NewConversationModal'
import { useConversations, useCreateConversation } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import { MessageSquare, ChevronRight, ArrowLeft } from 'lucide-react'
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

  const getOtherUserName = () => {
    const conv = conversations?.find((c) => c.id === activeConversationId)
    if (!conv?.participants) return undefined
    const other = conv.participants.find((p) => p.user_id !== auth.user?.id)
    return other?.user?.display_name || 'Unknown User'
  }

  return (
    <>
      {/* Thin Dark Hero Band */}
      <div className="bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-3">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">Messages</span>
          </nav>
          <h1 className="text-2xl font-display font-bold text-white">Messages</h1>
        </div>
      </div>

      {/* Chat Layout */}
      <div className="h-[calc(100vh-64px-80px-88px)] flex bg-white overflow-hidden border border-gray-200 mx-0 lg:mx-4 lg:mt-4">
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
