// Message bus between the page and the native overlay (WKWebView "bridge" handler).
(function () {
  const handlers = {};
  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge;

  window.PetBus = {
    native: Boolean(native),
    on(event, fn) {
      (handlers[event] = handlers[event] || []).push(fn);
    },
    receive(message) {
      (handlers[message.event] || []).forEach((fn) => fn(message.data));
    },
    post(type, payload = {}) {
      const message = Object.assign({ type }, payload);
      if (native) native.postMessage(message);
    },
  };
})();
