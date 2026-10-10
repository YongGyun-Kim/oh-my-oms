import { ExecutionBudget } from '@oms/contracts';
import type { Request, Response, NextFunction } from 'express';
const budgets = new WeakMap<Request, ExecutionBudget>();
export function requestBudget(request: Request): ExecutionBudget {
  const budget = budgets.get(request);
  if (!budget) throw new Error('서버 요청 기한이 없습니다.');
  return budget;
}
export function captureRequestBudget(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const controller = new AbortController();
  const duration = request.method === 'GET' ? 5000 : 10000;
  const budget = new ExecutionBudget(duration, () => Date.now(), controller.signal);
  budgets.set(request, budget);
  const timer = setTimeout(() => {
    controller.abort();
    if (!response.writableEnded)
      response
        .status(503)
        .type('application/problem+json')
        .json({ status: 503, detail: '원래 요청 결과를 확인하세요.' });
    request.destroy();
  }, duration);
  const disconnected = () => controller.abort();
  const finished = () => {
    clearTimeout(timer);
    request.removeListener('aborted', disconnected);
    response.removeListener('close', closed);
    response.removeListener('finish', finished);
    budgets.delete(request);
  };
  const closed = () => {
    if (!response.writableFinished) controller.abort();
    finished();
  };
  request.once('aborted', disconnected);
  response.once('close', closed);
  response.once('finish', finished);
  next();
}
