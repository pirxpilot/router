import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Router from '../index.js';
import { createHitHandle, createServer, request, shouldHitHandle, shouldNotHitHandle } from './support/utils.js';

describe('Router', () => {
  describe('.param(name, fn)', () => {
    it('should reject missing name', () => {
      const router = new Router();
      assert.throws(router.param.bind(router), /argument name is required/);
    });

    it('should reject bad name', () => {
      const router = new Router();
      assert.throws(router.param.bind(router, 42), /argument name must be a string/);
    });

    it('should reject missing fn', () => {
      const router = new Router();
      assert.throws(router.param.bind(router, 'id'), /argument fn is required/);
    });

    it('should reject bad fn', () => {
      const router = new Router();
      assert.throws(router.param.bind(router, 'id', 42), /argument fn must be a function/);
    });

    it('should map logic for a path param', async () => {
      const router = new Router();
      const server = createServer(router);

      router.param('id', function parseId(req, _res, next, val) {
        req.params.id = Number(val);
        next();
      });

      router.get('/user/:id', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id}`);
      });

      await request(server).get('/user/2').expect(200, 'get user 2');
      await request(server).get('/user/bob').expect(200, 'get user NaN');
    });

    it('should allow chaining', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('id', function parseId(req, _res, next, val) {
        req.params.id = Number(val);
        next();
      });

      router.param('id', function parseId(req, _res, next, val) {
        req.itemId = Number(val);
        next();
      });

      router.get('/user/:id', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id} (${req.itemId})`);
      });

      request(server).get('/user/2').expect(200, 'get user 2 (2)', done);
    });

    it('should automatically decode path value', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(req, _res, next, user) {
        req.user = user;
        next();
      });

      router.get('/user/:id', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id}`);
      });

      request(server).get('/user/%22bob%2Frobert%22').expect('get user "bob/robert"', done);
    });

    it('should 400 on invalid path value', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(req, _res, next, user) {
        req.user = user;
        next();
      });

      router.get('/user/:id', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id}`);
      });

      request(server)
        .get('/user/%bob')
        .expect(400, /URIError: Failed to decode param/, done);
    });

    it('should only invoke fn when necessary', async () => {
      const router = new Router();
      const server = createServer(router);

      router.param('id', function parseId(_req, res, next, val) {
        res.setHeader('x-id', val);
        next();
      });

      router.param('user', function parseUser(_req, _res, _next, _user) {
        throw new Error('boom');
      });

      router.get('/user/:user', saw);
      router.put('/user/:id', saw);

      await request(server)
        .get('/user/bob')
        .expect(500, /Error: boom/);
      await request(server).put('/user/bob').expect('x-id', 'bob').expect(200, 'saw PUT /user/bob');
    });

    it('should only invoke fn once per request', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(req, _res, next, user) {
        req.count = (req.count || 0) + 1;
        req.user = user;
        next();
      });

      router.get('/user/:user', sethit(1));
      router.get('/user/:user', sethit(2));

      router.use((req, res) => {
        res.end(`get user ${req.user} ${req.count} times`);
      });

      request(server).get('/user/bob').expect('get user bob 1 times', done);
    });

    it('should keep changes to req.params value', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('id', function parseUser(req, _res, next, val) {
        req.count = (req.count || 0) + 1;
        req.params.id = Number(val);
        next();
      });

      router.get('/user/:id', (req, res, next) => {
        res.setHeader('x-user-id', req.params.id);
        next();
      });

      router.get('/user/:id', (req, res) => {
        res.end(`get user ${req.params.id} ${req.count} times`);
      });

      request(server).get('/user/01').expect('get user 1 1 times', done);
    });

    it('should invoke fn if path value differs', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(req, _res, next, user) {
        req.count = (req.count || 0) + 1;
        req.user = user;
        req.vals = (req.vals || []).concat(user);
        next();
      });

      router.get('/:user/bob', sethit(1));
      router.get('/user/:user', sethit(2));

      router.use((req, res) => {
        res.end(`get user ${req.user} ${req.count} times: ${req.vals.join(', ')}`);
      });

      request(server).get('/user/bob').expect('get user bob 2 times: user, bob', done);
    });

    it('should catch exception in fn', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(_req, _res, _next, _user) {
        throw new Error('boom');
      });

      router.get('/user/:user', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id}`);
      });

      request(server)
        .get('/user/bob')
        .expect(500, /Error: boom/, done);
    });

    it('should catch exception in chained fn', (_, done) => {
      const router = new Router();
      const server = createServer(router);

      router.param('user', function parseUser(_req, _res, next, _user) {
        process.nextTick(next);
      });

      router.param('user', function parseUser(_req, _res, _next, _user) {
        throw new Error('boom');
      });

      router.get('/user/:user', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`get user ${req.params.id}`);
      });

      request(server)
        .get('/user/bob')
        .expect(500, /Error: boom/, done);
    });

    describe('promise support', () => {
      it('should pass rejected promise value', (_, done) => {
        const router = new Router();
        const server = createServer(router);

        router.param('user', function parseUser(_req, _res, _next, _user) {
          return Promise.reject(new Error('boom'));
        });

        router.get('/user/:user', (req, res) => {
          res.setHeader('Content-Type', 'text/plain');
          res.end(`get user ${req.params.id}`);
        });

        request(server)
          .get('/user/bob')
          .expect(500, /Error: boom/, done);
      });

      it('should pass rejected promise without value', (_, done) => {
        const router = new Router();
        const server = createServer(router);

        router.use(function createError(_req, _res, _next) {
          return Promise.reject(); // eslint-disable-line prefer-promise-reject-errors
        });

        router.param('user', function parseUser(_req, _res, _next, _user) {
          return Promise.reject(); // eslint-disable-line prefer-promise-reject-errors
        });

        router.get('/user/:user', (req, res) => {
          res.setHeader('Content-Type', 'text/plain');
          res.end(`get user ${req.params.id}`);
        });

        request(server)
          .get('/user/bob')
          .expect(500, /Error: Rejected promise/, done);
      });
    });

    describe('next("route")', () => {
      it('should cause route with param to be skipped', async () => {
        const router = new Router();
        const server = createServer(router);

        router.param('id', function parseId(req, _res, next, val) {
          const id = Number(val);

          if (Number.isNaN(id)) {
            return next('route');
          }

          req.params.id = id;
          next();
        });

        router.get('/user/:id', (req, res) => {
          res.setHeader('Content-Type', 'text/plain');
          res.end(`get user ${req.params.id}`);
        });

        router.get('/user/new', (_req, res) => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/plain');
          res.end('cannot get a new user');
        });

        await request(server).get('/user/2').expect(200, 'get user 2');
        await request(server).get('/user/bob').expect(404);
        await request(server).get('/user/new').expect(400, 'cannot get a new user');
      });

      it('should invoke fn if path value differs', (_, done) => {
        const router = new Router();
        const server = createServer(router);

        router.param('user', function parseUser(req, _res, next, user) {
          req.count = (req.count || 0) + 1;
          req.user = user;
          req.vals = (req.vals || []).concat(user);
          next(user === 'user' ? 'route' : null);
        });

        router.get('/:user/bob', createHitHandle(1));
        router.get('/user/:user', createHitHandle(2));

        router.use((req, res) => {
          res.end(`get user ${req.user} ${req.count} times: ${req.vals.join(', ')}`);
        });

        request(server)
          .get('/user/bob')
          .expect(shouldNotHitHandle(1))
          .expect(shouldHitHandle(2))
          .expect('get user bob 2 times: user, bob', done);
      });
    });

    it('should call param callbacks in order of appearance in pattern', (_, done) => {
      const router = new Router();
      const server = createServer(router);
      const callOrder = [];

      router.param('user', function parseUser(req, _res, next, user) {
        callOrder.push('user');
        req.user = user;
        next();
      });

      router.param('book', function parseBook(req, _res, next, book) {
        callOrder.push('book');
        req.book = book;
        next();
      });

      router.get('/user/:user/book/:book', (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(`user: ${req.user}, book: ${req.book}, order: ${callOrder.join(',')}`);
      });

      request(server).get('/user/john/book/1984').expect('user: john, book: 1984, order: user,book', done);
    });
  });
});

function sethit(num) {
  const name = `x-fn-${String(num)}`;
  return function hit(_req, res, next) {
    res.setHeader(name, 'hit');
    next();
  };
}

function saw(req, res) {
  const msg = `saw ${req.method} ${req.url}`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end(msg);
}
