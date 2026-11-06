import fs from 'fs';

let url = "https://db.vemviraramesa.com.br";
let key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";

async function testMt4Post() {
    console.log("=== TESTING MT4 HTTP POST WEBREQUEST ===");
    const fullUrl = `${url}/rest/v1/nasdaq_force?on_conflict=instance_id`;
    
    const body = JSON.stringify({
        instance_id: "painel_principal",
        nasdaq_compra: 36,
        nasdaq_venda: 64,
        sp500_compra: 41,
        sp500_venda: 59,
        usdindex_compra: 47,
        usdindex_venda: 53,
        vix_compra: 15,
        vix_venda: 85,
        nvidia_compra: 32,
        nvidia_venda: 68,
        microsoft_compra: 28,
        microsoft_venda: 72,
        apple_compra: 34,
        apple_venda: 66,
        meta_compra: 35,
        meta_venda: 65,
        amazon_compra: 23,
        amazon_venda: 77,
        alphabet_compra: 57,
        alphabet_venda: 43,
        tesla_compra: 38,
        tesla_venda: 62,
        forca_final_compra: 49,
        forca_final_venda: 51,
        direcao: -1,
        nasdaq_aberto: false,
        modo: "off-hours",
        updated_at: new Date().toISOString()
    });

    try {
        const res = await fetch(fullUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": key,
                "Authorization": `Bearer ${key}`,
                "Prefer": "resolution=merge-duplicates,return=minimal"
            },
            body
        });

        console.log("HTTP Status:", res.status);
        console.log("Response text:", await res.text());
    } catch (e) {
        console.error("HTTP Fetch Error:", e);
    }
}

testMt4Post();
