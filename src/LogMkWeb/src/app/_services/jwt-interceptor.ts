import {
  HTTP_INTERCEPTORS,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, filter, Observable, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth-service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip token attachment and 401 handling for auth endpoints
    if (
      request.url.includes('/auth/login') ||
      request.url.includes('/auth/refresh') ||
      request.url.includes('/auth/logout')
    ) {
      return next.handle(request).pipe(
        catchError((error) => {
          return this.handleError(error);
        })
      );
    }

    const token = this.authService.getToken();

    if (token) {
      request = this.addTokenToRequest(request, token);
    }

    return next.handle(request).pipe(
      catchError((error) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return this.handle401Error(request, next);
        }

        return this.handleError(error);
      })
    );
  }

  private addTokenToRequest(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Don't try to refresh if we don't have tokens
    if (!this.authService.getToken() || !this.authService.getRefreshToken()) {
      this.authService.clearAuthState();
      return throwError(() => 'No valid tokens available');
    }

    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return new Observable((observer) => {
        this.authService
          .refreshToken()
          .then((token) => {
            if (token) {
              this.refreshTokenSubject.next(token);
              observer.next(null);
              observer.complete();
            } else {
              this.authService.clearAuthState();
              observer.error('Token refresh failed');
            }
          })
          .catch((error) => {
            observer.error(error);
          })
          .finally(() => {
            this.isRefreshing = false;
          });
      }).pipe(
        switchMap(() => {
          const newToken = this.authService.getToken();
          if (newToken) {
            return next.handle(this.addTokenToRequest(request, newToken));
          } else {
            return throwError(() => 'No token available after refresh');
          }
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => {
          return next.handle(this.addTokenToRequest(request, token!));
        })
      );
    }
  }

  private handleError(err: any): Observable<never> {
    let error = '';
    if (err) {
      if (err.error) {
        const val = err.error as ValidationError;
        if (val && val.errors) {
          return throwError(() => val);
        }
      }
      if (err.message) {
        error = err.message;
      } else if (err.error && err.error.message) {
        error = err.error.message || err.statusText;
      }
    }
    return throwError(() => error);
  }
}

export const JwtInterceptorProvider = {
  provide: HTTP_INTERCEPTORS,
  useClass: JwtInterceptor,
  multi: true,
};
export interface ValidationError {
  message: string;
  errors: FieldError[];
}
export interface FieldError {
  message: string;
  field: string;
}
