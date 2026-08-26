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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          chave: string
          updated_at: string
          valor: boolean
        }
        Insert: {
          chave: string
          updated_at?: string
          valor?: boolean
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: boolean
        }
        Relationships: []
      }
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
      equipe_area_logs: {
        Row: {
          acao: string
          area_anterior: Database["public"]["Enums"]["area_atuacao_enum"] | null
          area_nova: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at: string
          dia: string
          gerada: boolean
          id: string
          numero_incidente: string | null
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          area_anterior?:
            | Database["public"]["Enums"]["area_atuacao_enum"]
            | null
          area_nova?: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at?: string
          dia: string
          gerada?: boolean
          id?: string
          numero_incidente?: string | null
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          area_anterior?:
            | Database["public"]["Enums"]["area_atuacao_enum"]
            | null
          area_nova?: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at?: string
          dia?: string
          gerada?: boolean
          id?: string
          numero_incidente?: string | null
          polo?: Database["public"]["Enums"]["polo_enum"]
          prefixo?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      equipe_areas: {
        Row: {
          ajustado: boolean
          area: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at: string
          dia: string
          gerada: boolean
          id: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          updated_at: string
        }
        Insert: {
          ajustado?: boolean
          area?: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at?: string
          dia?: string
          gerada?: boolean
          id?: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          updated_at?: string
        }
        Update: {
          ajustado?: boolean
          area?: Database["public"]["Enums"]["area_atuacao_enum"] | null
          created_at?: string
          dia?: string
          gerada?: boolean
          id?: string
          polo?: Database["public"]["Enums"]["polo_enum"]
          prefixo?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipe_incidentes: {
        Row: {
          alimentador: string | null
          created_at: string
          dia: string
          id: string
          numero_incidente: string
          polo: Database["public"]["Enums"]["polo_enum"]
          ponto_eletrico: string | null
          prefixo: string
          usuario_id: string | null
        }
        Insert: {
          alimentador?: string | null
          created_at?: string
          dia?: string
          id?: string
          numero_incidente: string
          polo: Database["public"]["Enums"]["polo_enum"]
          ponto_eletrico?: string | null
          prefixo: string
          usuario_id?: string | null
        }
        Update: {
          alimentador?: string | null
          created_at?: string
          dia?: string
          id?: string
          numero_incidente?: string
          polo?: Database["public"]["Enums"]["polo_enum"]
          ponto_eletrico?: string | null
          prefixo?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      equipe_membros_override: {
        Row: {
          created_at: string
          dia: string
          id: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dia?: string
          id?: string
          polo: Database["public"]["Enums"]["polo_enum"]
          prefixo: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          dia?: string
          id?: string
          polo?: Database["public"]["Enums"]["polo_enum"]
          prefixo?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      form_questions: {
        Row: {
          ativa: boolean
          campo_tipo: string
          chave: string
          created_at: string
          id: string
          obrigatoria: boolean
          opcoes: Json
          ordem: number
          parent_chave: string | null
          parent_valores: Json
          permite_outro: boolean
          rotulo: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          campo_tipo: string
          chave: string
          created_at?: string
          id?: string
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          parent_chave?: string | null
          parent_valores?: Json
          permite_outro?: boolean
          rotulo: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          campo_tipo?: string
          chave?: string
          created_at?: string
          id?: string
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          parent_chave?: string | null
          parent_valores?: Json
          permite_outro?: boolean
          rotulo?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_tipos: {
        Row: {
          ativo: boolean
          builtin: boolean
          chave: string
          created_at: string
          ordem: number
          rotulo: string
        }
        Insert: {
          ativo?: boolean
          builtin?: boolean
          chave: string
          created_at?: string
          ordem?: number
          rotulo: string
        }
        Update: {
          ativo?: boolean
          builtin?: boolean
          chave?: string
          created_at?: string
          ordem?: number
          rotulo?: string
        }
        Relationships: []
      }
      incidentes: {
        Row: {
          created_at: string
          dados: Json
          fotos: string[]
          id: string
          latitude: number | null
          longitude: number | null
          nome_colaborador: string | null
          numero_incidente: string
          origem: Database["public"]["Enums"]["origem_incidente_enum"]
          parceira: string | null
          polo_eletricista: Database["public"]["Enums"]["polo_enum"] | null
          polo_geo: Database["public"]["Enums"]["polo_enum"] | null
          polo_prefixo: Database["public"]["Enums"]["polo_enum"] | null
          prefixo: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          dados?: Json
          fotos?: string[]
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_colaborador?: string | null
          numero_incidente: string
          origem?: Database["public"]["Enums"]["origem_incidente_enum"]
          parceira?: string | null
          polo_eletricista?: Database["public"]["Enums"]["polo_enum"] | null
          polo_geo?: Database["public"]["Enums"]["polo_enum"] | null
          polo_prefixo?: Database["public"]["Enums"]["polo_enum"] | null
          prefixo: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          dados?: Json
          fotos?: string[]
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_colaborador?: string | null
          numero_incidente?: string
          origem?: Database["public"]["Enums"]["origem_incidente_enum"]
          parceira?: string | null
          polo_eletricista?: Database["public"]["Enums"]["polo_enum"] | null
          polo_geo?: Database["public"]["Enums"]["polo_enum"] | null
          polo_prefixo?: Database["public"]["Enums"]["polo_enum"] | null
          prefixo?: string
          tipo?: string
          usuario_id?: string | null
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
      solicitacoes_senha: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          created_at: string
          id: string
          nome: string
          polo: Database["public"]["Enums"]["polo_enum"] | null
          prefixo: string
          status: string
          updated_at: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          created_at?: string
          id?: string
          nome: string
          polo?: Database["public"]["Enums"]["polo_enum"] | null
          prefixo: string
          status?: string
          updated_at?: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          created_at?: string
          id?: string
          nome?: string
          polo?: Database["public"]["Enums"]["polo_enum"] | null
          prefixo?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      vw_incidentes_admin: {
        Row: {
          created_at: string | null
          dados: Json | null
          fotos: string[] | null
          id: string | null
          latitude: number | null
          longitude: number | null
          nome_colaborador: string | null
          numero_incidente: string | null
          origem: Database["public"]["Enums"]["origem_incidente_enum"] | null
          parceira: string | null
          polo_eletricista: Database["public"]["Enums"]["polo_enum"] | null
          polo_geo: Database["public"]["Enums"]["polo_enum"] | null
          polo_prefixo: Database["public"]["Enums"]["polo_enum"] | null
          prefixo: string | null
          prefixo_efetivo: string | null
          tipo: string | null
          usuario_id: string | null
        }
        Relationships: []
      }
      vw_registros_admin: {
        Row: {
          base_id: string | null
          base_nome: string | null
          base_polo: Database["public"]["Enums"]["polo_enum"] | null
          etapa: Database["public"]["Enums"]["etapa_enum"] | null
          id: string | null
          latitude: number | null
          longitude: number | null
          nome: string | null
          prefixo: string | null
          prefixo_efetivo: string | null
          prefixo_override: string | null
          timestamp: string | null
          user_polo: Database["public"]["Enums"]["polo_enum"] | null
          usuario_id: string | null
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
      vw_tempos: {
        Row: {
          base_polo: Database["public"]["Enums"]["polo_enum"] | null
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
      user_has_registro_no_polo: {
        Args: {
          _polo: Database["public"]["Enums"]["polo_enum"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "ELETRICISTA" | "ADMIN_POLO" | "ADMIN_DISPATCH"
      area_atuacao_enum: "BT" | "MT_RAMAL" | "MT_TRONCO" | "INATIVA"
      etapa_enum: "PONTO" | "POS_DDS" | "SAIDA_BASE"
      origem_incidente_enum: "INSOURCING" | "PARCEIRA"
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
        | "Perdas"
        | "Comercial"
      tipo_incidente_enum: "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO"
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
      area_atuacao_enum: ["BT", "MT_RAMAL", "MT_TRONCO", "INATIVA"],
      etapa_enum: ["PONTO", "POS_DDS", "SAIDA_BASE"],
      origem_incidente_enum: ["INSOURCING", "PARCEIRA"],
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
        "Perdas",
        "Comercial",
      ],
      tipo_incidente_enum: ["ATENDIMENTO_INDIVIDUAL", "ORDEM_2", "IMPRODUTIVO"],
    },
  },
} as const
