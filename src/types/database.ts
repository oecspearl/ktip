// Database types for Supabase
// Matches the schema defined in migrations 001-005

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          bio: string | null
          avatar_url: string | null
          country: string | null
          organization: string | null
          industry: string | null
          roles: string[]
          skills: string[]
          interests: string[]
          open_to: string[]
          is_verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          country?: string | null
          organization?: string | null
          industry?: string | null
          roles?: string[]
          skills?: string[]
          interests?: string[]
          open_to?: string[]
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          country?: string | null
          organization?: string | null
          industry?: string | null
          roles?: string[]
          skills?: string[]
          interests?: string[]
          open_to?: string[]
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          title: string
          description: string | null
          category: string | null
          phase: 'concept' | 'prototype' | 'funding' | 'launch'
          hashtags: string[]
          image_url: string | null
          is_public: boolean
          is_featured: boolean
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          category?: string | null
          phase?: 'concept' | 'prototype' | 'funding' | 'launch'
          hashtags?: string[]
          image_url?: string | null
          is_public?: boolean
          is_featured?: boolean
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          category?: string | null
          phase?: 'concept' | 'prototype' | 'funding' | 'launch'
          hashtags?: string[]
          image_url?: string | null
          is_public?: boolean
          is_featured?: boolean
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_likes: {
        Row: {
          id: string
          project_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          id: string
          project_id: string
          user_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          event_type: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day'
          status: 'draft' | 'published' | 'cancelled' | 'completed'
          location: string | null
          is_virtual: boolean
          start_date: string
          end_date: string | null
          capacity: number | null
          image_url: string | null
          registration_fields: any
          organizer_id: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          event_type: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day'
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          location?: string | null
          is_virtual?: boolean
          start_date: string
          end_date?: string | null
          capacity?: number | null
          image_url?: string | null
          registration_fields?: any
          organizer_id: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          event_type?: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day'
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          location?: string | null
          is_virtual?: boolean
          start_date?: string
          end_date?: string | null
          capacity?: number | null
          image_url?: string | null
          registration_fields?: any
          organizer_id?: string
          created_at?: string
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          id: string
          event_id: string
          user_id: string
          status: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in'
          registration_data: any
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          status?: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in'
          registration_data?: any
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          status?: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in'
          registration_data?: any
          created_at?: string
        }
        Relationships: []
      }
      event_updates: {
        Row: {
          id: string
          event_id: string
          author_id: string
          title: string
          content: string
          update_type: 'announcement' | 'schedule_change' | 'reminder'
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          author_id: string
          title: string
          content: string
          update_type?: 'announcement' | 'schedule_change' | 'reminder'
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          author_id?: string
          title?: string
          content?: string
          update_type?: 'announcement' | 'schedule_change' | 'reminder'
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_articles: {
        Row: {
          id: string
          event_id: string
          author_id: string
          title: string
          content: string
          article_type: 'recap' | 'resources' | 'summary' | 'blog'
          is_published: boolean
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          author_id: string
          title: string
          content: string
          article_type?: 'recap' | 'resources' | 'summary' | 'blog'
          is_published?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          author_id?: string
          title?: string
          content?: string
          article_type?: 'recap' | 'resources' | 'summary' | 'blog'
          is_published?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_page_sections: {
        Row: {
          id: string
          event_id: string
          section_type: 'about' | 'faq' | 'venue' | 'sponsors' | 'custom'
          title: string
          content: any
          sort_order: number
          is_visible: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          section_type: 'about' | 'faq' | 'venue' | 'sponsors' | 'custom'
          title: string
          content?: any
          sort_order?: number
          is_visible?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          section_type?: 'about' | 'faq' | 'venue' | 'sponsors' | 'custom'
          title?: string
          content?: any
          sort_order?: number
          is_visible?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_speakers: {
        Row: {
          id: string
          event_id: string
          name: string
          title: string | null
          bio: string | null
          photo_url: string | null
          website: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          title?: string | null
          bio?: string | null
          photo_url?: string | null
          website?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          title?: string | null
          bio?: string | null
          photo_url?: string | null
          website?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      event_schedule: {
        Row: {
          id: string
          event_id: string
          title: string
          description: string | null
          start_time: string
          end_time: string | null
          location: string | null
          speaker_id: string | null
          schedule_type: 'session' | 'break' | 'keynote' | 'workshop' | 'networking' | 'other'
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          title: string
          description?: string | null
          start_time: string
          end_time?: string | null
          location?: string | null
          speaker_id?: string | null
          schedule_type?: 'session' | 'break' | 'keynote' | 'workshop' | 'networking' | 'other'
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          title?: string
          description?: string | null
          start_time?: string
          end_time?: string | null
          location?: string | null
          speaker_id?: string | null
          schedule_type?: 'session' | 'break' | 'keynote' | 'workshop' | 'networking' | 'other'
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      grants: {
        Row: {
          id: string
          title: string
          description: string | null
          amount_min: number | null
          amount_max: number | null
          currency: string
          deadline: string | null
          eligibility: string | null
          application_url: string | null
          grant_type: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          amount_min?: number | null
          amount_max?: number | null
          currency?: string
          deadline?: string | null
          eligibility?: string | null
          application_url?: string | null
          grant_type?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          amount_min?: number | null
          amount_max?: number | null
          currency?: string
          deadline?: string | null
          eligibility?: string | null
          application_url?: string | null
          grant_type?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      grant_applications: {
        Row: {
          id: string
          grant_id: string
          user_id: string
          application_data: Record<string, any>
          status: 'pending' | 'under_review' | 'approved' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          grant_id: string
          user_id: string
          application_data?: Record<string, any>
          status?: 'pending' | 'under_review' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          grant_id?: string
          user_id?: string
          application_data?: Record<string, any>
          status?: 'pending' | 'under_review' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          joined_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          joined_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      forum_boards: {
        Row: {
          id: string
          name: string
          description: string | null
          slug: string
          icon: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          slug: string
          icon?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          slug?: string
          icon?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          id: string
          board_id: string
          author_id: string
          title: string
          content: string
          is_pinned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          board_id: string
          author_id: string
          title: string
          content: string
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          board_id?: string
          author_id?: string
          title?: string
          content?: string
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          id: string
          user_id: string
          type: 'funding' | 'project' | 'research' | 'business'
          title: string
          status: 'draft' | 'completed'
          proposal_data: Record<string, any>
          current_step: number
          share_token: string | null
          project_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'funding' | 'project' | 'research' | 'business'
          title: string
          status?: 'draft' | 'completed'
          proposal_data?: Record<string, any>
          current_step?: number
          share_token?: string | null
          project_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'funding' | 'project' | 'research' | 'business'
          title?: string
          status?: 'draft' | 'completed'
          proposal_data?: Record<string, any>
          current_step?: number
          share_token?: string | null
          project_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          id: string
          post_id: string
          author_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          author_id?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      uat_responses: {
        Row: {
          id: string
          q1_usefulness: 'very_useful' | 'somewhat' | 'not_very' | 'not_at_all'
          q2_valuable_features: string[]
          q3_connect_innovators: 'yes' | 'somewhat' | 'no'
          q4_discover_opportunities: 'yes' | 'somewhat' | 'no'
          q5_recommend_rating: number
          q6_ease_of_navigation: 'very_easy' | 'easy' | 'neutral' | 'difficult' | 'very_difficult'
          q7_professional: 'yes' | 'somewhat' | 'no'
          q8_overall_experience: 'excellent' | 'good' | 'average' | 'poor' | 'very_poor'
          q9_issues: boolean
          q9_issues_detail: string | null
          q10_performance: 'fast' | 'acceptable' | 'slow'
          q11_improvements: string | null
          q12_comments: string | null
          created_at: string
        }
        Insert: {
          id?: string
          q1_usefulness: string
          q2_valuable_features: string[]
          q3_connect_innovators: string
          q4_discover_opportunities: string
          q5_recommend_rating: number
          q6_ease_of_navigation: string
          q7_professional: string
          q8_overall_experience: string
          q9_issues: boolean
          q9_issues_detail?: string | null
          q10_performance: string
          q11_improvements?: string | null
          q12_comments?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          q1_usefulness?: string
          q2_valuable_features?: string[]
          q3_connect_innovators?: string
          q4_discover_opportunities?: string
          q5_recommend_rating?: number
          q6_ease_of_navigation?: string
          q7_professional?: string
          q8_overall_experience?: string
          q9_issues?: boolean
          q9_issues_detail?: string | null
          q10_performance?: string
          q11_improvements?: string | null
          q12_comments?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      find_conversation_between: {
        Args: { user1: string; user2: string }
        Returns: string | null
      }
      get_project_like_count: {
        Args: { project_uuid: string }
        Returns: number
      }
      get_project_comment_count: {
        Args: { project_uuid: string }
        Returns: number
      }
      has_user_liked_project: {
        Args: { project_uuid: string; user_uuid: string }
        Returns: boolean
      }
      get_event_rsvp_count: {
        Args: { event_uuid: string }
        Returns: number
      }
      has_user_rsvpd: {
        Args: { event_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_event_full: {
        Args: { event_uuid: string }
        Returns: boolean
      }
      get_grant_application_count: {
        Args: { grant_uuid: string }
        Returns: number
      }
      has_user_applied: {
        Args: { grant_uuid: string; user_uuid: string }
        Returns: boolean
      }
      get_board_post_count: {
        Args: { board_uuid: string }
        Returns: number
      }
      get_post_reply_count: {
        Args: { post_uuid: string }
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
