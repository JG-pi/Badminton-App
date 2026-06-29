import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from './theme';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-theme-toggle',
  imports: [MatIconModule],
  template: `
    <button
      type="button"
      id="btn-theme-toggle"
      (click)="theme.toggle()"
      class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
      [attr.aria-label]="theme.mode() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      [title]="theme.mode() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
    >
      <mat-icon class="text-lg leading-none">{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
  `
})
export class ThemeToggle {
  readonly theme = inject(ThemeService);
}

