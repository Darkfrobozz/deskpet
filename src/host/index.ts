import type { PetHost } from './types';

export type { PetHost, PointerHandler, PointerInfo, PointerKind } from './types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function createHost(): Promise<PetHost> {
  if (isTauri()) {
    const { TauriHost } = await import('./tauri');
    return new TauriHost();
  }
  const { BrowserHost } = await import('./browser');
  return new BrowserHost();
}
