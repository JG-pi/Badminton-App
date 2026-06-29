import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'badminton-app-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly mode = signal<ThemeMode>('dark');
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    const storedMode = this.readStoredMode();
    this.setMode(storedMode ?? 'dark', false);
  }

  toggle(): void {
    this.setMode(this.mode() === 'dark' ? 'light' : 'dark');
  }

  setMode(mode: ThemeMode, persist = true): void {
    this.mode.set(mode);
    this.applyDocumentClass(mode);

    if (persist && this.isBrowser) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  }

  private readStoredMode(): ThemeMode | null {
    if (!this.isBrowser) return null;

    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedValue === 'light' || storedValue === 'dark' ? storedValue : null;
  }

  private applyDocumentClass(mode: ThemeMode): void {
    this.document.documentElement.classList.toggle('dark', mode === 'dark');
  }
}
