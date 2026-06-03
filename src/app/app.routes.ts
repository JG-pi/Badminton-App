import { Routes } from '@angular/router';
import { Dashboard } from './dashboard';
import { Login } from './login';
import { Admin } from './admin';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'login', component: Login },
  { path: 'admin', component: Admin },
  { path: '**', redirectTo: '' }
];
