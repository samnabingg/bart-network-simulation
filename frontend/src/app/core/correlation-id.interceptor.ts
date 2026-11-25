import { HttpInterceptorFn } from '@angular/common/http';

/** Tags every API call so it can be found in the backend logs (X-Correlation-Id). */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.headers.has('X-Correlation-Id')) return next(req);
  return next(req.clone({ setHeaders: { 'X-Correlation-Id': crypto.randomUUID() } }));
};
