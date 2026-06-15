import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Login } from './login';
import { FirebaseService } from './firebase';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  let firebaseService: {
    user$: BehaviorSubject<null>;
    signIn: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    sendPasswordReset: ReturnType<typeof vi.fn>;
    signInWithGoogle: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    firebaseService = {
      user$: new BehaviorSubject(null),
      signIn: vi.fn(),
      signUp: vi.fn(),
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      signInWithGoogle: vi.fn()
    };
    router = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: FirebaseService, useValue: firebaseService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the forgot password action in sign-in mode only', () => {
    expect(query('#btn-forgot-password')).not.toBeNull();

    component.toggleMode();
    fixture.detectChanges();

    expect(query('#btn-forgot-password')).toBeNull();
  });

  it('requires only a valid email in reset password mode', () => {
    component.enterResetPasswordMode();
    component.loginForm.controls.email.setValue('player@example.com');
    component.loginForm.controls.password.setValue('');
    fixture.detectChanges();

    expect(component.loginForm.valid).toBe(true);
    expect(query('#field-password-container')).toBeNull();
  });

  it('submits password reset requests with the entered email', async () => {
    component.enterResetPasswordMode();
    component.loginForm.controls.email.setValue(' player@example.com ');

    await component.onSubmit();

    expect(firebaseService.sendPasswordReset).toHaveBeenCalledWith('player@example.com');
    expect(firebaseService.signIn).not.toHaveBeenCalled();
    expect(firebaseService.signUp).not.toHaveBeenCalled();
  });

  it('shows a generic success message after a password reset request', async () => {
    component.enterResetPasswordMode();
    component.loginForm.controls.email.setValue('player@example.com');

    await component.onSubmit();
    fixture.detectChanges();

    const successBanner = query('#success-banner');
    expect(successBanner?.textContent).toContain('If an account exists for this email');
  });

  it('returns from reset password mode to the sign-in form', () => {
    component.enterResetPasswordMode();
    fixture.detectChanges();

    click('#btn-back-to-sign-in');
    fixture.detectChanges();

    expect(component.isResetPasswordMode()).toBe(false);
    expect(query('#field-password-container')).not.toBeNull();
    expect(query('#btn-login-submit')?.textContent).toContain('Sign In');
  });

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function click(selector: string): void {
    const element = query(selector) as HTMLElement | null;
    expect(element).not.toBeNull();
    element?.click();
  }
});
