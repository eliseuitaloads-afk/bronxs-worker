export function groupEventsByConversation(events) {
  const groups = new Map();

  for (const event of events) {
    const conversationId = event.payload?.conversationId || event.payload?.conversation_id || event.id;
    const key = `${event.company_id}:${conversationId}`;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }

  return [...groups.values()];
}

export async function processGroupsWithConcurrency(groups, concurrency, processEvent) {
  const queue = [...groups];
  const workerCount = Math.min(Math.max(1, concurrency), queue.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const group = queue.shift();
      for (const event of group) {
        await processEvent(event);
      }
    }
  }));
}
