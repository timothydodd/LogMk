import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private tokenKey = 'authToken';

  private http = inject(HttpClient);
  private router = inject(Router);

  isLoggedIn = new BehaviorSubject<boolean>(false);

  constructor() {
    const token = this.getToken();
    this.isLoggedIn.next(token !== null);
  }
  login(userName: string, password: string) {
    return this.http.post<{ token: string }>(`${environment.apiUrl}/api/auth/login`, { userName, password }).pipe(
      tap((response) => {
        localStorage.setItem(this.tokenKey, response?.token);
        this.isLoggedIn.next(!!response?.token);
      })
    );
  }
  changePassword(request: ChangePasswordRequest) {
    return this.http.post(`${environment.apiUrl}/api/auth/change-password`, request);
  }
  getUser() {
    return this.http.get<User>(`${environment.apiUrl}/api/auth/user`).pipe(shareReplay(1));
  }
  logout() {
    localStorage.removeItem(this.tokenKey);
    this.isLoggedIn.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }
}

export interface User {
  id: number;
  userName: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}
