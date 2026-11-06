const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('src/components/CopyTradingDashboard.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace('  const [formCopyAtmStrategy, setFormCopyAtmStrategy] = useState(true);\n', '');
content = content.replace('    setFormCopyAtmStrategy(true);\n', '');
content = content.replace('    setFormCopyAtmStrategy(rule.copy_atm_strategy !== false);\n', '');

fs.writeFileSync(targetPath, content, 'utf8');
console.log('formCopyAtmStrategy removido!');
