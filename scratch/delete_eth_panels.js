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

async function deleteEthPanels() {
    console.log('--- Iniciando deleção dos painéis ETHUSD ---');
    
    // 1. Buscar todos os painéis ETHUSD
    const { data: ethPanels, error: searchError } = await supabase
        .from('painelvm_panels')
        .select('id, name, instance_id, subscription_id')
        .or('name.ilike.%eth%,instance_id.ilike.%eth%');

    if (searchError) {
        console.error('Erro ao buscar painéis ETH:', searchError);
        return;
    }

    console.log(`Encontrados ${ethPanels.length} painéis ETHUSD para remoção.`);

    if (ethPanels.length === 0) {
        console.log('Nenhum painel ETH encontrado para deletar.');
        return;
    }

    const panelIds = ethPanels.map(p => p.id);

    // 2. Executar delete
    const { data: deleted, error: deleteError } = await supabase
        .from('painelvm_panels')
        .delete()
        .in('id', panelIds)
        .select();

    if (deleteError) {
        console.error('Erro ao deletar painéis ETH:', deleteError);
        return;
    }

    console.log(`SUCESSO! ${deleted.length} painéis ETHUSD foram deletados.`);

    // 3. Verificação pós-delete
    const { data: remaining, error: checkError } = await supabase
        .from('painelvm_panels')
        .select('id, name, instance_id')
        .or('name.ilike.%eth%,instance_id.ilike.%eth%');

    if (!checkError) {
        console.log(`Verificação: Restam ${remaining.length} painéis ETHUSD no banco. (Esperado: 0)`);
    }
}

deleteEthPanels();
