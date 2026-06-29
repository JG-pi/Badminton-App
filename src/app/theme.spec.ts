import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme';

describe('ThemeService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to dark when no stored preference exists', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores a stored light preference', () => {
    window.localStorage.setItem('badminton-app-theme', 'light');

    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles and persists the selected theme', () => {
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.mode()).toBe('light');
    expect(window.localStorage.getItem('badminton-app-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

