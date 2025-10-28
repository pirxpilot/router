import { describe, it } from 'node:test';
import Router from '../index.js';
import { createServer, request } from './support/utils.js';

describe('HEAD', () => {
  it('should invoke get without head', (_, done) => {
    const router = Router();
    const server = createServer(router);

    router.get('/users', sethit(1), saw);

    request(server).head('/users').expect('Content-Type', 'text/plain').expect('x-fn-1', 'hit').expect(200, done);
  });

  it('should invoke head if prior to get', (_, done) => {
    const router = Router();
    const server = createServer(router);

    router.head('/users', sethit(1), saw);
    router.get('/users', sethit(2), saw);

    request(server).head('/users').expect('Content-Type', 'text/plain').expect('x-fn-1', 'hit').expect(200, done);
  });
});

function saw(req, res) {
  const msg = `saw ${req.method} ${req.url}`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end(msg);
}

function sethit(num) {
  const name = `x-fn-${String(num)}`;
  return function hit(_req, res, next) {
    res.setHeader(name, 'hit');
    next();
  };
}
