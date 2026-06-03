import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest } from 'rxjs';
import { FirebaseService, AppEvent, AppBooking, isUserAdmin } from './firebase';
import { MarkdownPipe } from './markdown';

export interface AdminEventViewModel extends AppEvent {
  participants: AppBooking[];
  costPerParticipant: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin',
  imports: [CommonModule, RouterLink, ReactiveFormsModule, MatIconModule, MarkdownPipe],
  templateUrl: './admin.html',
  host: {
    class: 'block min-h-screen bg-neutral-50'
  }
})
export class Admin implements OnInit, OnDestroy {
  firebaseService = inject(FirebaseService);
  private router = inject(Router);

  // Streams & States
  private dataSubscription?: Subscription;
  eventList = signal<AdminEventViewModel[]>([]);
  selectedEventId = signal<string | null>(null);
  loading = signal<boolean>(true);
  submitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Authenticated User Stats
  isLoggedIn = signal<boolean>(false);
  isAdminUser = signal<boolean>(false);
  currentUserEmail = signal<string | null>(null);

  // Reactive Event Builder Form
  eventForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)]
    }),
    location: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(256)]
    }),
    date: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    capacity: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)]
    }),
    cost: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)]
    }),
    additionalInfo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10000)]
    })
  });

  // Fetch reactive values for previewing Markdown
  get additionalInfoPreview(): string {
    return this.eventForm.controls.additionalInfo.value || '';
  }

  ngOnInit(): void {
    // Audit Authentication Check
    this.firebaseService.user$.subscribe(user => {
      if (!user) {
        this.isLoggedIn.set(false);
        this.isAdminUser.set(false);
        this.router.navigate(['/login']);
        return;
      }
      this.isLoggedIn.set(true);
      this.currentUserEmail.set(user.email);
      const adminClaim = isUserAdmin(user.email);
      this.isAdminUser.set(adminClaim);

      if (!adminClaim) {
        this.loading.set(false);
      }
    });

    // Real-Time Combined Stream of Events and all Booking participant lists
    this.dataSubscription = combineLatest([
      this.firebaseService.selectEvents(),
      this.firebaseService.selectAllBookings()
    ]).subscribe({
      next: ([events, bookings]) => {
        const vms: AdminEventViewModel[] = events.map(e => {
          const eventBookings = bookings.filter(b => b.eventId === e.id);
          const participantCount = eventBookings.length;
          const costPerParticipant = participantCount > 0 ? e.cost / participantCount : e.cost;

          return {
            ...e,
            participants: eventBookings,
            costPerParticipant
          };
        });

        this.eventList.set(vms);
        
        // If no event is selected but we have events, default-select the first one to keep dashboard rich
        if (!this.selectedEventId() && vms.length > 0) {
          this.selectedEventId.set(vms[0].id);
        }

        this.loading.set(false);
      },
      error: (e) => {
        console.error('Permission error or reading problem in Admin console', e);
        this.errorMessage.set('Permission denied or lost connection. Confirm rules and verify you are signed in as an authorized administrator.');
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
  }

  // Set chosen event for participant management view
  selectEvent(eventId: string): void {
    this.selectedEventId.set(eventId);
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  // Get currently selected event view model
  getSelectedEvent(): AdminEventViewModel | undefined {
    return this.eventList().find(e => e.id === this.selectedEventId());
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

  async onCreateEvent(): Promise<void> {
    if (this.eventForm.invalid) {
      this.errorMessage.set('Please fill out all event fields correctly before submitting.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { name, date, capacity, location, additionalInfo, cost } = this.eventForm.getRawValue();

    try {
      await this.firebaseService.createEvent(
        name,
        date,
        capacity,
        location,
        additionalInfo,
        cost
      );
      
      this.successMessage.set(`Successfully scheduled event "${name}"!`);
      this.eventForm.reset({
        name: '',
        location: '',
        date: '',
        capacity: 10,
        cost: 0,
        additionalInfo: ''
      });
    } catch (e) {
      console.error('Error scheduling event', e);
      this.errorMessage.set('Could not write event record to database. Verify authorization.');
    } finally {
      this.submitting.set(false);
    }
  }

  async handleToggleFinalise(event: AdminEventViewModel): Promise<void> {
    try {
      const lockState = !event.finalised;
      await this.firebaseService.updateEvent(event.id, { finalised: lockState });
      this.successMessage.set(`Event bookings ${lockState ? 'finalised and locked' : 'unlocked'}.`);
    } catch (e) {
      console.error('Error toggling finalised state', e);
      this.errorMessage.set('Could not modify finalized event state.');
    }
  }

  async handleRemoveParticipant(eventId: string, userId: string, userName: string): Promise<void> {
    const confirmDelete = confirm(`Are you sure you want to remove ${userName} from this event?`);
    if (!confirmDelete) return;

    try {
      await this.firebaseService.removeBooking(eventId, userId);
      this.successMessage.set(`Removed ${userName} from registration.`);
    } catch (e) {
      console.error('Error removing participant', e);
      this.errorMessage.set('Failed to unregister participant.');
    }
  }

  async handleTogglePayment(booking: AppBooking): Promise<void> {
    try {
      const toggle = !booking.paid;
      await this.firebaseService.updateBookingPayment(booking.eventId, booking.userId, toggle);
      this.successMessage.set(`Payment state updated for ${booking.userName}.`);
    } catch (e) {
      console.error('Error updating booking payment', e);
      this.errorMessage.set('Failed to alter payment state in database.');
    }
  }

  async handleForceLogout(): Promise<void> {
    try {
      await this.firebaseService.logOut();
      this.router.navigate(['/login']);
    } catch (e) {
      console.error('Logout failed', e);
    }
  }
}
