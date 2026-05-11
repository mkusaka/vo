import { ViewerState } from "./viewer-state.mts";

type SessionStore = {
  state: ViewerState;
  token: string;
};

export function initializeSessionState(input: {
  state: ViewerState;
  token: string;
}): void {
  const store = getStore();
  store.state = input.state;
  store.token = input.token;
}

export function getViewerState(): ViewerState {
  return getStore().state;
}

export function getSessionToken(): string {
  return getStore().token;
}

function getStore(): SessionStore {
  const global = globalThis as typeof globalThis & {
    __voSessionStore?: SessionStore;
  };

  global.__voSessionStore ??= {
    state: new ViewerState([]),
    token: "",
  };

  return global.__voSessionStore;
}
