import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateRetryDelay,
  groupEventsByConversation,
  processGroupsWithConcurrency,
} from './processing.js';

test('processa dez clientes com concorrência limitada', async () => {
  const events = Array.from({ length: 10 }, (_, index) => ({
    id: `event-${index}`,
    company_id: 'company-1',
    payload: { conversationId: `conversation-${index}` },
  }));
  let active = 0;
  let peak = 0;
  const completed = [];

  await processGroupsWithConcurrency(groupEventsByConversation(events), 5, async (event) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    completed.push(event.id);
    active--;
  });

  assert.equal(completed.length, 10);
  assert.equal(new Set(completed).size, 10);
  assert.equal(peak, 5);
});

test('preserva a ordem dos eventos da mesma conversa', async () => {
  const events = [1, 2, 3].map((sequence) => ({
    id: `event-${sequence}`,
    company_id: 'company-1',
    payload: { conversationId: 'same-conversation', sequence },
  }));
  const processed = [];

  await processGroupsWithConcurrency(groupEventsByConversation(events), 5, async (event) => {
    processed.push(event.payload.sequence);
  });

  assert.deepEqual(processed, [1, 2, 3]);
});

test('aplica recuo progressivo e respeita o limite maximo', () => {
  assert.equal(calculateRetryDelay(0, 5_000, 300_000), 5_000);
  assert.equal(calculateRetryDelay(1, 5_000, 300_000), 10_000);
  assert.equal(calculateRetryDelay(4, 5_000, 300_000), 80_000);
  assert.equal(calculateRetryDelay(10, 5_000, 300_000), 300_000);
});
