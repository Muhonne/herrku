export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const unauthorized = (message = 'Authentication required'): HttpError =>
  new HttpError(401, 'unauthorized', message)

export const forbidden = (message = 'You do not have permission to do that'): HttpError =>
  new HttpError(403, 'forbidden', message)

export const notFound = (message = 'Not found'): HttpError => new HttpError(404, 'not_found', message)

export const conflict = (code: string, message: string): HttpError => new HttpError(409, code, message)

export const badRequest = (code: string, message: string): HttpError =>
  new HttpError(400, code, message)
