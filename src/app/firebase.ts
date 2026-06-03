import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, User, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, Firestore, collection, doc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, getDocFromServer, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebase.config';
import { Observable, BehaviorSubject } from 'rxjs';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export interface AppEvent {
  id: string;
  name: string;
  date: string;
  capacity: number;
  location: string;
  additionalInfo: string;
  cost: number;
  finalised: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface AppBooking {
  id: string; // eventId_userId
  eventId: string;
  userId: string;
  userEmail: string;
  userName: string;
  paid: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const ADMIN_EMAILS = [
  'jamesguoas@gmail.com',
  'khoiphan21@gmail.com',
  'admin@luna.academy'
];

export function isUserAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private platformId = inject(PLATFORM_ID);
  
  app!: FirebaseApp;
  auth!: Auth;
  db!: Firestore;

  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  currentUserSig = signal<User | null>(null);
  isBrowser = false;

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      this.db = getFirestore(this.app, firebaseConfig.firestoreDatabaseId);
      this.auth = getAuth(this.app);

      // Listen to auth moves
      onAuthStateChanged(this.auth, (user) => {
        this.userSubject.next(user);
        this.currentUserSig.set(user);
        
        if (user) {
          // If user exists, test database connection as mandated by skill guidelines
          this.testConnection();
        }
      });
    }
  }

  // Mandatory database connection verification
  private async testConnection() {
    try {
      await getDocFromServer(doc(this.db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration: the client is offline.");
      }
    }
  }

  // Standardized error mapping as mandated by Firebase Integration Skill
  handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: this.auth?.currentUser?.uid || null,
        email: this.auth?.currentUser?.email || null,
        emailVerified: this.auth?.currentUser?.emailVerified || null,
        isAnonymous: this.auth?.currentUser?.isAnonymous || null,
        providerInfo: this.auth?.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error Detailed Info: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  isAdmin(): boolean {
    const user = this.currentUserSig();
    return isUserAdmin(user?.email);
  }

  // --- AUDIO & AUTH ACTIONS ---
  async signUp(email: string, password: string, name: string): Promise<User> {
    if (!this.isBrowser) throw new Error('Not running in browser state');
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      // Force reload user fields
      this.userSubject.next(this.auth.currentUser);
      this.currentUserSig.set(this.auth.currentUser);
      return credential.user;
    } catch (e) {
      console.error('Sign up error', e);
      throw e;
    }
  }

  async signIn(email: string, password: string): Promise<User> {
    if (!this.isBrowser) throw new Error('Not running in browser state');
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      // Wait a moment for onAuthStateChanged to trigger, or force set
      this.userSubject.next(credential.user);
      this.currentUserSig.set(credential.user);
      return credential.user;
    } catch (e) {
      console.error('Sign in error', e);
      throw e;
    }
  }

  async logOut(): Promise<void> {
    if (!this.isBrowser) return;
    await signOut(this.auth);
    this.userSubject.next(null);
    this.currentUserSig.set(null);
  }

  // --- FIRESTORE EVENTS QUERIES/COMMANDS ---
  async createEvent(name: string, date: string, capacity: number, location: string, additionalInfo: string, cost: number): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    const eventId = 'ev_' + Date.now().toString();
    try {
      const eventDocRef = doc(this.db, path, eventId);
      const newEvent: AppEvent = {
        id: eventId,
        name,
        date,
        capacity,
        location,
        additionalInfo,
        cost,
        finalised: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: this.auth.currentUser?.uid || 'system'
      };
      await setDoc(eventDocRef, newEvent);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${eventId}`);
    }
  }

  async updateEvent(eventId: string, updates: Partial<Omit<AppEvent, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    try {
      const eventDocRef = doc(this.db, path, eventId);
      await updateDoc(eventDocRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });
    } catch (e) {
      this.handleFirestoreError(e, OperationType.UPDATE, `${path}/${eventId}`);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'events';
    try {
      const eventDocRef = doc(this.db, path, eventId);
      await deleteDoc(eventDocRef);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${eventId}`);
    }
  }

  // Observable stream of events
  selectEvents(): Observable<AppEvent[]> {
    return new Observable<AppEvent[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'events';
      const q = query(collection(this.db, path));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const events: AppEvent[] = [];
        snapshot.forEach((doc) => {
          events.push(doc.data() as AppEvent);
        });
        // Sort by date ascending
        events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        subscriber.next(events);
      }, (error) => {
        this.handleFirestoreError(error, OperationType.LIST, path);
      });
      return () => unsubscribe();
    });
  }

  // --- FIRESTORE BOOKINGS QUERIES/COMMANDS ---
  async addBooking(eventId: string, userName: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('Must be logged in to book events');
    const bookingId = `${eventId}_${currentUser.uid}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      const newBooking: AppBooking = {
        id: bookingId,
        eventId,
        userId: currentUser.uid,
        userEmail: currentUser.email || 'anonymous',
        userName: userName,
        paid: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      await setDoc(bookingDocRef, newBooking);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.CREATE, `${path}/${bookingId}`);
    }
  }

  async removeBooking(eventId: string, userId: string): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const bookingId = `${eventId}_${userId}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      await deleteDoc(bookingDocRef);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${path}/${bookingId}`);
    }
  }

  async updateBookingPayment(eventId: string, userId: string, paid: boolean): Promise<void> {
    if (!this.isBrowser) return;
    const path = 'bookings';
    const bookingId = `${eventId}_${userId}`;
    try {
      const bookingDocRef = doc(this.db, path, bookingId);
      await updateDoc(bookingDocRef, {
        paid,
        updatedAt: Timestamp.now()
      });
    } catch (e) {
      this.handleFirestoreError(e, OperationType.UPDATE, `${path}/${bookingId}`);
    }
  }

  // Stream bookings for a specific event
  selectBookingsForEvent(eventId: string): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path), where('eventId', '==', eventId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        this.handleFirestoreError(error, OperationType.LIST, path);
      });
      return () => unsubscribe();
    });
  }

  // Stream all bookings of currently signed-in user
  selectMyBookings(): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path), where('userId', '==', currentUser.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        this.handleFirestoreError(error, OperationType.LIST, path);
      });
      return () => unsubscribe();
    });
  }

  // Fetch a list of ALL bookings (admin-only)
  selectAllBookings(): Observable<AppBooking[]> {
    return new Observable<AppBooking[]>((subscriber) => {
      if (!this.isBrowser) {
        subscriber.next([]);
        return;
      }
      const path = 'bookings';
      const q = query(collection(this.db, path));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const bookings: AppBooking[] = [];
        snapshot.forEach((doc) => {
          bookings.push(doc.data() as AppBooking);
        });
        subscriber.next(bookings);
      }, (error) => {
        this.handleFirestoreError(error, OperationType.LIST, path);
      });
      return () => unsubscribe();
    });
  }
}
