import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: number;
  phone?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: 'Missing or invalid authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: number; phone: string };
    req.userId = payload.userId;
    req.phone = payload.phone;
    next();
  } catch {
    res.status(401).json({ code: 401, message: 'Invalid or expired token' });
  }
}
