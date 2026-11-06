import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let url = null;
let key = null;
if (fs.existsSync('.env')) {
    const env = fs.readFileSync('.env', 'utf-8');
    for (let line of env.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.includes('=')) {
            const [k, v] = line.split('=');
            const cleanKey = k.trim();
            const cleanVal = v.trim().replace(/^["']|["']$/g, '');
            if (cleanKey === 'VITE_SUPABASE_URL') url = cleanVal;
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY') key = cleanVal;
        }
    }
}

const supabase = createClient(url, key);

async function updateMarketDataSources() {
    console.log('--- Iniciando atualização dos painéis NASDAQ ---');
    
    // 1. Obter todos os painéis NASDAQ (instance_id = painel_principal)
    const { data: panels, error: panelError } = await supabase
        .from('painelvm_panels')
        .select('id, user_id, name, instance_id, subscription_id')
        .eq('instance_id', 'painel_principal');

    if (panelError) {
        console.error('Erro ao buscar painéis:', panelError);
        return;
    }

    const panelIds = panels.map(p => p.id);
    console.log(`Encontrados ${panelIds.length} painéis com instance_id = 'painel_principal'.`);

    // 2. Buscar configurações que estão com instance_id_market = 'nt8_main'
    const { data: settingsToUpdate, error: settingsError } = await supabase
        .from('painelvm_settings')
        .select('id, panel_id, instance_id_market, instance_id_force, instance_id_screen')
        .in('panel_id', panelIds)
        .eq('instance_id_market', 'nt8_main');

    if (settingsError) {
        console.error('Erro ao buscar configurações:', settingsError);
        return;
    }

    console.log(`Encontradas ${settingsToUpdate.length} configurações com instance_id_market = 'nt8_main'.`);

    if (settingsToUpdate.length === 0) {
        console.log('Nenhuma configuração precisando de atualização.');
        return;
    }

    // 3. Atualizar cada uma para 'painel_principal'
    const settingIds = settingsToUpdate.map(s => s.id);
    
    const { data: updatedData, error: updateError } = await supabase
        .from('painelvm_settings')
        .update({
            instance_id_market: 'painel_principal'
        })
        .in('id', settingIds)
        .select();

    if (updateError) {
        console.error('Erro ao atualizar painelvm_settings:', updateError);
        return;
    }

    console.log(`\nSUCESSO! ${updatedData.length} configurações foram atualizadas para instance_id_market = 'painel_principal'.`);

    // 4. Verificação pós-atualização
    const { data: remainingCheck, error: checkError } = await supabase
        .from('painelvm_settings')
        .select('id, panel_id, instance_id_market')
        .in('panel_id', panelIds)
        .eq('instance_id_market', 'nt8_main');

    if (!checkError) {
        console.log(`Verificação: Restam ${remainingCheck.length} painéis NASDAQ com 'nt8_main'. (Esperado: 0)`);
    }
}

updateMarketDataSources();
