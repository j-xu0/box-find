.PHONY: start stop logs

start:
	@bash scripts/dev.sh start

stop:
	@bash scripts/dev.sh stop

logs:
	@tail -f .dev/bun.log
