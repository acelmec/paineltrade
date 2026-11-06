/**
 * Utility functions for handling date/time formatting and processing in the
 * America/Sao_Paulo (UTC-3) timezone.
 * Brazil has abolished daylight saving time (DST) since 2019, so America/Sao_Paulo
 * is permanently UTC-3.
 */

export function parseInputToDate(dateInput?: string | Date | number | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput < 1e11 ? dateInput * 1000 : dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  
  let str = String(dateInput).trim();
  if (!str) return null;

  // Replace space with 'T' if format is "YYYY-MM-DD HH:mm:ss"
  if (str.includes(' ') && !str.includes('T')) {
    str = str.replace(' ', 'T');
  }

  // If string contains timezone offset or 'Z', parse directly as ISO
  if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Se a string de data não possui fuso horário explícito (ex: "YYYY-MM-DDTHH:mm:ss" vindo do Supabase),
  // tenta interpretar com 'Z' primeiro se for ISO completo; caso contrário usa new Date(str) diretamente.
  let d = new Date(str + 'Z');
  if (isNaN(d.getTime())) {
    d = new Date(str);
  }

  if (isNaN(d.getTime())) return null;
  return d;
}

export function isCandleInSessionPause(
  timestamp: string | Date | number,
  cycleEndStr = '19:00:00',
  cycleStartStr = '20:00:00',
  _sym?: string,
  _settings?: any
): boolean {
  if (!timestamp) return false;
  const d = parseInputToDate(timestamp);
  if (!d) return false;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const currentSec = hours * 3600 + minutes * 60 + seconds;
  const parseTimeToSec = (tStr: string) => {
    const parts = (tStr || '').split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  };
  const endSec = parseTimeToSec(cycleEndStr);
  const startSec = parseTimeToSec(cycleStartStr);
  if (startSec > endSec) {
    return currentSec > endSec && currentSec < startSec;
  } else if (startSec < endSec) {
    return currentSec > endSec || currentSec < startSec;
  }
  return false;
}


/**
 * Canonical policy for VortexWeb:
 * - All persisted timestamps are stored in UTC and should use TIMESTAMPTZ in PostgreSQL.
 * - We convert explicitly to the business timezone only when displaying to users.
 * - No hard-coded +/-3h/+4h/+5h compensation should be applied to timestamps.
 *
 * This keeps the system stable across DST or timezone changes because the actual instant
 * remains the same while the UI chooses the zone it wants to render.
 */
let serverClockOffsetMs = 0;

export function syncServerClock(serverTimeInput?: string | Date | number | null): void {
  if (!serverTimeInput) return;
  const parsed = parseInputToDate(serverTimeInput);
  if (!parsed) return;
  const serverMs = parsed.getTime();
  if (isNaN(serverMs) || serverMs <= 0) return;

  const localMs = Date.now();
  const diff = serverMs - localMs;
  if (Math.abs(diff) > 90 * 1000 && Math.abs(diff) < 24 * 3600 * 1000) {
    serverClockOffsetMs = diff;
  } else if (Math.abs(diff) <= 90 * 1000) {
    serverClockOffsetMs = 0;
  }
}

export function getSyncedNowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export function getSyncedNowISO(): string {
  return new Date(getSyncedNowMs()).toISOString();
}

export function getSaoPauloDate(dateInput?: string | Date | number | null): Date {
  const d = parseInputToDate(dateInput) || new Date(getSyncedNowMs());
  return isNaN(d.getTime()) ? d : new Date(d.getTime());
}

/**
 * Converts any date representation to the exact Unix timestamp in milliseconds/seconds
 * of the actual instant it represents. The application must not apply a fixed timezone
 * offset here because the canonical storage timezone is UTC and the display timezone is
 * handled explicitly with Intl.DateTimeFormat('America/Sao_Paulo').
 */
export function getChartTimeFromDate(dateInput?: string | Date | number | null): number {
  if (!dateInput) return 0;

  if (typeof dateInput === 'number') {
    if (dateInput <= 0) return 0;
    return Math.floor((dateInput < 1e11 ? dateInput * 1000 : dateInput) / 1000);
  }

  const d = parseInputToDate(dateInput);
  if (!d || isNaN(d.getTime())) return 0;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Formats a date string or Date object into a DD/MM/YYYY HH:MM string in Sao Paulo timezone.
 */
export function formatSaoPauloDateTime(dateInput?: string | Date | null): string {
  const d = parseInputToDate(dateInput);
  if (!d) return '';

  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Formats a date string or Date object into a DD/MM/YYYY string in Sao Paulo timezone.
 */
export function formatSaoPauloDate(dateInput?: string | Date | null): string {
  const d = parseInputToDate(dateInput);
  if (!d) return '';

  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Formats a date string or Date object into a DD/MM string in Sao Paulo timezone.
 */
export function formatSaoPauloDayMonth(dateInput?: string | Date | null): string {
  const d = parseInputToDate(dateInput);
  if (!d) return '';

  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit'
  });
}

/**
 * Formats a date string or Date object into a HH:MM or HH:MM:SS string in Sao Paulo timezone.
 */
export function formatSaoPauloTime(dateInput?: string | Date | null, includeSeconds: boolean = true): string {
  const d = parseInputToDate(dateInput);
  if (!d) return '';

  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false
  });
}

/**
 * Formats the operation exit time in the São Paulo timezone without any hard-coded offset corrections.
 * The canonical instant is stored and transmitted as UTC/TIMESTAMPTZ; the display layer chooses the
 * local timezone explicitly. Any ad-hoc +3h/+4h/+5h adjustment is a bug and should not be reintroduced.
 */
export function formatReportExitTime(
  closedAt?: string | Date | null,
  createdAt?: string | Date | null,
  includeSeconds: boolean = true
): string {
  if (!closedAt) return '--:--:--';

  const exitDate = parseInputToDate(closedAt);
  if (!exitDate || isNaN(exitDate.getTime())) return '--:--:--';

  void createdAt;

  return exitDate.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false
  });
}

/**
 * Preserves the exact raw hour/minute/second string from the system timestamp
 * without shifting by browser/PC local timezone.
 */
export function getRawSystemTime(dateInput?: string | Date | null, includeSeconds: boolean = true): string {
  if (!dateInput) return '--:--:--';
  let str = String(dateInput).trim();
  if (!str) return '--:--:--';
  const tIndex = str.indexOf('T') !== -1 ? str.indexOf('T') : str.indexOf(' ');
  if (tIndex !== -1 && str.length >= tIndex + 6) {
    const timePart = str.substring(tIndex + 1);
    if (!includeSeconds) {
      return timePart.substring(0, 5); // "HH:MM"
    }
    return timePart.substring(0, 8); // "HH:MM:SS"
  }
  return str;
}

/**
 * Normalizes a time string to the canonical 24h HH:MM:SS format using the Brazil/Sao_Paulo business timezone.
 * This purposely rejects AM/PM ambiguity and ensures all session checks are based on the server's GMT/BRA clock,
 * never on browser-local time.
 */
export function normalizeBrazilTimeString(value?: string | Date | number | null): string {
  if (value === null || value === undefined || value === '') return '00:00:00';

  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(value);

    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const second = parts.find(p => p.type === 'second')?.value || '00';
    return `${hour}:${minute}:${second}`;
  }

  if (typeof value === 'number') {
    const date = new Date(value < 1e11 ? value * 1000 : value);
    return normalizeBrazilTimeString(date);
  }

  let s = String(value).trim().toUpperCase();
  s = s.replace(/\s+/g, ' ');

  if (s.includes('T')) {
    const timePart = s.split('T')[1] || '';
    s = timePart.split(/[Z+-]/)[0] || s;
  }

  if (s.includes(' ')) {
    const candidate = s.split(' ').pop() || s;
    s = candidate;
  }

  s = s.replace(/[AP]M/g, '').trim();
  s = s.replace(/[^0-9:]/g, '');

  if (s.length === 5) s += ':00';
  if (s.length === 7) s = '0' + s;

  const parts = s.split(':').map(p => p.padStart(2, '0'));
  if (parts.length < 3) {
    while (parts.length < 3) parts.push('00');
  }

  const [hh, mm, ss] = parts.slice(0, 3);
  const hour = Math.min(23, Math.max(0, Number.parseInt(hh || '0', 10)));
  const minute = Math.min(59, Math.max(0, Number.parseInt(mm || '0', 10)));
  const second = Math.min(59, Math.max(0, Number.parseInt(ss || '0', 10)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export function toSecondsSinceMidnight(timeValue?: string | Date | number | null): number {
  const normalized = normalizeBrazilTimeString(timeValue);
  const [hh, mm, ss] = normalized.split(':').map(Number);
  return hh * 3600 + mm * 60 + ss;
}

/**
 * Checks if a given time string (HH:MM or HH:MM:SS) is within any active strategy session.
 * Supports full HH:MM:SS precision.
 */
export function isTimeInSessions(timeStr: string, sessions?: Array<{ start?: string; end?: string; active?: boolean }>): boolean {
  const activeSessions = (sessions || []).filter(s => s && s.active);
  if (activeSessions.length === 0) return true;

  const current = normalizeBrazilTimeString(timeStr || new Date());
  const currentSec = toSecondsSinceMidnight(current);

  return activeSessions.some(s => {
    const startSec = toSecondsSinceMidnight(s.start || '00:00:00');
    const endSec = toSecondsSinceMidnight(s.end || '23:59:59');

    if (startSec <= endSec) {
      return currentSec >= startSec && currentSec <= endSec;
    }
    return currentSec >= startSec || currentSec <= endSec;
  });
}

/**
 * Sanitizes and formats a time input string with strict validation:
 * Hours: 00-23
 * Minutes: 00-59
 * Seconds: 00-59
 */
export function sanitizeTimeMask(value: string, includeSeconds: boolean = true): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, includeSeconds ? 6 : 4);
  if (!digits) return '';

  let hh = digits.slice(0, 2);
  let mm = digits.slice(2, 4);
  let ss = digits.slice(4, 6);

  if (hh.length === 2) {
    const hhNum = Math.min(23, parseInt(hh, 10));
    hh = String(hhNum).padStart(2, '0');
  }

  if (mm.length === 2) {
    const mmNum = Math.min(59, parseInt(mm, 10));
    mm = String(mmNum).padStart(2, '0');
  }

  if (ss.length === 2) {
    const ssNum = Math.min(59, parseInt(ss, 10));
    ss = String(ssNum).padStart(2, '0');
  }

  if (digits.length <= 2) {
    return value.endsWith(':') && digits.length === 2 ? `${hh}:` : hh;
  } else if (digits.length <= 4) {
    if (includeSeconds && value.endsWith(':') && digits.length === 4) {
      return `${hh}:${mm}:`;
    }
    return `${hh}:${mm}`;
  } else {
    return `${hh}:${mm}:${ss}`;
  }
}

/**
 * Checks if current time is within the market session break / maintenance window
 * (e.g., between global_cycle_end '18:00:00' and global_cycle_start '19:00:00').
 */
export function isMarketSessionPaused(
  currentTimeStr: string,
  cycleEndStr: string = '19:00:00',
  cycleStartStr: string = '20:00:00'
): boolean {
  if (!cycleEndStr || !cycleStartStr || cycleEndStr === cycleStartStr) return false;

  const formatHHMMSS = (str?: string): string => {
    if (!str) return '00:00:00';
    let s = str.trim();
    if (s.length === 5) s += ':00';
    if (s.length === 7) s = '0' + s;
    return s;
  };

  const curr = formatHHMMSS(currentTimeStr);
  const end = formatHHMMSS(cycleEndStr);
  const start = formatHHMMSS(cycleStartStr);

  if (end < start) {
    return curr >= end && curr < start;
  } else {
    return curr >= end || curr < start;
  }
}

/**
 * Verifica se o mercado de futuros (CME Globex) está fechado no momento atual.
 * 
 * Horários de funcionamento (UTC-3 / Brasília):
 * - Domingo 19:00 → Sexta-feira 18:00 (com pausa diária configurável via global_cycle_end/start)
 * - Sábado: TOTALMENTE FECHADO
 * - Domingo antes das 19:00: FECHADO
 * - Sexta após 18:00: FECHADO
 * 
 * A função retorna { closed: true, reason: string } se estiver fora do horário operacional.
 */
export function isMarketClosed(
  cycleEndStr: string = '19:00:00',
  cycleStartStr: string = '20:00:00'
): { closed: boolean; reason: string } {
  const now = getSaoPauloDate();
  const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg, ..., 5=Sex, 6=Sáb
  const pad = (n: number) => String(n).padStart(2, '0');
  const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Sábado: mercado totalmente fechado o dia inteiro
  if (dayOfWeek === 6) {
    return { closed: true, reason: 'Mercado fechado (Sábado). Nenhuma operação pode ser aberta.' };
  }

  // Domingo: mercado fechado até as 19:00 (abertura CME Globex)
  if (dayOfWeek === 0) {
    const formatHHMMSS = (str?: string): string => {
      if (!str) return '00:00:00';
      let s = str.trim();
      if (s.length === 5) s += ':00';
      if (s.length === 7) s = '0' + s;
      return s;
    };
    const openTime = formatHHMMSS(cycleStartStr);
    if (currentTimeStr < openTime) {
      return { closed: true, reason: `Mercado fechado (Domingo antes das ${cycleStartStr.substring(0, 5)}). Aguardando abertura da sessão.` };
    }
  }

  // Sexta-feira: mercado fecha após o horário de ciclo (ex: 18:00)
  if (dayOfWeek === 5) {
    const formatHHMMSS = (str?: string): string => {
      if (!str) return '00:00:00';
      let s = str.trim();
      if (s.length === 5) s += ':00';
      if (s.length === 7) s = '0' + s;
      return s;
    };
    const closeTime = formatHHMMSS(cycleEndStr);
    if (currentTimeStr >= closeTime) {
      return { closed: true, reason: `Mercado fechado (Sexta-feira após ${cycleEndStr.substring(0, 5)}). Sessão semanal encerrada.` };
    }
  }

  return { closed: false, reason: '' };
}

/**
 * Retorna uma chave única de sessão para agrupamento de candles (ex: '2026-08-30').
 * Velas de uma mesma sessão operacional (ex: Domingo 19:00 até Segunda 17:59) recebem a mesma chave.
 */
export function getTradingSessionKey(timeMsOrSec: number, cycleStartStr: string = '20:00:00'): string {
  if (!timeMsOrSec || isNaN(timeMsOrSec)) return 'default_session';
  const timeMs = timeMsOrSec > 2e9 ? timeMsOrSec : timeMsOrSec * 1000;
  const [startHStr, startMStr] = (cycleStartStr || '20:00:00').split(':');
  const startH = parseInt(startHStr || '20', 10);
  const startM = parseInt(startMStr || '0', 10);
  const cycleOffsetMs = ((startH * 60 + startM) * 60) * 1000;

  // Ajuste obrigatório para o fuso horário de Brasília (UTC-3):
  // O horário da sessão (ex: 20:00) está expresso no fuso de Brasília (UTC-3).
  // Para que a rotação da sessão ocorra pontualmente às 20:00 BRT (e não às 20:00 UTC = 17:00 BRT),
  // ajustamos o timestamp UTC para o fuso de São Paulo (-3h) antes de subtrair o offset da sessão.
  const SP_OFFSET_MS = -3 * 3600 * 1000;
  const adjustedDate = new Date(timeMs + SP_OFFSET_MS - cycleOffsetMs);
  const y = adjustedDate.getUTCFullYear();
  const m = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(adjustedDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna a Data Operacional (Trade Date da Sessão CME / Mesa Proprietária) no fuso de São Paulo.
 * Se o trade foi aberto ou fechado a partir do início da sessão asiática (ex: >= 19:00 ou valor de settings.global_cycle_start),
 * ele pertence contabilmente à sessão do PRÓXIMO dia de negociação.
 * Exemplo: Domingo 19:30 BRT -> Segunda-feira. Segunda 19:15 BRT -> Terça-feira.
 */
export function getTradingSessionDate(
  dateInput: string | number | Date | null | undefined,
  sessionStartStr: string = '20:00:00'
): Date {
  const d = getSaoPauloDate(dateInput);
  if (isNaN(d.getTime())) return getSaoPauloDate();

  const [startHStr, startMStr] = (sessionStartStr || '19:00:00').split(':');
  const startH = parseInt(startHStr || '19', 10);
  const startM = parseInt(startMStr || '0', 10);

  const h = d.getHours();
  const m = d.getMinutes();

  // Se o horário for maior ou igual ao início da nova sessão diária (sessão asiática):
  // Pertence contabilmente à sessão do dia seguinte
  if (h > startH || (h === startH && m >= startM)) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0);
  }

  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

