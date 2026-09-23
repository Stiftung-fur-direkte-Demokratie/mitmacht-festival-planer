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
      attendance: {
        Row: {
          created_at: string
          is_public: boolean
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_public?: boolean
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          last_push_at: string | null
          last_push_to: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          last_push_at?: string | null
          last_push_to?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          last_push_at?: string | null
          last_push_to?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      message_reports: {
        Row: {
          created_at: string
          id: string
          message_body_snapshot: string | null
          message_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_body_snapshot?: string | null
          message_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_body_snapshot?: string | null
          message_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          nonce: string
          return_path: string
          state: string
        }
        Insert: {
          created_at?: string
          nonce: string
          return_path?: string
          state: string
        }
        Update: {
          created_at?: string
          nonce?: string
          return_path?: string
          state?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accept_messages: boolean
          avatar_url: string | null
          consent_at: string | null
          display_name: string
          hidden_by_admin: boolean
          id: string
          linkedin_sub: string | null
          linkedin_url: string | null
          organisation: string | null
          profile_done: boolean
          program_updated_at: string | null
          role_title: string | null
          updated_at: string
          visible: boolean
        }
        Insert: {
          accept_messages?: boolean
          avatar_url?: string | null
          consent_at?: string | null
          display_name?: string
          hidden_by_admin?: boolean
          id: string
          linkedin_sub?: string | null
          linkedin_url?: string | null
          organisation?: string | null
          profile_done?: boolean
          program_updated_at?: string | null
          role_title?: string | null
          updated_at?: string
          visible?: boolean
        }
        Update: {
          accept_messages?: boolean
          avatar_url?: string | null
          consent_at?: string | null
          display_name?: string
          hidden_by_admin?: boolean
          id?: string
          linkedin_sub?: string | null
          linkedin_url?: string | null
          organisation?: string | null
          profile_done?: boolean
          program_updated_at?: string | null
          role_title?: string | null
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      push_config: {
        Row: {
          cron_token: string
          id: number
        }
        Insert: {
          cron_token?: string
          id?: number
        }
        Update: {
          cron_token?: string
          id?: number
        }
        Relationships: []
      }
      push_sent: {
        Row: {
          sent_at: string
          session_id: string
          subscription_id: string
        }
        Insert: {
          sent_at?: string
          session_id: string
          subscription_id: string
        }
        Update: {
          sent_at?: string
          session_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_sent_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          lead_minutes: number
          p256dh: string
          platform: string
          session_ids: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          lead_minutes?: number
          p256dh: string
          platform?: string
          session_ids?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          lead_minutes?: number
          p256dh?: string
          platform?: string
          session_ids?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      push_tests: {
        Row: {
          due_at: string
          id: string
          subscription_id: string
        }
        Insert: {
          due_at: string
          id?: string
          subscription_id: string
        }
        Update: {
          due_at?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      _mm_send: {
        Args: { _body: string; _conv: string; _uid: string }
        Returns: Json
      }
      admin_reports: {
        Args: never
        Returns: {
          created_at: string
          id: string
          message_body_snapshot: string
          reason: string
          reported_hidden: boolean
          reported_name: string
          reported_user_id: string
          reporter_name: string
        }[]
      }
      admin_set_hidden: {
        Args: { _hidden: boolean; _user_id: string }
        Returns: undefined
      }
      block_user: { Args: { _other: string }; Returns: undefined }
      community_public: {
        Args: never
        Returns: {
          accept_messages: boolean
          avatar_url: string
          display_name: string
          hidden: boolean
          linkedin_url: string
          organisation: string
          role_title: string
          session_ids: string[]
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inbox: {
        Args: never
        Returns: {
          avatar_url: string
          blocked_me: boolean
          can_reply: boolean
          conversation_id: string
          display_name: string
          last_body: string
          last_message_at: string
          last_sender: string
          linkedin_url: string
          organisation: string
          partner_exists: boolean
          partner_id: string
          role_title: string
          unread: number
        }[]
      }
      is_blocked_pair: { Args: { _a: string; _b: string }; Returns: boolean }
      is_known_session: { Args: { _id: string }; Returns: boolean }
      mark_read: { Args: { _conversation_id: string }; Returns: undefined }
      my_blocks: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          user_id: string
        }[]
      }
      report_message: {
        Args: { _message_id: string; _reason: string; _reported: string }
        Returns: undefined
      }
      send_message: {
        Args: { _body: string; _conversation_id: string }
        Returns: Json
      }
      start_conversation: {
        Args: { _body: string; _other: string }
        Returns: Json
      }
      unblock_user: { Args: { _other: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin"],
    },
  },
} as const
