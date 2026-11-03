// Builds the parts of the world that are plain data in a worker, so the page stays responsive while
// they are worked out and the rest of the world is built alongside: the height field first, then the
// ground's colours and where the long grass grows. Only on a page: in Node, and in the worker itself,
// each is built where it is first needed.

let parts;

/**
 * What the worker is building, as promises: `heights` (see heightfield.js), then `ground` (see
 * groundwork.js). Null where there is no worker. The worker stops once it has sent everything.
 */
export function prebuilt() {
  if (parts !== undefined) return parts;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return (parts = null);
  const worker = new Worker(new URL('./prebuild.worker.js', import.meta.url), { type: 'module' });
  const pending = {};
  parts = {};
  for (const name of ['heights', 'ground']) {
    parts[name] = new Promise((resolve, reject) => (pending[name] = { resolve, reject }));
    // Whoever doesn't wait for a part doesn't hear about it failing either.
    parts[name].catch(() => {});
  }
  const fail = error => {
    for (const { reject } of Object.values(pending)) reject(error);
    worker.terminate();
  };
  worker.onmessage = ({ data }) => {
    if (data.error) return fail(new Error(data.error));
    pending[data.part].resolve(data.value);
    delete pending[data.part];
    if (!Object.keys(pending).length) worker.terminate();
  };
  worker.onerror = event => {
    event.preventDefault();
    fail(new Error(event.message || 'The world worker failed to start'));
  };
  return parts;
}

// The worker is started as soon as this is first imported, which main.js does before anything else.
prebuilt();
