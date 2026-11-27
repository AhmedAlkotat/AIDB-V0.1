// DEVELOPMENT-ONLY: the change feed of the in-memory store. The store already announces every change
// (store.subscribe), so no polling is needed; this adapts it to the feed shape of services/changeFeed.js.

export function createChangeFeedFromStore(store) {
  return {
    subscribe: (listener) => store.subscribe(listener),
    notify: () => {},
  }
}
