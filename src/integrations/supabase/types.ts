export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          id: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          id: string
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          id?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      beta_testers: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          ip: string | null
          memory_used: boolean
          model: string | null
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          ip?: string | null
          memory_used?: boolean
          model?: string | null
          role: string
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          ip?: string | null
          memory_used?: boolean
          model?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          is_incognito: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_incognito?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_incognito?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_daps: {
        Row: {
          author_name: string
          created_at: string
          description: string
          emoji: string
          id: string
          install_count: number
          mcp_url: string | null
          name: string
          opener: string
          published: boolean
          source_id: string | null
          system_prompt: string
          user_id: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          install_count?: number
          mcp_url?: string | null
          name: string
          opener?: string
          published?: boolean
          source_id?: string | null
          system_prompt: string
          user_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          install_count?: number
          mcp_url?: string | null
          name?: string
          opener?: string
          published?: boolean
          source_id?: string | null
          system_prompt?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_tracks: {
        Row: {
          created_at: string
          goal: number
          id: string
          is_public: boolean
          name: string
          owner_id: string
          params: Json
          play_count: number
          season: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal: number
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          params: Json
          play_count?: number
          season: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal?: number
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          params?: Json
          play_count?: number
          season?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_rate_limits: {
        Row: {
          created_at: string
          id: string
          ip: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          kind?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          kind?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          chat_id: string | null
          created_at: string
          due_at: string
          ease: number
          front: string
          id: string
          interval_days: number
          reps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          chat_id?: string | null
          created_at?: string
          due_at?: string
          ease?: number
          front: string
          id?: string
          interval_days?: number
          reps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          chat_id?: string | null
          created_at?: string
          due_at?: string
          ease?: number
          front?: string
          id?: string
          interval_days?: number
          reps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_sessions: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          ip: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banned: boolean
          created_at: string
          email: string | null
          id: string
          name: string | null
          password_reset_required: boolean
          pro_messages_used: number
          recovery_answer_hash: string | null
          recovery_question: string | null
          site_admin: boolean
          tier: Database["public"]["Enums"]["account_tier"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banned?: boolean
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          password_reset_required?: boolean
          pro_messages_used?: number
          recovery_answer_hash?: string | null
          recovery_question?: string | null
          site_admin?: boolean
          tier?: Database["public"]["Enums"]["account_tier"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banned?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          password_reset_required?: boolean
          pro_messages_used?: number
          recovery_answer_hash?: string | null
          recovery_question?: string | null
          site_admin?: boolean
          tier?: Database["public"]["Enums"]["account_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      study_room_members: {
        Row: {
          display_name: string
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          display_name?: string
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          display_name?: string
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_messages: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          role: string
          room_id: string
          user_id: string | null
        }
        Insert: {
          author_name?: string
          content: string
          created_at?: string
          id?: string
          role?: string
          room_id: string
          user_id?: string | null
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          room_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_rooms: {
        Row: {
          code: string
          created_at: string
          host_id: string
          id: string
          is_open: boolean
          model: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          host_id: string
          id?: string
          is_open?: boolean
          model?: string
          name?: string
        }
        Update: {
          code?: string
          created_at?: string
          host_id?: string
          id?: string
          is_open?: boolean
          model?: string
          name?: string
        }
        Relationships: []
      }
      track_scores: {
        Row: {
          best_time_ms: number
          created_at: string
          id: string
          track_ref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_time_ms: number
          created_at?: string
          id?: string
          track_ref: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_time_ms?: number
          created_at?: string
          id?: string
          track_ref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_quota: {
        Row: {
          created_at: string
          day_date: string
          day_images: number
          day_tokens: number
          updated_at: string
          user_id: string
          week_start: string
          week_tokens: number
        }
        Insert: {
          created_at?: string
          day_date?: string
          day_images?: number
          day_tokens?: number
          updated_at?: string
          user_id: string
          week_start?: string
          week_tokens?: number
        }
        Update: {
          created_at?: string
          day_date?: string
          day_images?: number
          day_tokens?: number
          updated_at?: string
          user_id?: string
          week_start?: string
          week_tokens?: number
        }
        Relationships: []
      }
      user_memories: {
        Row: {
          content: string
          created_at: string
          enabled: boolean
          id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          enabled?: boolean
          id?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_join_study_room: { Args: { _room_id: string }; Returns: boolean }
      find_study_room_by_code: {
        Args: { _code: string }
        Returns: {
          code: string
          id: string
          is_open: boolean
          name: string
        }[]
      }
      get_track_leaderboard: {
        Args: { _limit?: number; _track_ref: string }
        Returns: {
          achieved_at: string
          best_time_ms: number
          name: string
          rank: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      install_custom_dap: { Args: { _source_id: string }; Returns: string }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_tier: "free" | "pro" | "go" | "exclusive"
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_tier: ["free", "pro", "go", "exclusive"],
      app_role: ["admin", "user"],
    },
  },
} as const
