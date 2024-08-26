import { HTTP_INTERCEPTORS, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { AuthService } from './auth-service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.getToken();

    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(request).pipe(
      catchError((err) => {
        if (err.status === 401) {
          // auto logout if 401 response returned from api
          this.authService.logout();
        }

        let error = '';
        if (err) {
          if (err.error) {
            const val = err.error as ValidationError;

            if (val) {
              return throwError(val);
            }
          }
          if (err.message) {
            error = err.message;
          } else if (err.error && err.error.message) {
            error = err.error.message || err.statusText;
          }
        }
        return throwError(() => {
          return error;
        });
      })
    );
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
