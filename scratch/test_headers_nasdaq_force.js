import fs from 'fs';

let url = "https://db.vemviraramesa.com.br";
let key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";

async function testFetch() {
    console.log("=== TEST 1: Direct fetch with apikey & Bearer key ===");
    const res = await fetch(`${url}/rest/v1/nasdaq_force?select=*&limit=1`, {
        headers: {
            "apikey": key,
            "Authorization": `Bearer ${key}`
        }
    });
    const data = await res.json();
    console.log("Response status:", res.status);
    console.log("Response data:", data);
}

testFetch();
