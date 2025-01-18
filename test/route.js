const { it, describe } = require('node:test')
const assert = require('node:assert/strict')
const { METHODS } = require('node:http')
const Router = require('..')
const utils = require('./support/utils')

const methods = METHODS.map(m => m.toLowerCase())
const createHitHandle = utils.createHitHandle
const createServer = utils.createServer
const request = utils.request
const shouldHaveBody = utils.shouldHaveBody
const shouldHitHandle = utils.shouldHitHandle
const shouldNotHaveBody = utils.shouldNotHaveBody
const shouldNotHitHandle = utils.shouldNotHitHandle

const describePromises = global.Promise ? describe : describe.skip

describe('Router', function () {
  describe('.route(path)', function () {
    it('should return a new route', function () {
      const router = new Router()
      const route = router.route('/foo')
      assert.equal(route.path, '/foo')
    })

    it('should respond to multiple methods', async function () {
      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(router)

      route.get(saw)
      route.post(saw)

      await request(server)
        .get('/foo')
        .expect(200, 'saw GET /foo')
      await request(server)
        .post('/foo')
        .expect(200, 'saw POST /foo')
      await request(server)
        .put('/foo')
        .expect(404)
    })

    it('should route without method', function (_, done) {
      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(function (req, res, next) {
        req.method = undefined
        router(req, res, next)
      })

      route.post(createHitHandle(1))
      route.all(createHitHandle(2))
      route.get(createHitHandle(3))

      router.get('/foo', createHitHandle(4))
      router.use(saw)

      request(server)
        .get('/foo')
        .expect(shouldNotHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(shouldNotHitHandle(3))
        .expect(shouldNotHitHandle(4))
        .expect(200, 'saw undefined /foo', done)
    })

    it('should stack', async function () {
      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(router)

      route.post(createHitHandle(1))
      route.all(createHitHandle(2))
      route.get(createHitHandle(3))

      router.use(saw)

      await request(server)
        .get('/foo')
        .expect('x-fn-2', 'hit')
        .expect('x-fn-3', 'hit')
        .expect(200, 'saw GET /foo')
      await request(server)
        .post('/foo')
        .expect('x-fn-1', 'hit')
        .expect('x-fn-2', 'hit')
        .expect(200, 'saw POST /foo')
      await request(server)
        .put('/foo')
        .expect('x-fn-2', 'hit')
        .expect(200, 'saw PUT /foo')
    })

    it('should not error on empty route', async function () {
      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(router)

      assert.ok(route)

      await request(server)
        .get('/foo')
        .expect(404)
      await request(server)
        .head('/foo')
        .expect(404)
    })

    it('should not invoke singular error route', function (_, done) {
      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(router)

      route.all(function handleError (err, req, res, next) {
        throw err || new Error('boom!')
      })

      request(server)
        .get('/foo')
        .expect(404, done)
    })

    it('should not stack overflow with a large sync stack', function (_, done) {
      // long-running test

      const router = new Router()
      const route = router.route('/foo')
      const server = createServer(router)

      for (let i = 0; i < 6000; i++) {
        route.all(function (req, res, next) { next() })
      }

      route.get(helloWorld)

      request(server)
        .get('/foo')
        .expect(200, 'hello, world', done)
    })

    describe('.all(...fn)', function () {
      it('should reject no arguments', function () {
        const router = new Router()
        const route = router.route('/')
        assert.throws(route.all.bind(route), /argument handler is required/)
      })

      it('should reject empty array', function () {
        const router = new Router()
        const route = router.route('/')
        assert.throws(route.all.bind(route, []), /argument handler is required/)
      })

      it('should reject invalid fn', function () {
        const router = new Router()
        const route = router.route('/')
        assert.throws(route.all.bind(route, 2), /argument handler must be a function/)
      })

      it('should respond to all methods', async function () {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo')
        await request(server)
          .post('/foo')
          .expect(200, 'saw POST /foo')
        await request(server)
          .put('/foo')
          .expect(200, 'saw PUT /foo')
      })

      it('should accept multiple arguments', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(createHitHandle(1), createHitHandle(2), helloWorld)

        request(server)
          .get('/foo')
          .expect('x-fn-1', 'hit')
          .expect('x-fn-2', 'hit')
          .expect(200, 'hello, world', done)
      })

      it('should accept single array of handlers', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all([createHitHandle(1), createHitHandle(2), helloWorld])

        request(server)
          .get('/foo')
          .expect('x-fn-1', 'hit')
          .expect('x-fn-2', 'hit')
          .expect(200, 'hello, world', done)
      })

      it('should accept nested arrays of handlers', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all([[createHitHandle(1), createHitHandle(2)], createHitHandle(3)], helloWorld)

        request(server)
          .get('/foo')
          .expect('x-fn-1', 'hit')
          .expect('x-fn-2', 'hit')
          .expect('x-fn-3', 'hit')
          .expect(200, 'hello, world', done)
      })
    })

    methods.slice().sort().forEach(function (method) {
      if (method === 'connect') {
        // CONNECT is tricky and supertest doesn't support it
        return
      }
      if (method === 'query' && process.version.startsWith('v21')) {
        return
      }

      const body = method !== 'head'
        ? shouldHaveBody(Buffer.from('hello, world'))
        : shouldNotHaveBody()

      describe('.' + method + '(...fn)', function () {
        it('should respond to a ' + method.toUpperCase() + ' request', function (_, done) {
          const router = new Router()
          const route = router.route('/')
          const server = createServer(router)

          route[method](helloWorld)

          request(server)[method]('/')
            .expect(200)
            .expect(body)
            .end(done)
        })

        it('should reject no arguments', function () {
          const router = new Router()
          const route = router.route('/')
          assert.throws(route[method].bind(route), /argument handler is required/)
        })

        it('should reject empty array', function () {
          const router = new Router()
          const route = router.route('/')
          assert.throws(route[method].bind(route, []), /argument handler is required/)
        })

        it('should reject invalid fn', function () {
          const router = new Router()
          const route = router.route('/')
          assert.throws(route[method].bind(route, 2), /argument handler must be a function/)
        })

        it('should accept multiple arguments', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route[method](createHitHandle(1), createHitHandle(2), helloWorld)

          request(server)[method]('/foo')
            .expect(200)
            .expect('x-fn-1', 'hit')
            .expect('x-fn-2', 'hit')
            .expect(body)
            .end(done)
        })

        it('should accept single array of handlers', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route[method]([createHitHandle(1), createHitHandle(2), helloWorld])

          request(server)[method]('/foo')
            .expect(200)
            .expect('x-fn-1', 'hit')
            .expect('x-fn-2', 'hit')
            .expect(body)
            .end(done)
        })

        it('should accept nested arrays of handlers', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route[method]([[createHitHandle(1), createHitHandle(2)], createHitHandle(3)], helloWorld)

          request(server)[method]('/foo')
            .expect(200)
            .expect('x-fn-1', 'hit')
            .expect('x-fn-2', 'hit')
            .expect('x-fn-3', 'hit')
            .expect(body)
            .end(done)
        })
      })
    })

    describe('error handling', function () {
      it('should handle errors from next(err)', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          next(new Error('boom!'))
        })

        route.all(helloWorld)

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect(500, 'caught: boom!', done)
      })

      it('should handle errors thrown', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          throw new Error('boom!')
        })

        route.all(helloWorld)

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect(500, 'caught: boom!', done)
      })

      it('should handle errors thrown in error handlers', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          throw new Error('boom!')
        })

        route.all(function handleError (err, req, res, next) {
          throw new Error('ouch: ' + err.message)
        })

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect(500, 'caught: ouch: boom!', done)
      })
    })

    describe('next("route")', function () {
      it('should invoke next handler', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.get(function handle (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        router.use(saw)

        request(server)
          .get('/foo')
          .expect('x-next', 'route')
          .expect(200, 'saw GET /foo', done)
      })

      it('should invoke next route', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.get(function handle (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        router.route('/foo').all(saw)

        request(server)
          .get('/foo')
          .expect('x-next', 'route')
          .expect(200, 'saw GET /foo', done)
      })

      it('should skip next handlers in route', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(createHitHandle(1))
        route.get(function goNext (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })
        route.all(createHitHandle(2))

        router.use(saw)

        request(server)
          .get('/foo')
          .expect(shouldHitHandle(1))
          .expect('x-next', 'route')
          .expect(shouldNotHitHandle(2))
          .expect(200, 'saw GET /foo', done)
      })

      it('should not invoke error handlers', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function goNext (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect('x-next', 'route')
          .expect(404, done)
      })
    })

    describe('next("router")', function () {
      it('should exit the router', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        function handle (req, res, next) {
          res.setHeader('x-next', 'router')
          next('router')
        }

        route.get(handle, createHitHandle(1))

        router.use(saw)

        request(server)
          .get('/foo')
          .expect('x-next', 'router')
          .expect(shouldNotHitHandle(1))
          .expect(404, done)
      })

      it('should not invoke error handlers', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function goNext (req, res, next) {
          res.setHeader('x-next', 'router')
          next('router')
        })

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        router.use(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect('x-next', 'router')
          .expect(404, done)
      })
    })

    describePromises('promise support', function () {
      it('should pass rejected promise value', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          return Promise.reject(new Error('boom!'))
        })

        route.all(helloWorld)

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect(500, 'caught: boom!', done)
      })

      it('should pass rejected promise without value', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
        })

        route.all(helloWorld)

        route.all(function handleError (err, req, res, next) {
          res.statusCode = 500
          res.end('caught: ' + err.message)
        })

        request(server)
          .get('/foo')
          .expect(500, 'caught: Rejected promise', done)
      })

      it('should ignore resolved promise', function (_, done) {
        const router = new Router()
        const route = router.route('/foo')
        const server = createServer(router)

        route.all(function createError (req, res, next) {
          saw(req, res)
          return Promise.resolve('foo')
        })

        route.all(function () {
          done(new Error('Unexpected route invoke'))
        })

        request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo', done)
      })

      describe('error handling', function () {
        it('should pass rejected promise value', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route.all(function createError (req, res, next) {
            return Promise.reject(new Error('boom!'))
          })

          route.all(function handleError (err, req, res, next) {
            return Promise.reject(new Error('caught: ' + err.message))
          })

          route.all(function handleError (err, req, res, next) {
            res.statusCode = 500
            res.end('caught again: ' + err.message)
          })

          request(server)
            .get('/foo')
            .expect(500, 'caught again: caught: boom!', done)
        })

        it('should pass rejected promise without value', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route.all(function createError (req, res, next) {
            return Promise.reject(new Error('boom!'))
          })

          route.all(function handleError (err, req, res, next) {
            assert.equal(err.message, 'boom!')
            return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
          })

          route.all(function handleError (err, req, res, next) {
            res.statusCode = 500
            res.end('caught again: ' + err.message)
          })

          request(server)
            .get('/foo')
            .expect(500, 'caught again: Rejected promise', done)
        })

        it('should ignore resolved promise', function (_, done) {
          const router = new Router()
          const route = router.route('/foo')
          const server = createServer(router)

          route.all(function createError (req, res, next) {
            return Promise.reject(new Error('boom!'))
          })

          route.all(function handleError (err, req, res, next) {
            res.statusCode = 500
            res.end('caught: ' + err.message)
            return Promise.resolve('foo')
          })

          route.all(function () {
            done(new Error('Unexpected route invoke'))
          })

          request(server)
            .get('/foo')
            .expect(500, 'caught: boom!', done)
        })
      })
    })

    describe('path', function () {
      describe('using ":name"', function () {
        it('should name a capture group', function (_, done) {
          const router = new Router()
          const route = router.route('/:foo')
          const server = createServer(router)

          route.all(sendParams)

          request(server)
            .get('/bar')
            .expect(200, { foo: 'bar' }, done)
        })

        it('should match single path segment', function (_, done) {
          const router = new Router()
          const route = router.route('/:foo')
          const server = createServer(router)

          route.all(sendParams)

          request(server)
            .get('/bar/bar')
            .expect(404, done)
        })

        it('should work multiple times', function (_, done) {
          const router = new Router()
          const route = router.route('/:foo/:bar')
          const server = createServer(router)

          route.all(sendParams)

          request(server)
            .get('/fizz/buzz')
            .expect(200, { foo: 'fizz', bar: 'buzz' }, done)
        })

        it('should work inside literal paranthesis', function (_, done) {
          const router = new Router()
          const route = router.route('/:user\\(:op\\)')
          const server = createServer(router)

          route.all(sendParams)

          request(server)
            .get('/tj(edit)')
            .expect(200, { user: 'tj', op: 'edit' }, done)
        })

        it('should work within arrays', async function () {
          const router = new Router()
          const route = router.route(['/user/:user/poke', '/user/:user/pokes'])
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/user/tj/poke')
            .expect(200, { user: 'tj' })
          await request(server)
            .get('/user/tj/pokes')
            .expect(200, { user: 'tj' })
        })
      })

      describe('using "{:name}"', function () {
        it('should name an optional parameter', async function () {
          const router = new Router()
          const route = router.route('{/:foo}')
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/bar')
            .expect(200, { foo: 'bar' })
          await request(server)
            .get('/')
            .expect(200, {})
        })

        it('should work in any segment', async function () {
          const router = new Router()
          const route = router.route('/user{/:foo}/delete')
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/user/bar/delete')
            .expect(200, { foo: 'bar' })
          await request(server)
            .get('/user/delete')
            .expect(200, {})
        })
      })

      describe('using "*name"', function () {
        it('should name a zero-or-more repeated parameter', async function () {
          const router = new Router()
          const route = router.route('{/*foo}')
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/')
            .expect(200, {})
          await request(server)
            .get('/bar')
            .expect(200, { foo: ['bar'] })
          await request(server)
            .get('/fizz/buzz')
            .expect(200, { foo: ['fizz', 'buzz'] })
        })

        it('should work in any segment', async function () {
          const router = new Router()
          const route = router.route('/user{/*foo}/delete')
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/user/delete')
            .expect(200, {})
          await request(server)
            .get('/user/bar/delete')
            .expect(200, { foo: ['bar'] })
          await request(server)
            .get('/user/fizz/buzz/delete')
            .expect(200, { foo: ['fizz', 'buzz'] })
        })
      })

      describe('using regular expression with param name "(?<name>pattern)"', function () {
        it('should limit capture group to regexp match', async function () {
          const router = new Router()
          const route = router.route(/\/(?<foo>[0-9]+)/)
          const server = createServer(router)

          route.all(sendParams)

          await request(server)
            .get('/foo')
            .expect(404)
          await request(server)
            .get('/42')
            .expect(200, { foo: '42' })
        })
      })

      describe('using "(regexp)"', function () {
        it('should add capture group using regexp', async function () {
          const router = new Router()
          const route = router.route(/\/page_([0-9]+)/)
          const server = createServer(router)

          route.all(sendParams)
          await request(server)
            .get('/page_foo')
            .expect(404)
          await request(server)
            .get('/page_42')
            .expect(200, { 0: '42' })
        })

        it('should not treat regexp as literal regexp', function () {
          const router = new Router()
          assert.throws(function () {
            router.route('/([a-z]+:n[0-9]+)')
          }, /TypeError: Unexpected \( at/)
        })
      })
    })
  })
})

function helloWorld (req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('hello, world')
}

function saw (req, res) {
  const msg = 'saw ' + req.method + ' ' + req.url
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}

function sendParams (req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(req.params))
}
