const fs = require('fs');

const url = "https://edbfyjhbctbxhnqfvrgt.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkYmZ5amhiY3RieGhucWZ2cmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDIyNjgsImV4cCI6MjEwNjk3ODI2OH0.rxcVQF0RXP58lwxe1JsBcs1CM0woZzwclmcTeSli_ro";

// Insertion order matters because of foreign keys!
const tables = [
  "public_adjusters",
  "carrier_representatives",
  "external_actors",
  "insureds",
  "claims",
  "claim_carrier_representatives",
  "claim_external_actors",
  "events",
  "event_slots",
  "event_participants",
  "coordination_logs",
  "app_settings"
];

function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function run() {
  let sql = "-- ==============================================================\n";
  sql += "-- DATA BACKUP EXPORTED FROM PREVIOUS SUPABASE PROJECT\n";
  sql += "-- Run this AFTER running schema.sql\n";
  sql += "-- ==============================================================\n\n";

  for (const t of tables) {
    const res = await fetch(`${url}/rest/v1/${t}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const rows = await res.json();
    if (rows && rows.length > 0) {
      sql += `-- Table: public.${t} (${rows.length} rows)\n`;
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const vals = cols.map(c => sqlVal(row[c]));
        sql += `INSERT INTO public.${t} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;\n`;
      }
      sql += "\n";
    }
  }

  fs.writeFileSync("supabase/data_backup.sql", sql);
  console.log("Successfully generated supabase/data_backup.sql");
}

run().catch(console.error);
