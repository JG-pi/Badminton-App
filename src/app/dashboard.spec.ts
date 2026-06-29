import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Dashboard } from './dashboard';
import { AppBooking, AppEvent, FirebaseService } from './firebase';

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let component: Dashboard;
  let events$: BehaviorSubject<AppEvent[]>;
  let bookings$: BehaviorSubject<AppBooking[]>;
  let firebaseService: {
    isBrowser: boolean;
    user$: BehaviorSubject<unknown | null>;
    authReady$: BehaviorSubject<boolean>;
    selectEvents: ReturnType<typeof vi.fn>;
    selectAllBookings: ReturnType<typeof vi.fn>;
    auth: { currentUser: { uid: string } };
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00'));

    events$ = new BehaviorSubject<AppEvent[]>([]);
    bookings$ = new BehaviorSubject<AppBooking[]>([]);
    firebaseService = {
      isBrowser: true,
      user$: new BehaviorSubject<unknown | null>({
        uid: 'user-1',
        email: 'player@example.com',
        displayName: 'Player One'
      }),
      authReady$: new BehaviorSubject(true),
      selectEvents: vi.fn(() => events$),
      selectAllBookings: vi.fn(() => bookings$),
      auth: { currentUser: { uid: 'user-1' } }
    };
    router = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: FirebaseService, useValue: firebaseService },
        { provide: Router, useValue: router }
      ]
    })
      .overrideComponent(Dashboard, {
        set: { template: '' }
      })
      .compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('puts upcoming events before past history events', () => {
    events$.next([
      event('past-older', 'Older Past', '2026-06-13T18:00', 2),
      event('future-later', 'Later Future', '2026-06-20T18:00', 2),
      event('past-recent', 'Recent Past', '2026-06-14T18:00', 2),
      event('future-sooner', 'Sooner Future', '2026-06-16T18:00', 2)
    ]);

    fixture.detectChanges();

    expect(component.eventList().map(e => e.id)).toEqual([
      'future-sooner',
      'future-later',
      'past-recent',
      'past-older'
    ]);
  });

  it('keeps an event in upcoming while its duration has not ended', () => {
    events$.next([
      event('past', 'Past', '2026-06-14T18:00', 2),
      event('current', 'Current', '2026-06-15T09:00', 2),
      event('future', 'Future', '2026-06-15T12:00', 2)
    ]);

    fixture.detectChanges();

    expect(component.eventList().map(e => e.id)).toEqual([
      'current',
      'future',
      'past'
    ]);
  });

  function event(id: string, name: string, date: string, durationHours?: number): AppEvent {
    return {
      id,
      name,
      date,
      durationHours,
      capacity: 10,
      location: 'Court 1',
      additionalInfo: 'Bring a racquet.',
      cost: 100,
      finalised: false,
      createdAt: {} as AppEvent['createdAt'],
      updatedAt: {} as AppEvent['updatedAt'],
      createdBy: 'admin'
    };
  }
});
