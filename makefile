NPX = (shell which npm)


run: 
	npm run start

test:
	npm run test

format:
	npm run lint

format-fix:
	npm run lint:fix

setup:
	npm install
	npm run setup

build: 
	npm run build
	chmod +x ./bin/index.js

check:
	make format
	make test
	make build



m ?= wip
push:
	make check
	git add .
	git commit -m "$(m)"
	git push

