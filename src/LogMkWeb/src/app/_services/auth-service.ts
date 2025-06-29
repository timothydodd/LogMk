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
  private refreshTokenKey = 'refreshToken';
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  private http = inject(HttpClient);
  private router = inject(Router);

  isLoggedIn = new BehaviorSubject<boolean>(false);

  constructor() {
    const token = this.getToken();
    this.isLoggedIn.next(token !== null);
  }

  login(userName: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, { userName, password }).pipe(
      tap((response) => {
        this.storeTokens(response.accessToken, response.refreshToken);
        this.isLoggedIn.next(true);
      })
    );
  }

  changePassword(request: ChangePasswordRequest) {
    return this.http.post(`${environment.apiUrl}/api/auth/change-password`, request);
  }

  getUser() {
    return this.http.get<User>(`${environment.apiUrl}/api/auth/user`).pipe(shareReplay(1));
  }

  async logout() {
    // Only call the logout API if we have a valid token
    if (this.isAuthenticated()) {
      try {
        await this.http.post(`${environment.apiUrl}/api/auth/logout`, {}).toPromise();
      } catch (error) {
        // Ignore errors during logout - we're logging out anyway
        console.warn('Logout API call failed, but continuing with local logout:', error);
      }
    }

    this.clearTokens();
    this.isLoggedIn.next(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    
    // For now, just check if token exists and is properly formatted
    // Token expiration will be handled by the interceptor
    try {
      const payload = this.getTokenPayload(token);
      return payload !== null;
    } catch {
      return false;
    }
  }

  getCurrentUserId(): string | null {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = this.getTokenPayload(token);
      return payload?.['user-id'] || null;
    } catch (error) {
      console.error('Error parsing token:', error);
      return null;
    }
  }

  getCurrentUsername(): string | null {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = this.getTokenPayload(token);
      return payload?.sub || null;
    } catch (error) {
      console.error('Error parsing token:', error);
      return null;
    }
  }

  isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;

    try {
      const payload = this.getTokenPayload(token);
      if (!payload?.exp) return true;

      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      console.error('Error parsing token:', error);
      return true;
    }
  }

  private getTokenPayload(token: string): any {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    try {
      const payload = parts[1];
      // Add padding if needed for base64 decoding
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch (error) {
      throw new Error('Failed to decode JWT payload');
    }
  }

  private storeTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(this.tokenKey, accessToken);
    localStorage.setItem(this.refreshTokenKey, refreshToken);
  }

  private clearTokens() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
  }

  // Method to clear auth state without API call (for error scenarios)
  clearAuthState() {
    this.clearTokens();
    this.isLoggedIn.next(false);
    this.isRefreshing = false;
    this.refreshTokenSubject.next(null);
  }

  async refreshToken(): Promise<string | null> {
    const refreshToken = this.getRefreshToken();
    const accessToken = this.getToken();

    if (!refreshToken || !accessToken) {
      this.clearTokens();
      this.isLoggedIn.next(false);
      return null;
    }

    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        const subscription = this.refreshTokenSubject.subscribe((token) => {
          if (token !== null) {
            subscription.unsubscribe();
            resolve(token);
          }
        });

        // Add timeout to prevent infinite waiting
        setTimeout(() => {
          subscription.unsubscribe();
          reject('Token refresh timeout');
        }, 10000);
      });
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    try {
      const response = await this.http
        .post<LoginResponse>(`${environment.apiUrl}/api/auth/refresh`, { accessToken, refreshToken })
        .toPromise();

      if (response) {
        this.storeTokens(response.accessToken, response.refreshToken);
        this.refreshTokenSubject.next(response.accessToken);
        this.isLoggedIn.next(true);
        return response.accessToken;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      this.isLoggedIn.next(false);
      this.refreshTokenSubject.next('');
      // Don't navigate here to avoid conflicts with interceptor
    } finally {
      this.isRefreshing = false;
    }

    return null;
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

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
