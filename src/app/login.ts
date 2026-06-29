import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { FirebaseService } from './firebase';
import { ThemeToggle } from './theme-toggle';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ThemeToggle],
  templateUrl: './login.html',
  host: {
    class: 'block min-h-screen bg-neutral-50 dark:bg-slate-950 flex items-center justify-center p-4 md:p-8 animate-fade-in'
  }
})
export class Login {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  isRegisterMode = signal<boolean>(false);
  isResetPasswordMode = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  loading = signal<boolean>(false);

  // Reactive Forms with rigorous type support and validations
  loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)]
    }),
    name: new FormControl('', {
      nonNullable: true
    })
  });

  constructor() {
    // If user is already logged in, push them to the system dashboard
    this.firebaseService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/']);
      }
    });
  }

  toggleMode(): void {
    const currentMode = this.isRegisterMode();
    this.isResetPasswordMode.set(false);
    this.isRegisterMode.set(!currentMode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.updateDynamicValidators();
  }

  enterResetPasswordMode(): void {
    this.isRegisterMode.set(false);
    this.isResetPasswordMode.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.updateDynamicValidators();
  }

  exitResetPasswordMode(): void {
    this.isResetPasswordMode.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.updateDynamicValidators();
  }

  private updateDynamicValidators(): void {
    const passwordControl = this.loginForm.controls.password;
    const nameControl = this.loginForm.controls.name;

    if (this.isResetPasswordMode()) {
      passwordControl.clearValidators();
      nameControl.clearValidators();
    } else {
      passwordControl.setValidators([Validators.required, Validators.minLength(6)]);
      if (this.isRegisterMode()) {
        nameControl.setValidators([Validators.required, Validators.minLength(2)]);
      } else {
        nameControl.clearValidators();
      }
    }

    passwordControl.updateValueAndValidity();
    nameControl.updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    if (this.isResetPasswordMode()) {
      await this.onPasswordResetSubmit();
      return;
    }

    if (this.loginForm.invalid) {
      this.errorMessage.set('Please make sure all fields are valid.');
      return;
    }

    const { email, password, name } = this.loginForm.getRawValue();
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      if (this.isRegisterMode()) {
        await this.firebaseService.signUp(email.trim(), password, name.trim() || 'User');
      } else {
        await this.firebaseService.signIn(email.trim(), password);
      }
      this.router.navigate(['/']);
    } catch (error: unknown) {
      console.error('Authentication error: ', error);
      let errorText = 'An error occurred during authentication. Please try again.';
      const err = error as { code?: string; message?: string };
      
      // Provide a proactive, highly helpful user guide for potential configuration challenges
      if (err.code === 'auth/configuration-not-found') {
        errorText = 'Email/Password provider is not yet enabled in the Firebase Console. Please open your Firebase auth console and enable "Email/Password" sign-in method!';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorText = 'Invalid email address or password. Please verify your credentials and try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorText = 'This email is already registered. Try logging in instead.';
      } else if (err.message) {
        errorText = err.message;
      }
      this.errorMessage.set(errorText);
    } finally {
      this.loading.set(false);
    }
  }

  private async onPasswordResetSubmit(): Promise<void> {
    const emailControl = this.loginForm.controls.email;
    emailControl.setValue(emailControl.value.trim());
    emailControl.markAsTouched();

    if (emailControl.invalid) {
      this.errorMessage.set('Please enter a valid email address.');
      this.successMessage.set(null);
      return;
    }

    const email = emailControl.value;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.firebaseService.sendPasswordReset(email);
      this.successMessage.set('If an account exists for this email, a password reset link has been sent.');
    } catch (error: unknown) {
      console.error('Password reset error: ', error);
      const err = error as { code?: string; message?: string };

      if (err.code === 'auth/user-not-found') {
        this.successMessage.set('If an account exists for this email, a password reset link has been sent.');
        return;
      }

      let errorText = 'Password reset could not be started. Please try again.';
      if (err.code === 'auth/configuration-not-found') {
        errorText = 'Email/Password provider is not yet enabled in the Firebase Console. Please enable it before sending password reset emails.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorText = 'Firebase rejected this password reset request. Confirm Email/Password sign-in is enabled for this project.';
      } else if (err.code === 'auth/invalid-email') {
        errorText = 'Please enter a valid email address.';
      } else if (err.message) {
        errorText = err.message;
      }

      this.errorMessage.set(err.code ? `${errorText} (${err.code})` : errorText);
    } finally {
      this.loading.set(false);
    }
  }

  async onGoogleContinue(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const user = await this.firebaseService.signInWithGoogle();
      if (user) {
        this.router.navigate(['/']);
      }
    } catch (error: unknown) {
      console.error('Google authentication error: ', error);
      const err = error as { code?: string; message?: string };
      let errorText = 'Google sign-in could not be completed. Please try again.';

      if (err.code === 'auth/popup-closed-by-user') {
        errorText = 'Google sign-in was closed before it finished.';
      } else if (err.code === 'auth/popup-blocked') {
        errorText = 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errorText = 'This domain is not authorized for Firebase sign-in. Add localhost and 127.0.0.1 in Firebase Authentication settings.';
      } else if (err.code === 'auth/configuration-not-found') {
        errorText = 'Firebase Auth configuration was not found for this project. Confirm this app uses the same Firebase project where Google is enabled.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorText = 'Firebase rejected Google sign-in for this app. Confirm the Google provider is enabled for the same Firebase project as this apiKey/authDomain.';
      } else if (err.message) {
        errorText = err.message;
      }

      this.errorMessage.set(err.code ? `${errorText} (${err.code})` : errorText);
    } finally {
      this.loading.set(false);
    }
  }
}
