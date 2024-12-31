check: lint test

lint:
	node_modules/.bin/standard

test:
	node --test

test-cov:
	node --experimental-test-coverage --test

distclean:
	rm -rf yarn.lock node_modules

.PHONY: check lint test test-cov distclean
