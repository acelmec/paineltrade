const fs = require('fs');
const path = require('path');

function updateSenderSupabase(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace URL in EnviarCandleFechadoParaSupabase
  content = content.replace(
    'string url = cleanUrl + "/rest/v1/nasdaq_force";',
    'string url = cleanUrl + "/rest/v1/painelvm_forces_1m?on_conflict=instance_id,timestamp";'
  );

  // Fix typo if present
  content = content.replace('string json = "{\\";', 'string json = "{";');

  // Add timestamp field to JSON in EnviarCandleFechadoParaSupabase
  if (!content.includes('json += "\\"timestamp\\":\\""')) {
    content = content.replace(
      'string json = "{";\r\n   json += "\\"instance_id\\":\\"" + Instance_ID + "\\",";',
      'string timeIso = FormatAdjustedISO(closedTime > 0 ? closedTime : TimeCurrent());\r\n   string json = "{";\r\n   json += "\\"instance_id\\":\\"" + Instance_ID + "\\",";\r\n   json += "\\"timestamp\\":\\"" + timeIso + "\\",";'
    );
    content = content.replace(
      'string json = "{";\n   json += "\\"instance_id\\":\\"" + Instance_ID + "\\",";',
      'string timeIso = FormatAdjustedISO(closedTime > 0 ? closedTime : TimeCurrent());\n   string json = "{";\n   json += "\\"instance_id\\":\\"" + Instance_ID + "\\",";\n   json += "\\"timestamp\\":\\"" + timeIso + "\\",";'
    );
  }

  // Update headers to merge duplicates
  content = content.replace(
    '"Prefer: return=minimal\\r\\n";',
    '"Prefer: resolution=merge-duplicates\\r\\n";'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated:', filePath);
}

function updateSenderSupabaseV2(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(
    'string url = baseUrl + "/rest/v1/nasdaq_force";',
    'string url = baseUrl + "/rest/v1/painelvm_forces_1m?on_conflict=instance_id,timestamp";'
  );

  if (!content.includes('timestamp')) {
    content = content.replace(
      'string fullPayload = rawJson + ",\\"updated_at\\":\\"" + updatedAtIso + "\\"}";',
      'string fullPayload = rawJson + ",\\"timestamp\\":\\"" + updatedAtIso + "\\",\\"updated_at\\":\\"" + updatedAtIso + "\\"}";'
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated:', filePath);
}

const baseDir = 'c:/Users/Pichau/Projetos React/VortexWeb';
updateSenderSupabase(path.join(baseDir, 'Indicadores/Metatrader 4/SenderSupabase.mq4'));
updateSenderSupabase(path.join(baseDir, 'experts/SenderSupabase.mq4'));
updateSenderSupabaseV2(path.join(baseDir, 'Indicadores/Metatrader 4/SenderSupabase_v2.mq4'));
