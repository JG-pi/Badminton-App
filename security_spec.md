# Firebase Security Specification (TDD SPEC)

## 1. Data Invariants

1. **Self-Authenticating User Writes**: Non-admin users can only create, update or delete bookings where the `userId` in the document matches their authenticated `request.auth.uid`.
2. **Admin-Only Operations for Events**: Only authenticated administrators whose emails match `jamesguoas@gmail.com` or `khoiphan21@gmail.com` (or `admin@luna.academy` for standard testing in development) can create or update events. Standard users have read-only access to events.
3. **Locked/Finalised Booking Rule**: If an event has its `finalised` field set to `true`, no new bookings can be created for it, and existing bookings cannot be deleted or updated (except by an admin).
4. **Capacity Limit Protection**: Users cannot sign up for an event if the booking count equals or exceeds the event's capacity (handled with client-side guards and admin-level validation, or verified where possible).
5. **No Direct RBAC Editing**: Authenticated standard users cannot make themselves admins, nor can they bypass rules by claiming they have the `admin` flag in client scopes or writing to some admin settings collection without authorization. Since emails are hard-coded for simplicity and security, it is robust and immune to database role escalation.
6. **No Direct Payment Bypass**: Regular users cannot alter their own `paid` status (only admins can set `paid` to true/false in the admin console to record who has or has not paid).
7. **Temporal & ID Integrity**: All timestamps (`createdAt`, `updatedAt`) must be authenticated server timestamps (`request.time`) rather than client controlled integers to prevent timing spoofing. No document IDs can exceed 128 characters or contain unsafe characters.

---

## 2. The "Dirty Dozen" Payloads (Malicious Writes to Prevent)

1. **Event Creation by Non-Admin**
   - *Target Collection*: `/events` (Create)
   - *Payload*: `{ "name": "Hack Event", "capacity": 100, "location": "Remote", "cost": 0, "finalised": false, "createdBy": "non_admin_uid" }`
   - *Expected*: `PERMISSION_DENIED`

2. **Self-Elevating Cost on Event by Standard User**
   - *Target Collection*: `/events/some_event_id` (Update)
   - *Payload*: `{ "cost": 1000000 }` (Standard user tries to change event details)
   - *Expected*: `PERMISSION_DENIED`

3. **Booking Creation Mocking Another User**
   - *Target Collection*: `/bookings` (Create)
   - *Payload*: `{ "eventId": "event_123", "userId": "victim_user_id", "userEmail": "victim@gmail.com", "userName": "Victim", "paid": false }`
   - *Expected*: `PERMISSION_DENIED` (auth.uid !== data.userId)

4. **Booking Payment Spoofing by Regular User**
   - *Target Collection*: `/bookings/booking_123` (Update)
   - *Payload*: `{ "paid": true }` (User tries to mark themselves as paid)
   - *Expected*: `PERMISSION_DENIED` (Regular user should not be able to change 'paid')

5. **Editing Immutable Field `createdAt` in Booking**
   - *Target Collection*: `/bookings/booking_123` (Update)
   - *Payload*: `{ "createdAt": "2020-01-01T00:00:00Z" }`
   - *Expected*: `PERMISSION_DENIED`

6. **Booking for Finalised/Locked Event**
   - *Target Collection*: `/bookings` (Create)
   - *Payload*: `{ "eventId": "locked_event_123", "userId": "attacker_uid", "paid": false }`
   - *Expected*: `PERMISSION_DENIED` (Because locked_event_123 finalised is true, logic must block)

7. **Junk Field Pollution (Shadow Fields)**
   - *Target Collection*: `/bookings` (Create)
   - *Payload*: `{ "eventId": "event_123", "userId": "attacker_uid", "paid": false, "ghost_field": "unwanted_data" }`
   - *Expected*: `PERMISSION_DENIED` (Keys size check)

8. **Huge String Injection (Denial of Wallet)**
   - *Target Collection*: `/bookings` (Create)
   - *Payload*: `{ "eventId": "event_123", "userId": "attacker_uid", "userName": "A" * 10000 }` (Over-allocate memory / index size)
   - *Expected*: `PERMISSION_DENIED` (Due to name length constraint <= 128)

9. **Unsafe Character ID Injection**
   - *Target Collection*: `/events/$$$malicious_event_id$$$` (Create)
   - *Expected*: `PERMISSION_DENIED` (Regex check)

10. **Admin Email Spoofing with Unverified Token**
   - *Target Collection*: `/events` (Create)
   - *Auth state*: `{ uid: 'attacker_uid', token: { email: 'jamesguoas@gmail.com', email_verified: false } }`
   - *Expected*: `PERMISSION_DENIED` (Requires email_verified == true)

11. **Booking Deletion of Another User's Sign-Up**
    - *Target Collection*: `/bookings/event_123_userId` (Delete by `other_userId` standard auth)
    - *Expected*: `PERMISSION_DENIED`

12. **Bypassing Server Timestamps**
    - *Target Collection*: `/bookings` (Create)
    - *Payload*: `{ "createdAt": "2021-01-01T00:00:00Z", ... }` (Non-request.time)
    - *Expected*: `PERMISSION_DENIED`

---

## 3. Test Runner Design

Below is the test runner specification using standard `@firebase/rules-unit-testing` logic for test cases.

```typescript
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "my-lean-canvas-staging",
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore Security Rules Tests", () => {
  it("rejects non-admin event creation (Pillar 4 / Tiered permissions)", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    // try to write an event - should fail
  });
  
  it("rejects booking modifications by users other than the owner (Pillar 1 / Relational Sync)", async () => {
    const context = testEnv.authenticatedContext("user_123");
    // try modifying booking of user_456 - should fail
  });

  it("shields booking finalized state from non-admin updates (Pillar 6 / Terminal State)", async () => {
    // try signing up for a closed/finalised event - should fail
  });
});
```
