import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest } from 'rxjs';
import { FirebaseService, AppEvent, AppBooking, isUserAdmin } from './firebase';
import { MarkdownPipe } from './markdown';

export interface EventViewModel extends AppEvent {
  participantCount: number;
  costPerParticipant: number;
  isCurrentUserSignedUp: boolean;
  currentUserBooking?: AppBooking;
  isFull: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, MatIconModule, MarkdownPipe],
  templateUrl: './dashboard.html',
  host: {
    class: 'block min-h-screen bg-neutral-50'
  }
})
export class Dashboard implements OnInit, OnDestroy {
  firebaseService = inject(FirebaseService);
  private router = inject(Router);

  // States
  eventsAndBookingsSub?: Subscription;
  eventList = signal<EventViewModel[]>([]);
  myBookings = signal<AppBooking[]>([]);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // User Signal state
  currentUserEmail = signal<string | null>(null);
  currentUserName = signal<string | null>(null);
  isAdminUser = signal<boolean>(false);

  ngOnInit(): void {
    // Check login state and fetch details
    this.firebaseService.user$.subscribe(user => {
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      this.currentUserEmail.set(user.email);
      this.currentUserName.set(user.displayName || 'Guest User');
      this.isAdminUser.set(isUserAdmin(user.email));
    });

    // Reactive Combined Stream
    this.eventsAndBookingsSub = combineLatest([
      this.firebaseService.selectEvents(),
      this.firebaseService.selectAllBookings(),
      this.firebaseService.user$
    ]).subscribe({
      next: ([events, bookings, user]) => {
        if (!user) return;
        
        // Build individual event view models
        const viewModels: EventViewModel[] = events.map(e => {
          const eventBookings = bookings.filter(b => b.eventId === e.id);
          const participantCount = eventBookings.length;
          
          // Cost split calculation: split equally by number of participants (minimum 1, or show shared logic if 0)
          const divisor = participantCount > 0 ? participantCount : 1;
          const costPerParticipant = e.cost / divisor;

          const currentUserBooking = eventBookings.find(b => b.userId === user.uid);
          const isCurrentUserSignedUp = !!currentUserBooking;
          const isFull = participantCount >= e.capacity;

          return {
            ...e,
            participantCount,
            costPerParticipant,
            isCurrentUserSignedUp,
            currentUserBooking,
            isFull
          };
        });

        this.eventList.set(viewModels);
        
        // Filter current user's general bookings
        this.myBookings.set(bookings.filter(b => b.userId === user.uid));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error combining dashboard states', err);
        this.errorMessage.set('Could not fetch events or registrations. Please check database permissions.');
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.eventsAndBookingsSub) {
      this.eventsAndBookingsSub.unsubscribe();
    }
  }

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  async handleJoinEvent(eventVm: EventViewModel): Promise<void> {
    if (eventVm.finalised) {
      this.errorMessage.set('This event booking is finalised and locked.');
      return;
    }
    if (eventVm.isFull && !eventVm.isCurrentUserSignedUp) {
      this.errorMessage.set('Event is already full!');
      return;
    }

    try {
      const name = this.currentUserName() || 'Participant';
      await this.firebaseService.addBooking(eventVm.id, name);
      this.errorMessage.set(null);
    } catch (e) {
      console.error('Could not join event', e);
      this.errorMessage.set('Failed to sign up for event. The event booking might be finalised or permissions are restrictive.');
    }
  }

  async handleCancelSignup(eventVm: EventViewModel): Promise<void> {
    if (eventVm.finalised) {
      this.errorMessage.set('This event is finalised and bookings cannot be canceled.');
      return;
    }

    const uid = this.firebaseService.auth.currentUser?.uid;
    if (!uid) return;

    try {
      await this.firebaseService.removeBooking(eventVm.id, uid);
      this.errorMessage.set(null);
    } catch (e) {
      console.error('Could not leave event', e);
      this.errorMessage.set('Failed to cancel signup. Please try again.');
    }
  }

  async handleLogout(): Promise<void> {
    try {
      await this.firebaseService.logOut();
      this.router.navigate(['/login']);
    } catch (e) {
      console.error('Logout failed', e);
    }
  }
}
