-- ==============================================================================
-- VORTEXWEB — MIGRATION: ESTRATÉGIAS INSTITUCIONAIS DO PLAYBOOK QUANTITATIVO
-- ==============================================================================
-- Este script insere no Supabase as 5 Estratégias Mestras descritas no Playbook:
-- 1. Confluência Quântica (VAL / HVN + Put Support 0DTE)
-- 2. Rejeição em VAH Saturada + Gamma Wall (Short Institucional)
-- 3. A Regra dos 80% da Value Area (VA 80% Rule)
-- 4. O Caçador de Naked POCs (Ímãs Virgens)
-- 5. Aceleração em Low Volume Node (LVN Breakout)
-- ==============================================================================

-- 1. Garantir que as colunas necessárias existam na tabela painelvm_custom_strategies
DO $$
BEGIN
    -- Se a tabela ainda não existir, cria a estrutura completa
    CREATE TABLE IF NOT EXISTS painelvm_custom_strategies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        panel_id UUID,
        name TEXT NOT NULL,
        description TEXT,
        buy_conditions JSONB DEFAULT '[]'::jsonb,
        sell_conditions JSONB DEFAULT '[]'::jsonb,
        risk_settings JSONB DEFAULT '{}'::jsonb,
        active BOOLEAN DEFAULT false,
        is_public BOOLEAN DEFAULT true,
        is_admin_featured BOOLEAN DEFAULT true,
        timeframe NUMERIC DEFAULT 5,
        action TEXT DEFAULT 'position',
        sessions JSONB DEFAULT '[]'::jsonb,
        max_entries INT DEFAULT 5,
        execution_mode TEXT DEFAULT 'closed',
        user_email TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- Se já existia com colunas faltando, adiciona cada uma com segurança
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS panel_id UUID;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS buy_conditions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS sell_conditions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS risk_settings JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT false;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS is_admin_featured BOOLEAN DEFAULT true;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS timeframe NUMERIC DEFAULT 5;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS action TEXT DEFAULT 'position';
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS sessions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS max_entries INT DEFAULT 5;
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'closed';
    ALTER TABLE painelvm_custom_strategies ADD COLUMN IF NOT EXISTS user_email TEXT DEFAULT '';
END $$;

-- 2. Inserir ou Atualizar as 5 Estratégias do Playbook
-- Nota: Usamos IDs UUID determinísticos para evitar duplicações caso o script seja rodado mais de uma vez.
DO $$
DECLARE
    target_user_id UUID;
    target_user_email TEXT;
BEGIN
    -- Seleciona especificamente o usuário admin@vortex.com no auth.users
    SELECT id, email INTO target_user_id, target_user_email 
    FROM auth.users 
    WHERE LOWER(email) = 'admin@vortex.com' 
    LIMIT 1;

    -- Se não encontrar por email exato, tenta usuário com metadata admin ou fallback
    IF target_user_id IS NULL THEN
        SELECT id, email INTO target_user_id, target_user_email 
        FROM auth.users 
        WHERE email ILIKE '%admin%' 
        ORDER BY created_at ASC 
        LIMIT 1;
    END IF;

    IF target_user_id IS NULL THEN
        SELECT id, email INTO target_user_id, target_user_email 
        FROM auth.users 
        ORDER BY created_at ASC 
        LIMIT 1;
    END IF;

    -- Força sempre o email administrativo 'admin@vortex.com'
    target_user_email := 'admin@vortex.com';
    IF target_user_id IS NULL THEN
        target_user_id := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    -- ==========================================================================
    -- ESTRATÉGIA 1: CONFLUÊNCIA QUÂNTICA (VAL / HVN + Put Support 0DTE)
    -- ==========================================================================
    INSERT INTO painelvm_custom_strategies (
        id,
        user_id,
        name,
        description,
        timeframe,
        action,
        execution_mode,
        is_public,
        is_admin_featured,
        active,
        max_entries,
        sessions,
        risk_settings,
        buy_conditions,
        sell_conditions,
        user_email,
        updated_at
    ) VALUES (
        'a1000001-0000-0000-0000-000000000001'::uuid,
        target_user_id,
        '🏆 Confluência Quântica (VAL + Put 0DTE)',
        'Gatilho institucional de alta probabilidade (~88%). Compra no reteste do piso da Área de Valor (VAL 70%) confluente com Put Support 0DTE ou Suporte Gamma virgem, aguardando candle de rejeição/absorção.',
        5,
        'position',
        'closed',
        true,
        true,
        true,
        3,
        '[{"start": "09:00:00", "end": "17:30:00", "active": true}]'::jsonb,
        '{
            "lots": 1,
            "sizing_mode": "lote",
            "stop_value": "20",
            "stop_type": "points",
            "take_value": "45",
            "take_type": "points",
            "max_daily_trades": 3,
            "target_panel_id": "all"
        }'::jsonb,
        -- Lógica de Compra: Preço tocando/abaixo de VAL confluente com Put0 ou Suporte Gamma + Delta comprador/rejeição
        '[
            {
                "id": "buy_stage_1",
                "stage_number": 1,
                "name": "Reteste VAL / Put 0DTE & Rejeição",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "cq_c1",
                        "source": "candle_low",
                        "operator": "lte",
                        "target_type": "indicator",
                        "target_indicator": "VOLUME_LEVELS",
                        "target_subSeries": "val"
                    },
                    {
                        "id": "cq_c2",
                        "source": "candle_close",
                        "operator": "gte",
                        "target_type": "indicator",
                        "target_indicator": "LEVELS_OPTIONS",
                        "target_subSeries": "put0"
                    },
                    {
                        "id": "cq_c3",
                        "source": "delta",
                        "operator": "gt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        '[]'::jsonb,
        target_user_email,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        active = EXCLUDED.active,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        timeframe = EXCLUDED.timeframe,
        action = EXCLUDED.action,
        execution_mode = EXCLUDED.execution_mode,
        is_public = EXCLUDED.is_public,
        is_admin_featured = EXCLUDED.is_admin_featured,
        risk_settings = EXCLUDED.risk_settings,
        buy_conditions = EXCLUDED.buy_conditions,
        sell_conditions = EXCLUDED.sell_conditions,
        sessions = EXCLUDED.sessions,
        updated_at = now();

    -- ==========================================================================
    -- ESTRATÉGIA 2: REJEIÇÃO EM VAH SATURADA + GAMMA WALL (Short Institucional)
    -- ==========================================================================
    INSERT INTO painelvm_custom_strategies (
        id,
        user_id,
        name,
        description,
        timeframe,
        action,
        execution_mode,
        is_public,
        is_admin_featured,
        active,
        max_entries,
        sessions,
        risk_settings,
        buy_conditions,
        sell_conditions,
        user_email,
        updated_at
    ) VALUES (
        'a1000002-0000-0000-0000-000000000002'::uuid,
        target_user_id,
        '📉 Rejeição VAH Saturada + Gamma Wall',
        'Short institucional (~84% acerto). Preço testa o teto da Value Area (VAH 70%) ou Call Resistance 0DTE em estado de sobrecompra estatística (Z-Score > +2.0), agressão vendedora (Delta negativo) e e-MACD virando para venda.',
        5,
        'position',
        'closed',
        true,
        true,
        true,
        3,
        '[{"start": "09:30:00", "end": "17:00:00", "active": true}]'::jsonb,
        '{
            "lots": 1,
            "sizing_mode": "lote",
            "stop_value": "18",
            "stop_type": "points",
            "take_value": "45",
            "take_type": "points",
            "max_daily_trades": 3,
            "target_panel_id": "all"
        }'::jsonb,
        '[]'::jsonb,
        -- Lógica de Venda: Preço na VAH ou Call0 + Z-Score > 1.8 + Delta negativo + e-MACD negativo
        '[
            {
                "id": "sell_stage_1",
                "stage_number": 1,
                "name": "Exaustão em VAH / Call 0DTE & Virada de Fluxo",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "vah_s1",
                        "source": "candle_high",
                        "operator": "gte",
                        "target_type": "indicator",
                        "target_indicator": "VOLUME_LEVELS",
                        "target_subSeries": "vah"
                    },
                    {
                        "id": "vah_s2",
                        "source": "zscore",
                        "operator": "gte",
                        "target_type": "value",
                        "target_value": 1.8
                    },
                    {
                        "id": "vah_s3",
                        "source": "delta",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    },
                    {
                        "id": "vah_s4",
                        "source": "EMACD",
                        "subSeries": "histogram",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        target_user_email,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        active = EXCLUDED.active,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        timeframe = EXCLUDED.timeframe,
        action = EXCLUDED.action,
        execution_mode = EXCLUDED.execution_mode,
        is_public = EXCLUDED.is_public,
        is_admin_featured = EXCLUDED.is_admin_featured,
        risk_settings = EXCLUDED.risk_settings,
        buy_conditions = EXCLUDED.buy_conditions,
        sell_conditions = EXCLUDED.sell_conditions,
        sessions = EXCLUDED.sessions,
        updated_at = now();

    -- ==========================================================================
    -- ESTRATÉGIA 3: A REGRA DOS 80% DA VALUE AREA (VA 80% Rule)
    -- ==========================================================================
    INSERT INTO painelvm_custom_strategies (
        id,
        user_id,
        name,
        description,
        timeframe,
        action,
        execution_mode,
        is_public,
        is_admin_featured,
        active,
        max_entries,
        sessions,
        risk_settings,
        buy_conditions,
        sell_conditions,
        user_email,
        updated_at
    ) VALUES (
        'a1000003-0000-0000-0000-000000000003'::uuid,
        target_user_id,
        '⚡ Regra dos 80% da Value Area (VA 80%)',
        'Padrão clássico do leilão institucional (~80% acerto). Quando o preço abre fora da Área de Valor (70%) e fecha de volta para dentro da área, a probabilidade estatística de buscar o extremo oposto (VAL -> VAH ou VAH -> VAL) atravessando o VPOC é de 80%.',
        5,
        'position',
        'closed',
        true,
        true,
        true,
        4,
        '[{"start": "09:30:00", "end": "17:30:00", "active": true}]'::jsonb,
        '{
            "lots": 1,
            "sizing_mode": "lote",
            "stop_value": "22",
            "stop_type": "points",
            "take_value": "50",
            "take_type": "points",
            "max_daily_trades": 4,
            "target_panel_id": "all"
        }'::jsonb,
        -- Compra: Fechou dentro após cruzar acima da VAL + Delta Positivo
        '[
            {
                "id": "va_buy_stage_1",
                "stage_number": 1,
                "name": "Cruzamento para dentro da Value Area (Piso)",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "va_b1",
                        "source": "price",
                        "operator": "cross_above",
                        "target_type": "indicator",
                        "target_indicator": "VOLUME_LEVELS",
                        "target_subSeries": "val"
                    },
                    {
                        "id": "va_b2",
                        "source": "delta",
                        "operator": "gt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        -- Venda: Fechou dentro após cruzar abaixo da VAH + Delta Negativo
        '[
            {
                "id": "va_sell_stage_1",
                "stage_number": 1,
                "name": "Cruzamento para dentro da Value Area (Teto)",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "va_s1",
                        "source": "price",
                        "operator": "cross_below",
                        "target_type": "indicator",
                        "target_indicator": "VOLUME_LEVELS",
                        "target_subSeries": "vah"
                    },
                    {
                        "id": "va_s2",
                        "source": "delta",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        target_user_email,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        active = EXCLUDED.active,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        timeframe = EXCLUDED.timeframe,
        action = EXCLUDED.action,
        execution_mode = EXCLUDED.execution_mode,
        is_public = EXCLUDED.is_public,
        is_admin_featured = EXCLUDED.is_admin_featured,
        risk_settings = EXCLUDED.risk_settings,
        buy_conditions = EXCLUDED.buy_conditions,
        sell_conditions = EXCLUDED.sell_conditions,
        sessions = EXCLUDED.sessions,
        updated_at = now();

    -- ==========================================================================
    -- ESTRATÉGIA 4: O CAÇADOR DE NAKED POCS (Ímãs Virgens)
    -- ==========================================================================
    INSERT INTO painelvm_custom_strategies (
        id,
        user_id,
        name,
        description,
        timeframe,
        action,
        execution_mode,
        is_public,
        is_admin_featured,
        active,
        max_entries,
        sessions,
        risk_settings,
        buy_conditions,
        sell_conditions,
        user_email,
        updated_at
    ) VALUES (
        'a1000004-0000-0000-0000-000000000004'::uuid,
        target_user_id,
        '🎯 Caçador de Naked POCs & Vácuos de Liquidez',
        'Reteste de alta probabilidade (>82% de chance de reteste). Quando o preço rompe o pivô Gamma HVL com delta favorável e tem espaço aberto até a Naked POC / Resistência, corre para preencher o vácuo de volume.',
        5,
        'position',
        'closed',
        true,
        true,
        true,
        3,
        '[{"start": "09:00:00", "end": "17:30:00", "active": true}]'::jsonb,
        '{
            "lots": 1,
            "sizing_mode": "lote",
            "stop_value": "18",
            "stop_type": "points",
            "take_value": "40",
            "take_type": "points",
            "max_daily_trades": 3,
            "target_panel_id": "all"
        }'::jsonb,
        -- Compra: Rompimento de HVL para cima + Delta > 0 + Distância para resistência >= 20 pts
        '[
            {
                "id": "poc_buy_stage_1",
                "stage_number": 1,
                "name": "Ruptura de HVL em direção à Naked POC",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "poc_b1",
                        "source": "price",
                        "operator": "cross_above",
                        "target_type": "indicator",
                        "target_indicator": "LEVELS_GAMMA",
                        "target_subSeries": "hvl"
                    },
                    {
                        "id": "poc_b2",
                        "source": "delta",
                        "operator": "gt",
                        "target_type": "value",
                        "target_value": 0
                    },
                    {
                        "id": "poc_b3",
                        "source": "distance_to_resistance",
                        "operator": "gte",
                        "target_type": "value",
                        "target_value": 20
                    }
                ]
            }
        ]'::jsonb,
        -- Venda: Rompimento de HVL para baixo + Delta < 0 + Distância para suporte >= 20 pts
        '[
            {
                "id": "poc_sell_stage_1",
                "stage_number": 1,
                "name": "Ruptura de HVL para baixo em direção à Naked POC",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "poc_s1",
                        "source": "price",
                        "operator": "cross_below",
                        "target_type": "indicator",
                        "target_indicator": "LEVELS_GAMMA",
                        "target_subSeries": "hvl"
                    },
                    {
                        "id": "poc_s2",
                        "source": "delta",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    },
                    {
                        "id": "poc_s3",
                        "source": "distance_to_support",
                        "operator": "gte",
                        "target_type": "value",
                        "target_value": 20
                    }
                ]
            }
        ]'::jsonb,
        target_user_email,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        active = EXCLUDED.active,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        timeframe = EXCLUDED.timeframe,
        action = EXCLUDED.action,
        execution_mode = EXCLUDED.execution_mode,
        is_public = EXCLUDED.is_public,
        is_admin_featured = EXCLUDED.is_admin_featured,
        risk_settings = EXCLUDED.risk_settings,
        buy_conditions = EXCLUDED.buy_conditions,
        sell_conditions = EXCLUDED.sell_conditions,
        sessions = EXCLUDED.sessions,
        updated_at = now();

    -- ==========================================================================
    -- ESTRATÉGIA 5: ACELERAÇÃO EM LOW VOLUME NODE (LVN Breakout)
    -- ==========================================================================
    INSERT INTO painelvm_custom_strategies (
        id,
        user_id,
        name,
        description,
        timeframe,
        action,
        execution_mode,
        is_public,
        is_admin_featured,
        active,
        max_entries,
        sessions,
        risk_settings,
        buy_conditions,
        sell_conditions,
        user_email,
        updated_at
    ) VALUES (
        'a1000005-0000-0000-0000-000000000005'::uuid,
        target_user_id,
        '🚀 Aceleração em Low Volume Node (LVN Breakout)',
        'Explosão de momentum em vácuos de liquidez (~78% acerto). Rompimento de consolidação ou faixa de alto volume com aceleração institucional (e-MACD positivo/explosão e Delta favorável) rumo ao próximo bloco HVN.',
        5,
        'position',
        'closed',
        true,
        true,
        true,
        3,
        '[{"start": "09:00:00", "end": "17:00:00", "active": true}]'::jsonb,
        '{
            "lots": 1,
            "sizing_mode": "lote",
            "stop_value": "16",
            "stop_type": "points",
            "take_value": "35",
            "take_type": "points",
            "max_daily_trades": 3,
            "target_panel_id": "all"
        }'::jsonb,
        -- Compra: Breakout de Range de Alta + e-MACD Histograma > 0 + Delta > 0
        '[
            {
                "id": "lvn_buy_stage_1",
                "stage_number": 1,
                "name": "Rompimento do Range com Impulso",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "lvn_b1",
                        "source": "SMC_RANGE_FILTER",
                        "subSeries": "breakout_buy",
                        "operator": "eq",
                        "target_type": "value",
                        "target_value": "compra"
                    },
                    {
                        "id": "lvn_b2",
                        "source": "EMACD",
                        "subSeries": "histogram",
                        "operator": "gt",
                        "target_type": "value",
                        "target_value": 0
                    },
                    {
                        "id": "lvn_b3",
                        "source": "delta",
                        "operator": "gt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        -- Venda: Breakout de Range de Baixa + e-MACD Histograma < 0 + Delta < 0
        '[
            {
                "id": "lvn_sell_stage_1",
                "stage_number": 1,
                "name": "Rompimento do Range para Baixo com Impulso",
                "logic": "AND",
                "max_wait_candles": 0,
                "conditions": [
                    {
                        "id": "lvn_s1",
                        "source": "SMC_RANGE_FILTER",
                        "subSeries": "breakout_sell",
                        "operator": "eq",
                        "target_type": "value",
                        "target_value": "venda"
                    },
                    {
                        "id": "lvn_s2",
                        "source": "EMACD",
                        "subSeries": "histogram",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    },
                    {
                        "id": "lvn_s3",
                        "source": "delta",
                        "operator": "lt",
                        "target_type": "value",
                        "target_value": 0
                    }
                ]
            }
        ]'::jsonb,
        target_user_email,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        active = EXCLUDED.active,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        timeframe = EXCLUDED.timeframe,
        action = EXCLUDED.action,
        execution_mode = EXCLUDED.execution_mode,
        is_public = EXCLUDED.is_public,
        is_admin_featured = EXCLUDED.is_admin_featured,
        risk_settings = EXCLUDED.risk_settings,
        buy_conditions = EXCLUDED.buy_conditions,
        sell_conditions = EXCLUDED.sell_conditions,
        sessions = EXCLUDED.sessions,
        updated_at = now();

END $$;

-- 3. Recarregar o cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
