-- MIGRATION: CONTROLE DE PERMISSÕES E INTERVALO GLOBAL DE MERCADO
-- Execute este script no SQL Editor do console do seu Supabase.

-- 1. Adicionar colunas de permissão na tabela de sessões
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_telegram_news BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_alerts BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_operations BOOLEAN DEFAULT false;

-- 2. Função para obter o intervalo global de mercado do admin de forma segura
CREATE OR REPLACE FUNCTION get_admin_market_interval()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  val_text TEXT;
  interval_val INTEGER;
BEGIN
  SELECT val INTO val_text
  FROM (
    SELECT unnest(disabled_levels) as val
    FROM painelvm_settings s
    JOIN painelvm_panels p ON s.panel_id = p.id
    WHERE p.subscription_id = 'admin'
    LIMIT 1
  ) sub
  WHERE val LIKE 'cfg:market_update_interval:%'
  LIMIT 1;

  IF val_text IS NOT NULL THEN
    interval_val := split_part(val_text, ':', 3)::integer;
    RETURN interval_val;
  ELSE
    RETURN 500;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 500;
END;
$$;
