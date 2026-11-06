import test from 'node:test';
import assert from 'node:assert/strict';

import { formatReportExitTime, isTimeInSessions } from './date.ts';

test('formatReportExitTime keeps UTC timestamps aligned to Sao Paulo without ad-hoc offset shifts', () => {
  const createdAt = '2026-10-28T10:00:00Z';
  const closedAt = '2026-10-28T13:00:00Z';

  const expected = new Date(closedAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  assert.equal(formatReportExitTime(closedAt, createdAt, false), expected);
});

test('isTimeInSessions enforces 24h Brazil time and rejects AM/PM ambiguity', () => {
  const window = [{ start: '10:30:01', end: '10:32:00', active: true }];

  assert.equal(isTimeInSessions('10:30:01', window), true);
  assert.equal(isTimeInSessions('10:31:59', window), true);
  assert.equal(isTimeInSessions('10:32:01', window), false);
  assert.equal(isTimeInSessions('22:40:00', window), false);
});
