import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import makeMatcher from '../lib/matcher.js';

describe('using `:name`', () => {
  it('should name a capture group', () => {
    const match = makeMatcher('/:foo');

    const m = match('/bar');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.deepEqual(m.keys, ['foo']);
    assert.equal(m.path, '/bar');
  });

  it('should match single path segment', () => {
    const match = makeMatcher('/:foo');

    assert.ok(!match('/bar/bar'));
  });

  it('should allow regex', () => {
    const match = makeMatcher('/:foo(\\d+)');
    assert.ok(!match('/bar'));

    const m = match('/123');
    assert.deepEqual(m.params, { foo: '123' });
    assert.equal(m.path, '/123');

    assert.ok(!match('/abc'));
  });

  it('should work multiple times', () => {
    const match = makeMatcher('/:foo/:bar');

    const m = match('/fizz/buzz');
    assert.deepEqual(m.params, { foo: 'fizz', bar: 'buzz' });
    assert.equal(m.path, '/fizz/buzz');
  });

  it('should work inside literal paranthesis', () => {
    const match = makeMatcher('/:user\\(:op\\)');

    const m = match('/tj(edit)');
    assert.deepEqual(m.params, { user: 'tj', op: 'edit' });
    assert.equal(m.path, '/tj(edit)');
  });
});

describe('using `:name?`', () => {
  it('should name an optional parameter', async () => {
    const match = makeMatcher('/:foo?');

    let m = match('/bar');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/bar');
    m = match('/');
    assert.deepEqual(m.params, {});
    assert.equal(m.path, '/');
  });

  it('should work in any segment', async () => {
    const match = makeMatcher('/user/:foo?/delete');

    let m = match('/user/bar/delete');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/user/bar/delete');
    m = match('/user/delete');
    assert.deepEqual(m.params, {});
    assert.equal(m.path, '/user/delete');
  });
});

describe('using `:name*`', () => {
  it('should name a zero-or-more repeated parameter', async () => {
    const match = makeMatcher('/:foo*');

    let m = match('/');
    assert.deepEqual(m.params, {});
    assert.equal(m.path, '/');
    m = match('/bar');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/bar');
    m = match('/fizz/buzz');
    assert.deepEqual(m.params, { foo: 'fizz/buzz' });
    assert.equal(m.path, '/fizz/buzz');
  });

  it('should work in any segment', async () => {
    const match = makeMatcher('/user/:foo*/delete');

    let m = match('/user/delete');
    assert.deepEqual(m.params, {});
    assert.equal(m.path, '/user/delete');
    m = match('/user/bar/delete');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/user/bar/delete');
    m = match('/user/fizz/buzz/delete');
    assert.deepEqual(m.params, { foo: 'fizz/buzz' });
    assert.equal(m.path, '/user/fizz/buzz/delete');
  });
});

describe('options: end', () => {
  it('should not match a path with extra segments when `end` is true (default)', () => {
    const match = makeMatcher('/user');

    // default behavior: must match to the end
    assert.ok(!match('/user/123'), 'expected /user not to match /user/123 when end is true');
  });

  it('should match a path with extra segments when `end` is false', () => {
    const match = makeMatcher('/user', { end: false });

    const m = match('/user/123');
    assert.ok(m, 'expected /user to match /user/123 when end is false');
    // when there are no named params, params should be empty object
    assert.deepEqual(m.params, {});
    // matched prefix path should be '/user'
    assert.equal(m.path, '/user');
  });
});

describe('options: strict', () => {
  it('should treat trailing slash as optional when `strict` is false (default)', () => {
    const match = makeMatcher('/user/', { strict: false });

    // trailing slash in the pattern should be optional
    const m1 = match('/user');
    assert.ok(m1, 'expected /user to match /user/ when strict is false');
    assert.equal(m1.path, '/user');

    const m2 = match('/user/');
    assert.ok(m2, 'expected /user/ to match /user/ when strict is false');
    assert.equal(m2.path, '/user/');
  });

  it('should enforce trailing slash when `strict` is true', () => {
    const match = makeMatcher('/user/', { strict: true });

    // pattern has trailing slash, so '/user' (without trailing slash) should NOT match
    assert.ok(!match('/user'), 'expected /user not to match /user/ when strict is true');
    const m = match('/user/');
    assert.ok(m, 'expected /user/ to match /user/ when strict is true');
    assert.equal(m.path, '/user/');
  });

  it('should enforce absence of trailing slash when `strict` is true and pattern has no slash', () => {
    const match = makeMatcher('/user', { strict: true });

    // pattern has no trailing slash, so '/user/' should NOT match
    assert.ok(!match('/user/'), 'expected /user/ not to match /user when strict is true');
    const m = match('/user');
    assert.ok(m, 'expected /user to match /user when strict is true');
    assert.equal(m.path, '/user');
  });
});

describe('options: sensitive', () => {
  it('should ignore case by default', () => {
    const match = makeMatcher('/abc/:foo');

    const m = match('/ABC/bar');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/ABC/bar');
  });

  it('should be case sensitive when configured (no params)', () => {
    const match = makeMatcher('/abc', { sensitive: true });

    assert.ok(!match('/ABC'), 'expected /abc not to match /ABC when sensitive is true');
    const m = match('/abc');
    assert.ok(m, 'expected /abc to match /abc when sensitive is true');
    assert.equal(m.path, '/abc');
  });

  it('should be case sensitive when configured (with params)', () => {
    const match = makeMatcher('/abc/:foo', { sensitive: true });

    assert.ok(!match('/ABC/bar'), 'expected /abc/:foo not to match /ABC/bar when sensitive is true');
    const m = match('/abc/bar');
    assert.deepEqual(m.params, { foo: 'bar' });
    assert.equal(m.path, '/abc/bar');
  });

  it('should still honor regex boundaries under sensitivity settings', () => {
    const match = makeMatcher('/:foo(ABC)', { sensitive: true });

    // pattern requires uppercase 'ABC' exactly
    assert.ok(!match('/abc'), 'expected /:foo(ABC) not to match /abc when sensitive is true');
    const m = match('/ABC');
    assert.deepEqual(m.params, { foo: 'ABC' });
    assert.equal(m.path, '/ABC');
  });

  it('should be case-insensitive for regex parts by default', () => {
    const match = makeMatcher('/:foo(abc)');

    // default is case-insensitive, so 'ABC' should match
    const m = match('/ABC');
    assert.deepEqual(m.params, { foo: 'ABC' });
    assert.equal(m.path, '/ABC');
  });
});

describe('using regular expression with param name "(?<name>pattern)"', () => {
  it('should limit capture group to regexp match', async () => {
    const match = makeMatcher(/\/(?<foo>[0-9]+)/);

    assert.ok(!match('/foo'));
    const m = match('/42');
    assert.deepEqual(m.params, { foo: '42' });
    assert.equal(m.path, '/42');
    assert.deepEqual(m.keys, ['foo']);
  });
});

describe('using "(regexp)"', () => {
  it('should add capture group using regexp', async () => {
    const match = makeMatcher(/\/page_([0-9]+)/);

    assert.ok(!match('/page_foo'));
    const m = match('/page_42');
    assert.deepEqual(m.params, { 0: '42' });
    assert.equal(m.path, '/page_42');
  });
});
