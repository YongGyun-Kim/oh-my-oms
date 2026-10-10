import type { NextFunction, Request, Response } from 'express';
export class HttpAdmission {
  private active = 0;
  constructor(private readonly maximum = 25) {
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100)
      throw new Error('유한 HTTP 동시 처리 슬롯이 필요합니다.');
  }
  handle = (_request: Request, response: Response, next: NextFunction): void => {
    if (this.active >= this.maximum) {
      response
        .status(503)
        .type('application/problem+json')
        .json({ status: 503, detail: '현재 접점 처리 용량을 확인하고 원래 요청을 대조하세요.' });
      return;
    }
    this.active++;
    let finished = false;
    const release = () => {
      if (finished) return;
      finished = true;
      this.active--;
      response.removeListener('finish', release);
      response.removeListener('close', release);
    };
    response.once('finish', release);
    response.once('close', release);
    next();
  };
}
export const processHttpAdmission = new HttpAdmission(25);
