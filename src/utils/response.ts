import { Response } from 'express';

export function success<T>(res: Response, data: T, message = 'ok') {
  res.json({ code: 0, message, data });
}

export function fail(res: Response, message: string, status = 400, code = status) {
  res.status(status).json({ code, message });
}
