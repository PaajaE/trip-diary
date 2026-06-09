export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      entries: {
        Row: {
          body: string
          created_at: string
          creator_id: string
          event_at: string | null
          id: string
          language: Database["public"]["Enums"]["entry_language"]
          latitude: number | null
          longitude: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
          title: string | null
          type: Database["public"]["Enums"]["entry_type"]
          updated_at: string
          version: number
          visibility: Database["public"]["Enums"]["entry_visibility"]
        }
        Insert: {
          body?: string
          created_at?: string
          creator_id: string
          event_at?: string | null
          id: string
          language?: Database["public"]["Enums"]["entry_language"]
          latitude?: number | null
          longitude?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          title?: string | null
          type: Database["public"]["Enums"]["entry_type"]
          updated_at?: string
          version?: number
          visibility?: Database["public"]["Enums"]["entry_visibility"]
        }
        Update: {
          body?: string
          created_at?: string
          creator_id?: string
          event_at?: string | null
          id?: string
          language?: Database["public"]["Enums"]["entry_language"]
          latitude?: number | null
          longitude?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          title?: string | null
          type?: Database["public"]["Enums"]["entry_type"]
          updated_at?: string
          version?: number
          visibility?: Database["public"]["Enums"]["entry_visibility"]
        }
        Relationships: []
      }
      entry_photos: {
        Row: {
          created_at: string
          creator_id: string
          entry_id: string
          photo_id: string
          position: number
        }
        Insert: {
          created_at?: string
          creator_id: string
          entry_id: string
          photo_id: string
          position: number
        }
        Update: {
          created_at?: string
          creator_id?: string
          entry_id?: string
          photo_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "entry_photos_entry_creator_fk"
            columns: ["entry_id", "creator_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id", "creator_id"]
          },
          {
            foreignKeyName: "entry_photos_photo_creator_fk"
            columns: ["photo_id", "creator_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id", "creator_id"]
          },
        ]
      }
      photo_variants: {
        Row: {
          byte_size: number
          created_at: string
          creator_id: string
          height: number
          mime_type: string
          photo_id: string
          storage_path: string
          updated_at: string
          variant: Database["public"]["Enums"]["photo_variant_type"]
          width: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          creator_id: string
          height: number
          mime_type?: string
          photo_id: string
          storage_path: string
          updated_at?: string
          variant: Database["public"]["Enums"]["photo_variant_type"]
          width: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          creator_id?: string
          height?: number
          mime_type?: string
          photo_id?: string
          storage_path?: string
          updated_at?: string
          variant?: Database["public"]["Enums"]["photo_variant_type"]
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "photo_variants_photo_creator_fk"
            columns: ["photo_id", "creator_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id", "creator_id"]
          },
        ]
      }
      photos: {
        Row: {
          captured_at: string | null
          created_at: string
          creator_id: string
          id: string
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          creator_id: string
          id: string
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          preferred_locale: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          preferred_locale?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_locale?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_entry: {
        Args: {
          p_body: string
          p_event_at: string
          p_expected_version: number
          p_id: string
          p_language: Database["public"]["Enums"]["entry_language"]
          p_latitude: number
          p_longitude: number
          p_status: Database["public"]["Enums"]["entry_status"]
          p_title: string
          p_type: Database["public"]["Enums"]["entry_type"]
          p_visibility: Database["public"]["Enums"]["entry_visibility"]
        }
        Returns: {
          body: string
          created_at: string
          creator_id: string
          event_at: string | null
          id: string
          language: Database["public"]["Enums"]["entry_language"]
          latitude: number | null
          longitude: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
          title: string | null
          type: Database["public"]["Enums"]["entry_type"]
          updated_at: string
          version: number
          visibility: Database["public"]["Enums"]["entry_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      entry_language: "cs" | "en"
      entry_status: "draft" | "published"
      entry_type: "story" | "tip" | "note" | "place"
      entry_visibility: "public" | "private"
      photo_variant_type: "thumb" | "preview" | "large"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      entry_language: ["cs", "en"],
      entry_status: ["draft", "published"],
      entry_type: ["story", "tip", "note", "place"],
      entry_visibility: ["public", "private"],
      photo_variant_type: ["thumb", "preview", "large"],
    },
  },
} as const

