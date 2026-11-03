export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, issues?: { path: string; message: string }[]) =>
  new HttpError(400, message, issues);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
