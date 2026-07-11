import { world, hydrate, applyEvent, pruneExpired } from './world.svelte.js';

// Hydrate from the snapshot, then follow the SSE stream. EventSource reconnects on its
// own; after an outage we re-hydrate so nothing missed while disconnected stays stale
// (same resync pattern the original dashboard used).
export function connect() {
  refresh();

  const source = new EventSource('/api/events');
  source.onopen = () => {
    world.connected = true;
  };
  source.onmessage = (message) => {
    let frame;
    try {
      frame = JSON.parse(message.data);
    } catch {
      return; // malformed frame — skip it, the stream continues
    }
    applyEvent(frame.type, frame.payload);
  };
  source.onerror = () => {
    world.connected = false;
    source.addEventListener('open', refresh, { once: true });
  };

  setInterval(pruneExpired, 500);
  return source;
}

async function refresh() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      hydrate(await res.json());
      world.connected = true;
    }
  } catch {
    world.connected = false;
  }
}
