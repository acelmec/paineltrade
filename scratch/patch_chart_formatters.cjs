const fs = require('fs');
const path = require('path');

const chartPath = path.resolve('src/components/CandleChart.tsx');
let content = fs.readFileSync(chartPath, 'utf8');
const isCrlf = content.includes('\r\n');
if (isCrlf) content = content.replace(/\r\n/g, '\n');

const oldFormatters = `const spChartYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric'
});`;

const newFormatters = `const spChartYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric'
});

const spChartFullFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function safeChartTimeToDate(time: any): Date | null {
  if (time === null || time === undefined) return null;
  try {
    if (typeof time === 'number') {
      if (isNaN(time) || time <= 0) return null;
      return new Date(time < 1e11 ? time * 1000 : time);
    }
    if (typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
      return new Date(Date.UTC(time.year, time.month - 1, time.day));
    }
    if (typeof time === 'string') {
      return parseInputToDate(time);
    }
  } catch {
    return null;
  }
  return null;
}`;

if (!content.includes(oldFormatters)) {
  console.error('oldFormatters not found');
  process.exit(1);
}

content = content.replace(oldFormatters, newFormatters);

const oldTimeFormatterBlock = `      localization: {
        locale: 'pt-BR',
        dateFormat: "dd MMM ''yy",
        timeFormatter: (time: any) => {
          const d = new Date(Number(time) * 1000);
          const parts = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).formatToParts(d);
          const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
          const m = getVal('month').replace('.', '');
          return \`\${getVal('day')} \${m}. '\${getVal('year')}   \${getVal('hour')}:\${getVal('minute')}\`;
        }
      },`;

const newTimeFormatterBlock = `      localization: {
        locale: 'pt-BR',
        dateFormat: "dd MMM ''yy",
        timeFormatter: (time: any) => {
          try {
            const d = safeChartTimeToDate(time);
            if (!d || isNaN(d.getTime())) return '';
            const parts = spChartFullFormatter.formatToParts(d);
            const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
            const m = getVal('month').replace('.', '');
            return \`\${getVal('day')} \${m}. '\${getVal('year')}   \${getVal('hour')}:\${getVal('minute')}\`;
          } catch {
            return '';
          }
        }
      },`;

if (!content.includes(oldTimeFormatterBlock)) {
  console.error('oldTimeFormatterBlock not found');
  process.exit(1);
}

content = content.replace(oldTimeFormatterBlock, newTimeFormatterBlock);

const oldTickMarkBlock = `        tickMarkFormatter: (time: any, tickMarkType: any) => {
          const d = new Date(Number(time) * 1000);
          if (tickMarkType === 0) {
            return spChartYearFormatter.format(d);
          }
          if (tickMarkType === 1) {
            return spChartMonthFormatter.format(d);
          }
          if (tickMarkType === 2) {
            return spChartDayMonthFormatter.format(d);
          }
          return spChartTimeFormatter.format(d);
        }`;

const newTickMarkBlock = `        tickMarkFormatter: (time: any, tickMarkType: any) => {
          try {
            const d = safeChartTimeToDate(time);
            if (!d || isNaN(d.getTime())) return '';
            if (tickMarkType === 0) {
              return spChartYearFormatter.format(d);
            }
            if (tickMarkType === 1) {
              return spChartMonthFormatter.format(d);
            }
            if (tickMarkType === 2) {
              return spChartDayMonthFormatter.format(d);
            }
            return spChartTimeFormatter.format(d);
          } catch {
            return '';
          }
        }`;

if (!content.includes(oldTickMarkBlock)) {
  console.error('oldTickMarkBlock not found');
  process.exit(1);
}

content = content.replace(oldTickMarkBlock, newTickMarkBlock);

if (isCrlf) content = content.replace(/\n/g, '\r\n');

const tempPath = path.resolve('src/components/CandleChart.tsx.tmp');
fs.writeFileSync(tempPath, content, 'utf8');
console.log('CandleChart.tsx.tmp written');
