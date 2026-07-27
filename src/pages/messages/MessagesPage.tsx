import { createSignal, createEffect, Show } from 'solid-js'
import { useSearchParams, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { ConversationList } from '../../components/messages/ConversationList'
import { ChatWindow } from '../../components/messages/ChatWindow'
import { NewConversationModal } from '../../components/messages/NewConversationModal'
import { useConversations, useCreateConversation } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import { MessageSquare, ChevronRight, ArrowLeft } from 'lucide-solid'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MessagesPage() {
  usePageTitle(() => 'Messages')
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const { conversations, refetch } = useConversations(() => auth.user()?.id)
  const { createConversation } = useCreateConversation()

  const [activeConversationId, setActiveConversationId] = createSignal<string | null>(null)
  const [showNewModal, setShowNewModal] = createSignal(false)
  const [showChat, setShowChat] = createSignal(false) // mobile toggle
  const [handledUserParam, setHandledUserParam] = createSignal(false)

  // Handle ?user=xxx query param to auto-start conversation (once)
  createEffect(() => {
    const targetUserId = searchParams.user
    if (targetUserId && auth.user() && !handledUserParam()) {
      setHandledUserParam(true)
      createConversation(auth.user()!.id, targetUserId as string)
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
  })

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
    const conv = conversations()?.find((c) => c.id === activeConversationId())
    if (!conv?.participants) return undefined
    const other = conv.participants.find((p) => p.user_id !== auth.user()?.id)
    return other?.user?.display_name || 'Unknown User'
  }

  return (
    <MainLayout>
      {/* Thin Dark Hero Band */}
      <div class="bg-gray-800 py-6">
        <div class="container mx-auto px-4">
          {/* Breadcrumb */}
          <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-3">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} class="text-gray-500" />
            <span class="text-gray-200">Messages</span>
          </nav>
          <h1 class="text-2xl font-display font-bold text-white">Messages</h1>
        </div>
      </div>

      {/* Chat Layout */}
      <div class="h-[calc(100vh-64px-80px-88px)] flex bg-white overflow-hidden border border-gray-200 mx-0 lg:mx-4 lg:mt-4">
        {/* Sidebar - Conversation List */}
        <div
          class={`w-full lg:w-80 lg:border-r border-gray-200 lg:block ${
            showChat() ? 'hidden' : 'block'
          }`}
        >
          <ConversationList
            conversations={conversations()}
            activeConversationId={activeConversationId()}
            onSelect={handleSelectConversation}
            currentUserId={auth.user()?.id || ''}
            onNewConversation={() => setShowNewModal(true)}
          />
        </div>

        {/* Main Chat Area */}
        <div
          class={`flex-1 flex flex-col lg:block ${
            showChat() ? 'block' : 'hidden'
          }`}
        >
          <Show
            when={activeConversationId()}
            fallback={
              <div class="flex items-center justify-center h-full text-ktip-sand-500">
                <div class="text-center">
                  <MessageSquare size={48} class="mx-auto mb-3 opacity-50" />
                  <p class="text-lg font-medium">Select a conversation</p>
                  <p class="text-sm mt-1">Or start a new one!</p>
                </div>
              </div>
            }
          >
            {/* Mobile back button */}
            <div class="lg:hidden p-2 border-b border-gray-200">
              <button
                onClick={handleBack}
                class="flex items-center gap-2 text-ktip-sand-600 hover:text-ktip-sand-900 text-sm"
              >
                <ArrowLeft size={18} />
                Back to conversations
              </button>
            </div>
            <ChatWindow
              conversationId={activeConversationId()!}
              otherUserName={getOtherUserName()}
            />
          </Show>
        </div>
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewModal()}
        onClose={() => setShowNewModal(false)}
        onCreated={handleNewConversation}
      />
    </MainLayout>
  )
}
