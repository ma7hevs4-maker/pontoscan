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
      bases: {
        Row: {
          ativo: boolean
          codigo_qr: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          polo: Database["public"]["Enums"]["polo_enum"]
          raio_metros: number
        }
        Insert: {
          ativo?: boolean
          codigo_qr: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          polo: Database["public"]["Enums"]["polo_enum"]
          raio_metros?: number
        }
        Update: {
          ativo?: boolean
          codigo_qr?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          polo?: Database["public"]["Enums"]["polo_enum"]
          raio_metros?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id: string
          nome: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          polo?: Database["public"]["Enums"]["polo_enum"]
          prefixo?: string
        }
        Relationships: []
      }
      registros: {
        Row: {
          base_id: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_enum"]
          id: string
          latitude: number | null
          longitude: number | null
          prefixo_override: string | null
          timestamp: string
          usuario_id: string
        }
        Insert: {
          base_id?: string | null
          created_at?: string
          etapa: Database["public"]["Enums"]["etapa_enum"]
          id?: string
          latitude?: number | null
          longitude?: number | null
          prefixo_override?: string | null
          timestamp?: string
          usuario_id: string
        }
        Update: {
          base_id?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_enum"]
          id?: string
          latitude?: number | null
          longitude?: number | null
          prefixo_override?: string | null
          timestamp?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          polo: Database["public"]["Enums"]["polo_enum"] | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          polo?: Database["public"]["Enums"]["polo_enum"] | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          polo?: Database["public"]["Enums"]["polo_enum"] | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_tempos: {
        Row: {
          dia: string | null
          nome: string | null
          polo: Database["public"]["Enums"]["polo_enum"] | null
          ponto: string | null
          pos_dds: string | null
          prefixo: string | null
          saida_base: string | null
          tempo_ponto_pos_dds: number | null
          tempo_pos_dds_saida: number | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_admin_polo: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["polo_enum"]
      }
      get_user_polo: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["polo_enum"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "ELETRICISTA" | "ADMIN_POLO" | "ADMIN_DISPATCH"
      etapa_enum: "PONTO" | "POS_DDS" | "SAIDA_BASE"
      polo_enum:
        | "Magé"
        | "Niterói"
        | "São Gonçalo"
        | "Serrana"
        | "Sul"
        | "Campos"
        | "Lagos"
        | "Macaé"
        | "Noroeste"
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
      app_role: ["ELETRICISTA", "ADMIN_POLO", "ADMIN_DISPATCH"],
      etapa_enum: ["PONTO", "POS_DDS", "SAIDA_BASE"],
      polo_enum: [
        "Magé",
        "Niterói",
        "São Gonçalo",
        "Serrana",
        "Sul",
        "Campos",
        "Lagos",
        "Macaé",
        "Noroeste",
      ],
    },
  },
} as const
