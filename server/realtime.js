// Hub de eventos en tiempo real (SSE). Canales: venue:<id> para el personal,
// table:<token> para el móvil del comensal que sigue su pedido.
const channels = new Map(); // canal -> Set<res>

export function subscribe(channel, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ channel, at: Date.now() })}\n\n`);

  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(res);

  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* cerrado */ } }, 25000);
  const close = () => {
    clearInterval(ping);
    channels.get(channel)?.delete(res);
    if (channels.get(channel)?.size === 0) channels.delete(channel);
  };
  res.on('close', close);
  res.on('error', close);
}

export function publish(channel, event, data) {
  const subs = channels.get(channel);
  if (!subs || !subs.size) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sent = 0;
  for (const res of subs) {
    try { res.write(payload); sent++; } catch { subs.delete(res); }
  }
  return sent;
}

export const venueChannel = (venueId) => `venue:${venueId}`;
export const tableChannel = (tableToken) => `table:${tableToken}`;
export const listeners = (channel) => channels.get(channel)?.size || 0;
export function shutdown() {
  for (const subs of channels.values()) for (const res of subs) { try { res.end(); } catch {} }
  channels.clear();
}
