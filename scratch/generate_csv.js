import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

function escapeCsvField(val) {
    if (val === null || val === undefined) return '';
    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    // If str contains quotes, newlines, or commas, wrap in quotes and double internal quotes
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

async function run() {
    console.log("Executando SELECT * FROM gamma_levels WHERE symbol LIKE 'MNQ%'...");
    
    // Fetch all matching records (handling pagination if needed)
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
        const { data, error } = await supabase
            .from('gamma_levels')
            .select('*')
            .like('symbol', 'MNQ%')
            .order('id', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error) {
            console.error("Erro na consulta Supabase:", error);
            process.exit(1);
        }
        
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        page++;
    }

    console.log(`Total de registros retornados: ${allData.length}`);

    if (allData.length === 0) {
        console.log("Nenhum dado encontrado.");
        return;
    }

    // Get column headers
    const headers = Object.keys(allData[0]);
    
    // Build CSV content
    const csvRows = [];
    // Header row
    csvRows.push(headers.map(h => escapeCsvField(h)).join(','));

    // Data rows
    for (const row of allData) {
        const rowFields = headers.map(h => escapeCsvField(row[h]));
        csvRows.push(rowFields.join(','));
    }

    const csvContent = csvRows.join('\n');
    const outputPath = path.join(process.cwd(), 'gamma_levels_mnq.csv');
    
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    console.log(`Arquivo CSV gerado com sucesso em: ${outputPath}`);
    console.log(`Tamanho do arquivo: ${fs.statSync(outputPath).size} bytes`);
}

run();
