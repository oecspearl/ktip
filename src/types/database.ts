// Database types for Supabase
// Matches the schema defined in migrations 001-005

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
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
          // 082. Optional because a deploy can precede the migration.
          phone?: string | null
          website?: string | null
          languages?: string[]
          is_verified: boolean
          connection_count_visibility: string
          // 063. Long missing from this hand-written file; src/types/index.ts
          // Profile has always been the accurate one.
          active_role: string | null
          is_suspended: boolean
          suspended_until: string | null
          suspension_reason: string | null
          // 066.
          leaderboard_visibility?: string
          // 091. Derived from account_age — never written through this table.
          is_minor?: boolean
          requires_age_declaration?: boolean
          age_declared_at?: string | null
          // 111. Derived from user_consents — likewise never written here. The
          // guard trigger raises on a direct write to either.
          requires_consent?: boolean
          consent_recorded_at?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
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
          phone?: string | null
          website?: string | null
          languages?: string[]
          is_verified?: boolean
          connection_count_visibility?: string
          active_role?: string | null
          is_suspended?: boolean
          suspended_until?: string | null
          suspension_reason?: string | null
          leaderboard_visibility?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
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
          phone?: string | null
          website?: string | null
          languages?: string[]
          is_verified?: boolean
          connection_count_visibility?: string
          active_role?: string | null
          is_suspended?: boolean
          suspended_until?: string | null
          suspension_reason?: string | null
          leaderboard_visibility?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          slug: string | null
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
          slug?: string | null
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
          slug?: string | null
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
          slug: string | null
          title: string
          description: string | null
          event_type: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day' | 'challenge'
          status: 'draft' | 'published' | 'cancelled' | 'completed'
          location: string | null
          is_virtual: boolean
          start_date: string
          end_date: string | null
          capacity: number | null
          image_url: string | null
          registration_fields: any
          summary: string | null
          tags: string[]
          details: any
          is_climate_action: boolean
          has_challenge: boolean
          submission_deadline: string | null
          has_venue: boolean
          venue_floorplan_url: string | null
          venue_map: any
          venue_opens_at: string | null
          venue_closes_at: string | null
          spectators_enabled: boolean
          spectator_scope: 'members' | 'registered' | 'public'
          registration_closes_at: string | null
          team_size_min: number | null
          team_size_max: number | null
          organizer_id: string
          created_at: string
        }
        Insert: {
          id?: string
          slug?: string | null
          title: string
          description?: string | null
          event_type: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day' | 'challenge'
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          location?: string | null
          is_virtual?: boolean
          start_date: string
          end_date?: string | null
          capacity?: number | null
          image_url?: string | null
          registration_fields?: any
          summary?: string | null
          tags?: string[]
          details?: any
          is_climate_action?: boolean
          has_challenge?: boolean
          submission_deadline?: string | null
          has_venue?: boolean
          venue_floorplan_url?: string | null
          venue_map?: any
          venue_opens_at?: string | null
          venue_closes_at?: string | null
          spectators_enabled?: boolean
          spectator_scope?: 'members' | 'registered' | 'public'
          registration_closes_at?: string | null
          team_size_min?: number | null
          team_size_max?: number | null
          organizer_id: string
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string | null
          title?: string
          description?: string | null
          event_type?: 'hackathon' | 'workshop' | 'meetup' | 'conference' | 'demo_day' | 'challenge'
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          location?: string | null
          is_virtual?: boolean
          start_date?: string
          end_date?: string | null
          capacity?: number | null
          image_url?: string | null
          registration_fields?: any
          summary?: string | null
          tags?: string[]
          details?: any
          is_climate_action?: boolean
          has_challenge?: boolean
          submission_deadline?: string | null
          has_venue?: boolean
          venue_floorplan_url?: string | null
          venue_map?: any
          venue_opens_at?: string | null
          venue_closes_at?: string | null
          spectators_enabled?: boolean
          spectator_scope?: 'members' | 'registered' | 'public'
          registration_closes_at?: string | null
          team_size_min?: number | null
          team_size_max?: number | null
          organizer_id?: string
          created_at?: string
        }
        Relationships: []
      }
      event_criteria: {
        Row: {
          id: string
          event_id: string
          kind: 'objective' | 'constraint' | 'deliverable' | 'judging_criterion'
          title: string
          description: string | null
          is_required: boolean
          weight: number | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          kind: 'objective' | 'constraint' | 'deliverable' | 'judging_criterion'
          title: string
          description?: string | null
          is_required?: boolean
          weight?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          kind?: 'objective' | 'constraint' | 'deliverable' | 'judging_criterion'
          title?: string
          description?: string | null
          is_required?: boolean
          weight?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // 085 — what participants submit back against a challenge.
      event_solutions: {
        Row: {
          id: string
          event_id: string
          author_id: string
          title: string
          description: string | null
          link_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          author_id: string
          title: string
          description?: string | null
          link_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          author_id?: string
          title?: string
          description?: string | null
          link_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          id: string
          event_id: string
          user_id: string
          status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in' | 'declined'
          attendance_type: 'participant' | 'viewer'
          registration_data: any
          decided_by: string | null
          decided_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in' | 'declined'
          attendance_type?: 'participant' | 'viewer'
          registration_data?: any
          decided_by?: string | null
          decided_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in' | 'declined'
          attendance_type?: 'participant' | 'viewer'
          registration_data?: any
          decided_by?: string | null
          decided_at?: string | null
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
          slug: string | null
          title: string
          description: string | null
          amount_min: number | null
          amount_max: number | null
          currency: string
          deadline: string | null
          eligibility: string | null
          application_url: string | null
          grant_type: string | null
          funding_type: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug?: string | null
          title: string
          description?: string | null
          amount_min?: number | null
          amount_max?: number | null
          currency?: string
          deadline?: string | null
          eligibility?: string | null
          application_url?: string | null
          grant_type?: string | null
          funding_type?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string | null
          title?: string
          description?: string | null
          amount_min?: number | null
          amount_max?: number | null
          currency?: string
          deadline?: string | null
          eligibility?: string | null
          application_url?: string | null
          grant_type?: string | null
          funding_type?: string
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
          status: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected'
          current_step: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          grant_id: string
          user_id: string
          application_data?: Record<string, any>
          status?: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected'
          current_step?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          grant_id?: string
          user_id?: string
          application_data?: Record<string, any>
          status?: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected'
          current_step?: number
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
          slug: string | null
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
          slug?: string | null
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
          slug?: string | null
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
      // CV / résumé documents (migration 069). `data` and `sources` are the
      // shapes in src/types/resume.ts, declared loosely here because this file
      // describes the wire schema and the document shape is versioned by the
      // `template` column, not by the table definition.
      resumes: {
        Row: {
          id: string
          user_id: string
          template: string
          /** Chosen presentation (migration 078). Purely visual; never the row key. */
          design: string
          data: Record<string, unknown>
          sources: Record<string, string>
          is_public: boolean
          vc_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          template?: string
          design?: string
          data?: Record<string, unknown>
          sources?: Record<string, string>
          is_public?: boolean
          vc_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          template?: string
          design?: string
          data?: Record<string, unknown>
          sources?: Record<string, string>
          is_public?: boolean
          vc_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // OECS Virtual Campus identity links (migration 068). Readable by the
      // owner; every write is service_role from api/auth/vc/callback.ts.
      vc_identities: {
        Row: {
          id: string
          issuer: string
          vc_sub: string
          user_id: string
          email: string | null
          raw_claims: Record<string, unknown>
          linked_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          issuer: string
          vc_sub: string
          user_id: string
          email?: string | null
          raw_claims?: Record<string, unknown>
          linked_at?: string
          last_seen_at?: string
        }
        Update: {
          email?: string | null
          raw_claims?: Record<string, unknown>
          last_seen_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      // Returns null unless the résumé is published and its owner is not
      // suspended, so a signed-out visitor can call it safely.
      public_resume: {
        Args: { p_user: string; p_template?: string }
        Returns: {
          template: string
          data: Record<string, unknown>
          updated_at: string
          display_name: string | null
          avatar_url: string | null
        } | null
      }
      // Scoped to auth.uid() in SQL — the caller cannot ask about anyone else.
      vc_my_identity: {
        Args: Record<string, never>
        Returns: {
          issuer: string
          vc_sub: string
          email: string
          linked_at: string
          last_seen_at: string
        } | null
      }
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
