import GeoJSON from "ol/format/GeoJSON"

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      highlights: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          trip_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          trip_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          trip_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highlights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string | null
          date: string | null
          gps_reference: unknown | null
          id: number
          is_cover_photo: boolean
          name: string | null
          note: string | null
          title: string | null
          trip_id: number | null
          url: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          gps_reference?: unknown | null
          id?: number
          is_cover_photo?: boolean
          name?: string | null
          note?: string | null
          title?: string | null
          trip_id?: number | null
          url: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          gps_reference?: unknown | null
          id?: number
          is_cover_photo?: boolean
          name?: string | null
          note?: string | null
          title?: string | null
          trip_id?: number | null
          url?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      species_observations: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          gps_location: unknown | null
          id: number
          photo_url: string | null
          species_name: string
          trip_id: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          gps_location?: unknown | null
          id?: number
          photo_url?: string | null
          species_name: string
          trip_id?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          gps_location?: unknown | null
          id?: number
          photo_url?: string | null
          species_name?: string
          trip_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "species_observations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_observations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      trip_tags: {
        Row: {
          tag_id: number
          trip_id: number
        }
        Insert: {
          tag_id: number
          trip_id: number
        }
        Update: {
          tag_id?: number
          trip_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tags_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string | null
          description: string | null
          gps_reference: unknown | null
          gpx_file: string | null
          id: number
          title: string
          trip_path: unknown | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gps_reference?: unknown | null
          gpx_file?: string | null
          id?: number
          title: string
          trip_path?: unknown | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gps_reference?: unknown | null
          gpx_file?: string | null
          id?: number
          title?: string
          trip_path?: unknown | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_trips: {
        Args: {
          cur_user_id: string
        }
        Returns: {
          id: number
          title: string
          lat: number | null
          long: number | null
          trip_path: GeoJSON | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
