import type { ReactNode } from 'react'
import { Mail, MessageCircle, MoreHorizontal } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Facebook, Instagram, Linkedin } from '../ui/BrandIcons'
import { useIsMobile } from '../../hooks/useMediaQuery'
import type { DraftPlatform } from '../../lib/share/draft-prompt'
import type { SharePlatform } from '../../lib/share/platforms'

export type ShareAppId = Extract<SharePlatform, 'whatsapp' | 'linkedin' | 'facebook' | 'x' | 'instagram' | 'email' | 'native'>

export interface ShareApp {
  id: ShareAppId
  name: string
  /** The style rules the AI writes to; email and the phone's menu share one. */
  draft: DraftPlatform
  icon: ReactNode
  /** Background for the app's round icon and its Share button. */
  tone: string
  /** One line under the preview: what happens when the member presses Share. */
  how: string
}

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/**
 * The apps a member can pick in step one, in the order shown. Phones that have
 * their own share menu get "More apps" in place of Email, which that menu
 * already covers.
 */
export function useShareApps(): ShareApp[] {
  const { t } = useLingui()
  const isMobile = useIsMobile()
  const copies = (app: string) => t`${app} only takes the link, so we copy this text for you to paste above it.`
  return [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      draft: 'whatsapp',
      icon: <MessageCircle className="size-5" aria-hidden="true" />,
      tone: 'bg-[#25D366] text-white',
      how: t`Opens WhatsApp with this message and the link.`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      draft: 'linkedin',
      icon: <Linkedin className="size-5" aria-hidden="true" />,
      tone: 'bg-[#0A66C2] text-white',
      how: copies('LinkedIn'),
    },
    {
      id: 'facebook',
      name: 'Facebook',
      draft: 'facebook',
      icon: <Facebook className="size-5" aria-hidden="true" />,
      tone: 'bg-[#1877F2] text-white',
      how: copies('Facebook'),
    },
    {
      id: 'x',
      name: 'X',
      draft: 'x',
      icon: <span className="text-base font-black leading-none" aria-hidden="true">X</span>,
      tone: 'bg-[#0F1419] text-white',
      how: t`Opens X with this message and the link. X allows 280 characters and counts the link as 23.`,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      draft: 'instagram',
      icon: <Instagram className="size-5" aria-hidden="true" />,
      tone: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
      how: t`Instagram doesn't take links from the web. We copy the caption and link; add the link to your story as a sticker.`,
    },
    isMobile && canNativeShare()
      ? {
          id: 'native',
          name: t`More apps`,
          draft: 'other',
          icon: <MoreHorizontal className="size-5" aria-hidden="true" />,
          tone: 'bg-ktip-sand-700 text-white',
          how: t`Opens your phone's share menu with this message and the link.`,
        }
      : {
          id: 'email',
          name: t`Email`,
          draft: 'other',
          icon: <Mail className="size-5" aria-hidden="true" />,
          tone: 'bg-ktip-sand-700 text-white',
          how: t`Opens your email app with this message and the link.`,
        },
  ]
}
