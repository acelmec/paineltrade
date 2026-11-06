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

async function inspectAndExport() {
    console.log("=== INSPECTING GAMMA_LEVELS ===");
    // Get sample row to see keys
    const { data: sample, error: sampleErr } = await supabase.from('gamma_levels').select('*').limit(1);
    if (sampleErr) {
        console.error("Sample error:", sampleErr);
        return;
    }
    if (sample && sample.length > 0) {
        console.log("Columns found in gamma_levels:", Object.keys(sample[0]));
    }

    // Try query with symbol ilike 'MNQ%' or reference_symbol ilike 'MNQ%'
    // First let's check if 'symbol' or 'reference_symbol' exists
    const hasSymbol = sample[0] && ('symbol' in sample[0]);
    const hasRefSymbol = sample[0] && ('reference_symbol' in sample[0]);

    console.log(`hasSymbol: ${hasSymbol}, hasRefSymbol: ${hasRefSymbol}`);

    let query = supabase.from('gamma_levels').select('*');
    if (hasSymbol && hasRefSymbol) {
        query = query.or(`symbol.ilike.MNQ%,reference_symbol.ilike.MNQ%`);
    } else if (hasSymbol) {
        query = query.ilike('symbol', 'MNQ%');
    } else if (hasRefSymbol) {
        query = query.ilike('reference_symbol', 'MNQ%');
    }

    const { data: rows, error: qErr } = await query;
    if (qErr) {
        console.error("Query error:", qErr);
        // Fallback: try raw query or select * without filter to filter in JS if needed
    }

    console.log(`Rows returned for MNQ filter: ${rows ? rows.length : 0}`);

    // If 0 rows for MNQ%, let's also check all symbols available in the table
    const { data: allRows } = await supabase.from('gamma_levels').select('*');
    console.log(`Total rows in gamma_levels: ${allRows ? allRows.length : 0}`);
    if (allRows && allRows.length > 0) {
        const symbolValues = allRows.map(r => ({ symbol: r.symbol, reference_symbol: r.reference_symbol }));
        console.log("All symbol / reference_symbol values:", symbolValues);
    }
}

inspectAndExport();
