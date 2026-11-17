.DEFAULT_GOAL := help
.PHONY: help demo desktop reset test bench stop

NEED_BUN = command -v bun >/dev/null 2>&1 || { echo "Manent needs Bun 1.4.4 or later. Install it with: curl -fsSL https://bun.com/install | bash"; exit 1; }

help:
	@echo "  make demo      Start Manent on this machine and open http://localhost:4747  (LAN=1: let a second machine join)"
	@echo "  make desktop   The desktop app is not in this build yet"
	@echo "  make reset     Delete the demo data and seed it again"
	@echo "  make test      Unit, property and end-to-end tests"
	@echo "  make bench     Run the benchmark suite"
	@echo "  make stop      Stop the server and the supervisor"

demo:
	@$(NEED_BUN) && LAN=$(LAN) bun run demo

desktop:
	@$(NEED_BUN) && bun run desktop

reset:
	@$(NEED_BUN) && bun run reset

test:
	@$(NEED_BUN) && bun run test

bench:
	@$(NEED_BUN) && bun run bench

stop:
	@$(NEED_BUN) && bun run stop
