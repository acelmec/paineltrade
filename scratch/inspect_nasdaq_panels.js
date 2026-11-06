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

async function run() {
    console.log('--- Buscando auth.users / perfis / sessões ---');
    
    // Obter lista de usuários via auth.admin se service_role permitir
    let authUsers = [];
    try {
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (!error && users) {
            authUsers = users;
        } else {
            console.log('auth.admin.listUsers error:', error?.message);
        }
    } catch (e) {
        console.log('Catch auth.admin:', e.message);
    }

    const userMap = {};
    authUsers.forEach(u => {
        userMap[u.id] = {
            email: u.email,
            created_at: u.created_at,
            raw_user_meta_data: u.user_metadata
        };
    });

    // Buscar painéis
    const { data: panels, error: panelError } = await supabase
        .from('painelvm_panels')
        .select('*');

    if (panelError) {
        console.error('Erro ao buscar painéis:', panelError);
        return;
    }

    // Buscar configurações
    const { data: settings, error: settingsError } = await supabase
        .from('painelvm_settings')
        .select('*');

    if (settingsError) {
        console.error('Erro ao buscar configurações:', settingsError);
        return;
    }

    // Buscar sessões para correlacionar subscription_id / emails se houver
    const { data: sessions } = await supabase
        .from('painelvm_users_sessions')
        .select('*');

    const sessionMap = {};
    if (sessions) {
        sessions.forEach(s => {
            sessionMap[s.user_id] = s.subscription_id;
        });
    }

    const settingsMap = {};
    settings.forEach(s => {
        settingsMap[s.panel_id] = s;
    });

    console.log(`Total de painéis encontrados: ${panels.length}`);
    console.log(`Total de settings encontradas: ${settings.length}`);
    console.log(`Total de usuários auth encontrados: ${authUsers.length}`);

    const nasdaqPanelsWithNt8 = [];
    const allNasdaqPanels = [];

    for (const panel of panels) {
        // Verificar se é painel NASDAQ / painel_principal
        const isNasdaq = panel.instance_id === 'painel_principal' || 
                         (panel.name && panel.name.toLowerCase().includes('nasdaq')) ||
                         (panel.name && panel.name.toLowerCase().includes('principal'));

        const panelSetting = settingsMap[panel.id];
        const userInfo = userMap[panel.user_id] || {};
        const subId = panel.subscription_id || sessionMap[panel.user_id] || 'N/A';

        const row = {
            user_id: panel.user_id,
            email: userInfo.email || 'Email desconhecido',
            subscription_id: subId,
            panel_id: panel.id,
            panel_instance_id: panel.instance_id,
            panel_name: panel.name,
            has_setting: !!panelSetting,
            instance_id_market: panelSetting ? panelSetting.instance_id_market : 'SEM CONFIGURAÇÃO',
            instance_id_force: panelSetting ? panelSetting.instance_id_force : 'SEM CONFIGURAÇÃO',
            instance_id_screen: panelSetting ? panelSetting.instance_id_screen : 'SEM CONFIGURAÇÃO',
            source_market: panelSetting ? panelSetting.source_market : 'N/A',
            created_at: panel.created_at
        };

        if (isNasdaq) {
            allNasdaqPanels.push(row);
            if (!panelSetting || panelSetting.instance_id_market === 'nt8_main' || panelSetting.instance_id_market !== 'painel_principal') {
                nasdaqPanelsWithNt8.push(row);
            }
        }
    }

    console.log('\n======================================================');
    console.log(`TOTAL DE PAINÉIS NASDAQ / PRINCIPAL: ${allNasdaqPanels.length}`);
    console.log(`PAINÉIS NASDAQ QUE PRECISAM DE AJUSTE (instance_id_market = nt8_main ou diferente de painel_principal): ${nasdaqPanelsWithNt8.length}`);
    console.log('======================================================\n');

    console.log('DETALHES DOS PAINÉIS QUE PRECISAM DE AJUSTE:');
    console.table(nasdaqPanelsWithNt8.map(p => ({
        Email: p.email,
        SubId: p.subscription_id,
        PanelName: p.panel_name,
        PanelInstance: p.panel_instance_id,
        MarketDataID: p.instance_id_market,
        PanelID: p.panel_id,
        UserID: p.user_id
    })));

    console.log('\nTODOS OS PAINÉIS NASDAQ CADASTRADOS:');
    console.table(allNasdaqPanels.map(p => ({
        Email: p.email,
        SubId: p.subscription_id,
        PanelName: p.panel_name,
        PanelInstance: p.panel_instance_id,
        MarketDataID: p.instance_id_market,
        PanelID: p.panel_id
    })));
}

run();
