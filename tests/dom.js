// Just enough of a browser for the parts of the world that paint signs on canvases to be
// built in Node: the canvases take every drawing call and draw nothing.
if (typeof globalThis.document === 'undefined') {
  const gradient = { addColorStop: () => {} };
  const context = new Proxy(
    {
      measureText: text => ({ width: String(text).length * 10 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    },
    { get: (target, name) => (name in target ? target[name] : () => {}), set: () => true },
  );
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context, style: {} }),
    fonts: { ready: new Promise(() => {}), load: () => new Promise(() => {}), check: () => true },
  };
}
