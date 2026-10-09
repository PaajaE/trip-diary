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
      content_comments: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          target_id: string
          target_type: Database['public']['Enums']['content_target_type']
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          target_id: string
          target_type: Database['public']['Enums']['content_target_type']
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          target_id?: string
          target_type?: Database['public']['Enums']['content_target_type']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_comments_user_profile_fk'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      content_hearts: {
        Row: {
          created_at: string
          target_id: string
          target_type: Database['public']['Enums']['content_target_type']
          user_id: string
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: Database['public']['Enums']['content_target_type']
          user_id: string
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: Database['public']['Enums']['content_target_type']
          user_id?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          body: string
          created_at: string
          creator_id: string
          event_at: string | null
          id: string
          language: Database['public']['Enums']['entry_language']
          latitude: number | null
          longitude: number | null
          published_at: string | null
          slug: string
          space_id: string
          status: Database['public']['Enums']['entry_status']
          title: string | null
          type: Database['public']['Enums']['entry_type']
          updated_at: string
          version: number
          visibility: Database['public']['Enums']['entry_visibility']
        }
        Insert: {
          body?: string
          created_at?: string
          creator_id: string
          event_at?: string | null
          id: string
          language?: Database['public']['Enums']['entry_language']
          latitude?: number | null
          longitude?: number | null
          published_at?: string | null
          slug: string
          space_id: string
          status?: Database['public']['Enums']['entry_status']
          title?: string | null
          type: Database['public']['Enums']['entry_type']
          updated_at?: string
          version?: number
          visibility?: Database['public']['Enums']['entry_visibility']
        }
        Update: {
          body?: string
          created_at?: string
          creator_id?: string
          event_at?: string | null
          id?: string
          language?: Database['public']['Enums']['entry_language']
          latitude?: number | null
          longitude?: number | null
          published_at?: string | null
          slug?: string
          space_id?: string
          status?: Database['public']['Enums']['entry_status']
          title?: string | null
          type?: Database['public']['Enums']['entry_type']
          updated_at?: string
          version?: number
          visibility?: Database['public']['Enums']['entry_visibility']
        }
        Relationships: [
          {
            foreignKeyName: 'entries_space_id_fkey'
            columns: ['space_id']
            isOneToOne: false
            referencedRelation: 'spaces'
            referencedColumns: ['id']
          },
        ]
      }
      entry_journey_links: {
        Row: {
          created_at: string
          creator_id: string
          entry_id: string
          guide_section_id: string | null
          journey_id: string
          stage_id: string | null
          stop_id: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          entry_id: string
          guide_section_id?: string | null
          journey_id: string
          stage_id?: string | null
          stop_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          entry_id?: string
          guide_section_id?: string | null
          journey_id?: string
          stage_id?: string | null
          stop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'entry_journey_links_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: true
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entry_journey_links_guide_fk'
            columns: ['guide_section_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'journey_guide_sections'
            referencedColumns: ['id', 'journey_id']
          },
          {
            foreignKeyName: 'entry_journey_links_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entry_journey_links_stage_fk'
            columns: ['stage_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'journey_stages'
            referencedColumns: ['id', 'journey_id']
          },
          {
            foreignKeyName: 'entry_journey_links_stop_fk'
            columns: ['stop_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'journey_stops'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
      entry_photos: {
        Row: {
          caption: string | null
          created_at: string
          creator_id: string
          entry_id: string
          focal_x: number | null
          focal_y: number | null
          is_cover: boolean
          photo_id: string
          position: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          creator_id: string
          entry_id: string
          focal_x?: number | null
          focal_y?: number | null
          is_cover?: boolean
          photo_id: string
          position: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          creator_id?: string
          entry_id?: string
          focal_x?: number | null
          focal_y?: number | null
          is_cover?: boolean
          photo_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'entry_photos_entry_creator_fk'
            columns: ['entry_id', 'creator_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id', 'creator_id']
          },
          {
            foreignKeyName: 'entry_photos_photo_creator_fk'
            columns: ['photo_id', 'creator_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id', 'creator_id']
          },
        ]
      }
      entry_translations: {
        Row: {
          completed_at: string | null
          created_at: string
          edited_at: string | null
          entry_id: string
          error_message: string | null
          id: string
          is_manually_edited: boolean
          model: string | null
          provider: string | null
          requested_at: string
          source_content_hash: string | null
          source_locale: Database['public']['Enums']['entry_language']
          source_version: number | null
          status: Database['public']['Enums']['translation_status']
          target_locale: Database['public']['Enums']['entry_language']
          translated_body: string
          translated_title: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          edited_at?: string | null
          entry_id: string
          error_message?: string | null
          id?: string
          is_manually_edited?: boolean
          model?: string | null
          provider?: string | null
          requested_at?: string
          source_content_hash?: string | null
          source_locale?: Database['public']['Enums']['entry_language']
          source_version?: number | null
          status?: Database['public']['Enums']['translation_status']
          target_locale?: Database['public']['Enums']['entry_language']
          translated_body?: string
          translated_title?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          edited_at?: string | null
          entry_id?: string
          error_message?: string | null
          id?: string
          is_manually_edited?: boolean
          model?: string | null
          provider?: string | null
          requested_at?: string
          source_content_hash?: string | null
          source_locale?: Database['public']['Enums']['entry_language']
          source_version?: number | null
          status?: Database['public']['Enums']['translation_status']
          target_locale?: Database['public']['Enums']['entry_language']
          translated_body?: string
          translated_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entry_translations_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
        ]
      }
      journey_checklist_items: {
        Row: {
          category: Database['public']['Enums']['checklist_item_category']
          checked_at: string | null
          created_at: string
          creator_id: string
          entry_id: string | null
          id: string
          item_slug: string
          journey_id: string
          notes: string
          position: number
          stop_id: string | null
          template_slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database['public']['Enums']['checklist_item_category']
          checked_at?: string | null
          created_at?: string
          creator_id: string
          entry_id?: string | null
          id?: string
          item_slug: string
          journey_id: string
          notes?: string
          position: number
          stop_id?: string | null
          template_slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database['public']['Enums']['checklist_item_category']
          checked_at?: string | null
          created_at?: string
          creator_id?: string
          entry_id?: string | null
          id?: string
          item_slug?: string
          journey_id?: string
          notes?: string
          position?: number
          stop_id?: string | null
          template_slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_checklist_items_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journey_checklist_items_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journey_checklist_items_stop_fk'
            columns: ['stop_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'journey_stops'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
      journey_guide_sections: {
        Row: {
          body: string
          created_at: string
          creator_id: string
          id: string
          journey_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          creator_id: string
          id: string
          journey_id: string
          position: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          creator_id?: string
          id?: string
          journey_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_guide_sections_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
        ]
      }
      journey_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email_normalized: string
          expires_at: string
          id: string
          journey_id: string
          revoked_at: string | null
          role: Database['public']['Enums']['journey_member_role']
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email_normalized: string
          expires_at: string
          id?: string
          journey_id: string
          revoked_at?: string | null
          role: Database['public']['Enums']['journey_member_role']
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email_normalized?: string
          expires_at?: string
          id?: string
          journey_id?: string
          revoked_at?: string | null
          role?: Database['public']['Enums']['journey_member_role']
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_invites_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
        ]
      }
      journey_members: {
        Row: {
          created_at: string
          journey_id: string
          role: Database['public']['Enums']['journey_member_role']
          user_id: string
        }
        Insert: {
          created_at?: string
          journey_id: string
          role?: Database['public']['Enums']['journey_member_role']
          user_id: string
        }
        Update: {
          created_at?: string
          journey_id?: string
          role?: Database['public']['Enums']['journey_member_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_members_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
        ]
      }
      journey_photo_tags: {
        Row: {
          created_at: string
          id: string
          journey_id: string
          label: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          journey_id: string
          label: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          journey_id?: string
          label?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_photo_tags_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
        ]
      }
      journey_stages: {
        Row: {
          created_at: string
          creator_id: string
          ends_at: string | null
          id: string
          journey_id: string
          position: number
          starts_at: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          ends_at?: string | null
          id: string
          journey_id: string
          position: number
          starts_at?: string | null
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          ends_at?: string | null
          id?: string
          journey_id?: string
          position?: number
          starts_at?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'journey_stages_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
        ]
      }
      journey_stops: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          journey_id: string
          latitude: number | null
          longitude: number | null
          map_latitude: number | null
          map_longitude: number | null
          notes: string
          planned_at: string | null
          position: number
          stage_id: string | null
          status: Database['public']['Enums']['journey_stop_status']
          title: string
          updated_at: string
          visited_at: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id: string
          journey_id: string
          latitude?: number | null
          longitude?: number | null
          map_latitude?: number | null
          map_longitude?: number | null
          notes?: string
          planned_at?: string | null
          position: number
          stage_id?: string | null
          status?: Database['public']['Enums']['journey_stop_status']
          title: string
          updated_at?: string
          visited_at?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          journey_id?: string
          latitude?: number | null
          longitude?: number | null
          map_latitude?: number | null
          map_longitude?: number | null
          notes?: string
          planned_at?: string | null
          position?: number
          stage_id?: string | null
          status?: Database['public']['Enums']['journey_stop_status']
          title?: string
          updated_at?: string
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'journey_stops_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journey_stops_stage_fk'
            columns: ['stage_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'journey_stages'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
      journeys: {
        Row: {
          cover_media_id: string | null
          created_at: string
          creator_id: string
          ends_at: string | null
          home_tz: string | null
          id: string
          slug: string
          space_id: string
          starts_at: string | null
          status: Database['public']['Enums']['journey_status']
          summary: string
          title: string
          updated_at: string
          visibility: Database['public']['Enums']['journey_visibility']
        }
        Insert: {
          cover_media_id?: string | null
          created_at?: string
          creator_id: string
          ends_at?: string | null
          home_tz?: string | null
          id: string
          slug: string
          space_id: string
          starts_at?: string | null
          status?: Database['public']['Enums']['journey_status']
          summary?: string
          title: string
          updated_at?: string
          visibility?: Database['public']['Enums']['journey_visibility']
        }
        Update: {
          cover_media_id?: string | null
          created_at?: string
          creator_id?: string
          ends_at?: string | null
          home_tz?: string | null
          id?: string
          slug?: string
          space_id?: string
          starts_at?: string | null
          status?: Database['public']['Enums']['journey_status']
          summary?: string
          title?: string
          updated_at?: string
          visibility?: Database['public']['Enums']['journey_visibility']
        }
        Relationships: [
          {
            foreignKeyName: 'journeys_cover_media_fk'
            columns: ['cover_media_id']
            isOneToOne: false
            referencedRelation: 'media'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'journeys_space_id_fkey'
            columns: ['space_id']
            isOneToOne: false
            referencedRelation: 'spaces'
            referencedColumns: ['id']
          },
        ]
      }
      media: {
        Row: {
          altitude: number | null
          caption: string | null
          captured_at: string | null
          captured_tz: string | null
          content_hash: string | null
          created_at: string
          duration_ms: number | null
          focal_x: number | null
          focal_y: number | null
          height: number | null
          hide_location: boolean
          id: string
          journey_id: string | null
          kind: Database['public']['Enums']['media_kind']
          latitude: number | null
          longitude: number | null
          moment_id: string | null
          owner_id: string
          segment_override_id: string | null
          source_asset_id: string | null
          starred: boolean
          status: Database['public']['Enums']['media_status']
          updated_at: string
          width: number | null
        }
        Insert: {
          altitude?: number | null
          caption?: string | null
          captured_at?: string | null
          captured_tz?: string | null
          content_hash?: string | null
          created_at?: string
          duration_ms?: number | null
          focal_x?: number | null
          focal_y?: number | null
          height?: number | null
          hide_location?: boolean
          id: string
          journey_id?: string | null
          kind?: Database['public']['Enums']['media_kind']
          latitude?: number | null
          longitude?: number | null
          moment_id?: string | null
          owner_id: string
          segment_override_id?: string | null
          source_asset_id?: string | null
          starred?: boolean
          status?: Database['public']['Enums']['media_status']
          updated_at?: string
          width?: number | null
        }
        Update: {
          altitude?: number | null
          caption?: string | null
          captured_at?: string | null
          captured_tz?: string | null
          content_hash?: string | null
          created_at?: string
          duration_ms?: number | null
          focal_x?: number | null
          focal_y?: number | null
          height?: number | null
          hide_location?: boolean
          id?: string
          journey_id?: string | null
          kind?: Database['public']['Enums']['media_kind']
          latitude?: number | null
          longitude?: number | null
          moment_id?: string | null
          owner_id?: string
          segment_override_id?: string | null
          source_asset_id?: string | null
          starred?: boolean
          status?: Database['public']['Enums']['media_status']
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'media_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'media_moment_fk'
            columns: ['moment_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'moments'
            referencedColumns: ['id', 'journey_id']
          },
          {
            foreignKeyName: 'media_segment_override_fk'
            columns: ['segment_override_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'segments'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
      media_variants: {
        Row: {
          byte_size: number
          created_at: string
          height: number
          kind: Database['public']['Enums']['media_variant_kind']
          media_id: string
          mime_type: string
          storage_key: string
          width: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          height: number
          kind: Database['public']['Enums']['media_variant_kind']
          media_id: string
          mime_type: string
          storage_key: string
          width: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          height?: number
          kind?: Database['public']['Enums']['media_variant_kind']
          media_id?: string
          mime_type?: string
          storage_key?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: 'media_variants_media_id_fkey'
            columns: ['media_id']
            isOneToOne: false
            referencedRelation: 'media'
            referencedColumns: ['id']
          },
        ]
      }
      moments: {
        Row: {
          body: string
          cover_media_id: string | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          journey_id: string
          latitude: number | null
          locked: boolean
          longitude: number | null
          origin: Database['public']['Enums']['content_origin']
          place_id: string | null
          published: boolean
          starts_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          cover_media_id?: string | null
          created_at?: string
          created_by: string
          ends_at: string
          id: string
          journey_id: string
          latitude?: number | null
          locked?: boolean
          longitude?: number | null
          origin?: Database['public']['Enums']['content_origin']
          place_id?: string | null
          published?: boolean
          starts_at: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cover_media_id?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          journey_id?: string
          latitude?: number | null
          locked?: boolean
          longitude?: number | null
          origin?: Database['public']['Enums']['content_origin']
          place_id?: string | null
          published?: boolean
          starts_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'moments_cover_media_fk'
            columns: ['cover_media_id']
            isOneToOne: false
            referencedRelation: 'media'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'moments_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'moments_place_id_fkey'
            columns: ['place_id']
            isOneToOne: false
            referencedRelation: 'places'
            referencedColumns: ['id']
          },
        ]
      }
      nature_observations: {
        Row: {
          category: Database['public']['Enums']['checklist_item_category']
          checklist_item_id: string | null
          common_name: string
          confidence: Database['public']['Enums']['observation_confidence']
          created_at: string
          creator_id: string
          entry_id: string | null
          external_id: string | null
          external_source: string | null
          id: string
          journey_id: string
          latitude: number | null
          longitude: number | null
          notes: string
          observed_at: string | null
          photo_id: string | null
          scientific_name: string | null
          updated_at: string
        }
        Insert: {
          category?: Database['public']['Enums']['checklist_item_category']
          checklist_item_id?: string | null
          common_name: string
          confidence?: Database['public']['Enums']['observation_confidence']
          created_at?: string
          creator_id: string
          entry_id?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          journey_id: string
          latitude?: number | null
          longitude?: number | null
          notes?: string
          observed_at?: string | null
          photo_id?: string | null
          scientific_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database['public']['Enums']['checklist_item_category']
          checklist_item_id?: string | null
          common_name?: string
          confidence?: Database['public']['Enums']['observation_confidence']
          created_at?: string
          creator_id?: string
          entry_id?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          journey_id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string
          observed_at?: string | null
          photo_id?: string | null
          scientific_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nature_observations_checklist_item_id_fkey'
            columns: ['checklist_item_id']
            isOneToOne: false
            referencedRelation: 'journey_checklist_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nature_observations_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nature_observations_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nature_observations_photo_id_fkey'
            columns: ['photo_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id']
          },
        ]
      }
      photo_tag_assignments: {
        Row: {
          created_at: string
          creator_id: string
          photo_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          photo_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          photo_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'photo_tag_assignments_photo_creator_fk'
            columns: ['photo_id', 'creator_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id', 'creator_id']
          },
          {
            foreignKeyName: 'photo_tag_assignments_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'journey_photo_tags'
            referencedColumns: ['id']
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
          variant: Database['public']['Enums']['photo_variant_type']
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
          variant: Database['public']['Enums']['photo_variant_type']
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
          variant?: Database['public']['Enums']['photo_variant_type']
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: 'photo_variants_photo_creator_fk'
            columns: ['photo_id', 'creator_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id', 'creator_id']
          },
        ]
      }
      photos: {
        Row: {
          captured_at: string | null
          created_at: string
          creator_id: string
          duration_ms: number | null
          id: string
          latitude: number | null
          longitude: number | null
          media_type: string
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          creator_id: string
          duration_ms?: number | null
          id: string
          latitude?: number | null
          longitude?: number | null
          media_type?: string
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          creator_id?: string
          duration_ms?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          media_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          country_code: string | null
          created_at: string
          geocode_source: string
          id: string
          latitude: number
          longitude: number
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          geocode_source: string
          id?: string
          latitude: number
          longitude: number
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          geocode_source?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      post_media: {
        Row: {
          media_id: string
          position: number
          post_id: string
        }
        Insert: {
          media_id: string
          position: number
          post_id: string
        }
        Update: {
          media_id?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'post_media_media_id_fkey'
            columns: ['media_id']
            isOneToOne: false
            referencedRelation: 'media'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'post_media_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          journey_id: string | null
          kind: Database['public']['Enums']['post_kind']
          place_id: string | null
          published_at: string | null
          segment_id: string | null
          slug: string | null
          space_id: string
          title: string
          updated_at: string
          visibility: Database['public']['Enums']['journey_visibility']
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          id: string
          journey_id?: string | null
          kind?: Database['public']['Enums']['post_kind']
          place_id?: string | null
          published_at?: string | null
          segment_id?: string | null
          slug?: string | null
          space_id: string
          title: string
          updated_at?: string
          visibility?: Database['public']['Enums']['journey_visibility']
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          journey_id?: string | null
          kind?: Database['public']['Enums']['post_kind']
          place_id?: string | null
          published_at?: string | null
          segment_id?: string | null
          slug?: string | null
          space_id?: string
          title?: string
          updated_at?: string
          visibility?: Database['public']['Enums']['journey_visibility']
        }
        Relationships: [
          {
            foreignKeyName: 'posts_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'posts_place_id_fkey'
            columns: ['place_id']
            isOneToOne: false
            referencedRelation: 'places'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'posts_segment_id_fkey'
            columns: ['segment_id']
            isOneToOne: false
            referencedRelation: 'segments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'posts_space_id_fkey'
            columns: ['space_id']
            isOneToOne: false
            referencedRelation: 'spaces'
            referencedColumns: ['id']
          },
        ]
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
      segments: {
        Row: {
          body: string
          cover_media_id: string | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          journey_id: string
          kind: Database['public']['Enums']['segment_kind']
          origin: Database['public']['Enums']['content_origin']
          parent_id: string | null
          position: number
          starts_at: string
          title: string
          trip_type: Database['public']['Enums']['trip_type'] | null
          tz: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          cover_media_id?: string | null
          created_at?: string
          created_by: string
          ends_at: string
          id: string
          journey_id: string
          kind: Database['public']['Enums']['segment_kind']
          origin?: Database['public']['Enums']['content_origin']
          parent_id?: string | null
          position?: number
          starts_at: string
          title: string
          trip_type?: Database['public']['Enums']['trip_type'] | null
          tz?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cover_media_id?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          journey_id?: string
          kind?: Database['public']['Enums']['segment_kind']
          origin?: Database['public']['Enums']['content_origin']
          parent_id?: string | null
          position?: number
          starts_at?: string
          title?: string
          trip_type?: Database['public']['Enums']['trip_type'] | null
          tz?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'segments_cover_media_fk'
            columns: ['cover_media_id']
            isOneToOne: false
            referencedRelation: 'media'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'segments_journey_id_fkey'
            columns: ['journey_id']
            isOneToOne: false
            referencedRelation: 'journeys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'segments_parent_fk'
            columns: ['parent_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'segments'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
      space_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email_normalized: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database['public']['Enums']['space_role']
          space_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email_normalized: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: Database['public']['Enums']['space_role']
          space_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email_normalized?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database['public']['Enums']['space_role']
          space_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'space_invites_space_id_fkey'
            columns: ['space_id']
            isOneToOne: false
            referencedRelation: 'spaces'
            referencedColumns: ['id']
          },
        ]
      }
      space_members: {
        Row: {
          created_at: string
          role: Database['public']['Enums']['space_role']
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database['public']['Enums']['space_role']
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database['public']['Enums']['space_role']
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'space_members_space_id_fkey'
            columns: ['space_id']
            isOneToOne: false
            referencedRelation: 'spaces'
            referencedColumns: ['id']
          },
        ]
      }
      spaces: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          handle: string
          id: string
          kind: Database['public']['Enums']['space_kind']
          name: string
          personal_owner_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          handle: string
          id?: string
          kind: Database['public']['Enums']['space_kind']
          name: string
          personal_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          handle?: string
          id?: string
          kind?: Database['public']['Enums']['space_kind']
          name?: string
          personal_owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      taggings: {
        Row: {
          created_at: string
          created_by: string
          tag_id: string
          target_id: string
          target_type: Database['public']['Enums']['tagging_target']
        }
        Insert: {
          created_at?: string
          created_by: string
          tag_id: string
          target_id: string
          target_type: Database['public']['Enums']['tagging_target']
        }
        Update: {
          created_at?: string
          created_by?: string
          tag_id?: string
          target_id?: string
          target_type?: Database['public']['Enums']['tagging_target']
        }
        Relationships: [
          {
            foreignKeyName: 'taggings_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by: string | null
          gbif_taxon_id: number | null
          id: string
          kind: Database['public']['Enums']['tag_kind']
          label: string
          parent_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gbif_taxon_id?: number | null
          id?: string
          kind: Database['public']['Enums']['tag_kind']
          label: string
          parent_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gbif_taxon_id?: number | null
          id?: string
          kind?: Database['public']['Enums']['tag_kind']
          label?: string
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tags_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      tracks: {
        Row: {
          ascent_m: number | null
          created_at: string
          distance_m: number | null
          geojson: Json
          id: string
          journey_id: string
          segment_id: string
          source: string
          updated_at: string
        }
        Insert: {
          ascent_m?: number | null
          created_at?: string
          distance_m?: number | null
          geojson: Json
          id: string
          journey_id: string
          segment_id: string
          source: string
          updated_at?: string
        }
        Update: {
          ascent_m?: number | null
          created_at?: string
          distance_m?: number | null
          geojson?: Json
          id?: string
          journey_id?: string
          segment_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tracks_segment_fk'
            columns: ['segment_id', 'journey_id']
            isOneToOne: false
            referencedRelation: 'segments'
            referencedColumns: ['id', 'journey_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_journey_invite: { Args: { p_raw_token: string }; Returns: string }
      accept_space_invite: { Args: { p_raw_token: string }; Returns: string }
      can_edit_journey: { Args: { p_journey_id: string }; Returns: boolean }
      can_edit_tagging_target: {
        Args: {
          p_target_id: string
          p_target_type: Database['public']['Enums']['tagging_target']
        }
        Returns: boolean
      }
      can_moderate_target: {
        Args: {
          p_target_id: string
          p_target_type: Database['public']['Enums']['content_target_type']
          p_user_id: string
        }
        Returns: boolean
      }
      can_read_tagging_target: {
        Args: {
          p_target_id: string
          p_target_type: Database['public']['Enums']['tagging_target']
        }
        Returns: boolean
      }
      change_space_member_role: {
        Args: {
          p_role: Database['public']['Enums']['space_role']
          p_space_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      compute_source_content_hash: {
        Args: { p_body: string; p_title: string }
        Returns: string
      }
      create_family_space: {
        Args: { p_handle: string; p_name: string }
        Returns: string
      }
      create_journey_guide_section: {
        Args: { p_body?: string; p_journey_id: string; p_title: string }
        Returns: string
      }
      create_journey_invite: {
        Args: {
          p_email: string
          p_journey_id: string
          p_role?: Database['public']['Enums']['journey_member_role']
        }
        Returns: string
      }
      create_journey_stage: {
        Args: { p_journey_id: string; p_summary?: string; p_title: string }
        Returns: string
      }
      create_journey_stop: {
        Args: {
          p_journey_id: string
          p_notes?: string
          p_stage_id: string
          p_status?: Database['public']['Enums']['journey_stop_status']
          p_title: string
        }
        Returns: string
      }
      create_space_invite: {
        Args: {
          p_email: string
          p_role?: Database['public']['Enums']['space_role']
          p_space_id: string
        }
        Returns: string
      }
      get_journey_invite_preview: {
        Args: { p_raw_token: string }
        Returns: {
          journey_id: string
          journey_summary: string
          journey_title: string
        }[]
      }
      get_public_journey: {
        Args: { p_journey_slug: string; p_space_handle: string }
        Returns: Json
      }
      get_space_invite_preview: {
        Args: { p_raw_token: string }
        Returns: {
          space_avatar_url: string
          space_handle: string
          space_id: string
          space_name: string
        }[]
      }
      has_space_publish_role: { Args: { p_space_id: string }; Returns: boolean }
      is_interactable_target: {
        Args: {
          p_target_id: string
          p_target_type: Database['public']['Enums']['content_target_type']
        }
        Returns: boolean
      }
      is_journey_member: { Args: { p_journey_id: string }; Returns: boolean }
      is_journey_owner: { Args: { p_journey_id: string }; Returns: boolean }
      is_public_photo: { Args: { p_photo_id: string }; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      is_space_owner: { Args: { p_space_id: string }; Returns: boolean }
      is_time_zone_name: { Args: { p_value: string }; Returns: boolean }
      leave_space: { Args: { p_space_id: string }; Returns: undefined }
      list_journey_pending_invites: {
        Args: { p_journey_id: string }
        Returns: {
          created_at: string
          email_normalized: string
          expires_at: string
          id: string
          role: Database['public']['Enums']['journey_member_role']
        }[]
      }
      move_entry_to_space: {
        Args: { p_entry_id: string; p_slug?: string; p_space_id: string }
        Returns: {
          body: string
          created_at: string
          creator_id: string
          event_at: string | null
          id: string
          language: Database['public']['Enums']['entry_language']
          latitude: number | null
          longitude: number | null
          published_at: string | null
          slug: string
          space_id: string
          status: Database['public']['Enums']['entry_status']
          title: string | null
          type: Database['public']['Enums']['entry_type']
          updated_at: string
          version: number
          visibility: Database['public']['Enums']['entry_visibility']
        }[]
        SetofOptions: {
          from: '*'
          to: 'entries'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      move_journey_to_space: {
        Args: { p_journey_id: string; p_slug?: string; p_space_id: string }
        Returns: {
          cover_media_id: string | null
          created_at: string
          creator_id: string
          ends_at: string | null
          home_tz: string | null
          id: string
          slug: string
          space_id: string
          starts_at: string | null
          status: Database['public']['Enums']['journey_status']
          summary: string
          title: string
          updated_at: string
          visibility: Database['public']['Enums']['journey_visibility']
        }[]
        SetofOptions: {
          from: '*'
          to: 'journeys'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_content_slug: {
        Args: { p_id: string; p_value: string }
        Returns: string
      }
      remove_space_member: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: undefined
      }
      revoke_journey_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      revoke_space_invite: { Args: { p_invite_id: string }; Returns: undefined }
      set_entry_photo_cover: {
        Args: { p_entry_id: string; p_photo_id: string }
        Returns: undefined
      }
      set_journey_stop_location: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_map_latitude: number
          p_map_longitude: number
          p_stop_id: string
        }
        Returns: undefined
      }
      update_entry: {
        Args: {
          p_body: string
          p_event_at: string
          p_expected_version: number
          p_id: string
          p_language: Database['public']['Enums']['entry_language']
          p_latitude: number | null
          p_longitude: number | null
          p_status: Database['public']['Enums']['entry_status']
          p_title: string
          p_type: Database['public']['Enums']['entry_type']
          p_visibility: Database['public']['Enums']['entry_visibility']
        }
        Returns: {
          body: string
          created_at: string
          creator_id: string
          event_at: string | null
          id: string
          language: Database['public']['Enums']['entry_language']
          latitude: number | null
          longitude: number | null
          published_at: string | null
          slug: string
          space_id: string
          status: Database['public']['Enums']['entry_status']
          title: string | null
          type: Database['public']['Enums']['entry_type']
          updated_at: string
          version: number
          visibility: Database['public']['Enums']['entry_visibility']
        }[]
        SetofOptions: {
          from: '*'
          to: 'entries'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_journey_moment_assignment: {
        Args: {
          p_entry_id: string
          p_journey_id: string
          p_latitude?: number
          p_location_title?: string
          p_longitude?: number
          p_stage_id?: string
          p_stop_id?: string
        }
        Returns: string
      }
      v2_map_variant_kind: {
        Args: { p_variant: string }
        Returns: Database['public']['Enums']['media_variant_kind']
      }
      v2_migrate_from_v1: { Args: never; Returns: Json }
      v2_variant_priority: { Args: { p_variant: string }; Returns: number }
      v2_verify_migration: {
        Args: never
        Returns: {
          actual: number
          check_name: string
          expected: number
          ok: boolean
        }[]
      }
    }
    Enums: {
      checklist_item_category:
        | 'wildlife'
        | 'flora'
        | 'geology'
        | 'landmark'
        | 'general'
      content_origin: 'manual' | 'suggested' | 'accepted' | 'auto'
      content_target_type: 'journey' | 'entry' | 'photo'
      entry_language: 'cs' | 'en'
      entry_status: 'draft' | 'published'
      entry_type: 'story' | 'tip' | 'note' | 'place'
      entry_visibility: 'public' | 'private'
      journey_member_role: 'owner' | 'editor' | 'member'
      journey_status: 'planning' | 'active' | 'completed'
      journey_stop_status: 'planned' | 'visited'
      journey_visibility: 'public' | 'private'
      media_kind: 'photo' | 'video'
      media_status: 'pending' | 'uploading' | 'ready' | 'failed'
      media_variant_kind:
        | 'thumb'
        | 'small'
        | 'medium'
        | 'large'
        | 'video'
        | 'poster'
      observation_confidence: 'seen' | 'heard' | 'unsure'
      photo_variant_type:
        | 'thumb'
        | 'preview'
        | 'large'
        | 'small'
        | 'medium'
        | 'full'
        | 'video'
      post_kind: 'tip' | 'article'
      segment_kind: 'stage' | 'trip'
      space_kind: 'personal' | 'family'
      space_role: 'owner' | 'editor' | 'member'
      tag_kind: 'category' | 'free' | 'species'
      tagging_target: 'media' | 'moment' | 'post'
      translation_status:
        | 'pending'
        | 'processing'
        | 'succeeded'
        | 'failed'
        | 'stale'
      trip_type: 'trek' | 'day' | 'transfer' | 'stay'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      checklist_item_category: [
        'wildlife',
        'flora',
        'geology',
        'landmark',
        'general',
      ],
      content_origin: ['manual', 'suggested', 'accepted', 'auto'],
      content_target_type: ['journey', 'entry', 'photo'],
      entry_language: ['cs', 'en'],
      entry_status: ['draft', 'published'],
      entry_type: ['story', 'tip', 'note', 'place'],
      entry_visibility: ['public', 'private'],
      journey_member_role: ['owner', 'editor', 'member'],
      journey_status: ['planning', 'active', 'completed'],
      journey_stop_status: ['planned', 'visited'],
      journey_visibility: ['public', 'private'],
      media_kind: ['photo', 'video'],
      media_status: ['pending', 'uploading', 'ready', 'failed'],
      media_variant_kind: [
        'thumb',
        'small',
        'medium',
        'large',
        'video',
        'poster',
      ],
      observation_confidence: ['seen', 'heard', 'unsure'],
      photo_variant_type: [
        'thumb',
        'preview',
        'large',
        'small',
        'medium',
        'full',
        'video',
      ],
      post_kind: ['tip', 'article'],
      segment_kind: ['stage', 'trip'],
      space_kind: ['personal', 'family'],
      space_role: ['owner', 'editor', 'member'],
      tag_kind: ['category', 'free', 'species'],
      tagging_target: ['media', 'moment', 'post'],
      translation_status: [
        'pending',
        'processing',
        'succeeded',
        'failed',
        'stale',
      ],
      trip_type: ['trek', 'day', 'transfer', 'stay'],
    },
  },
} as const
