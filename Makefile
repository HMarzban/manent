.DEFAULT_GOAL := help
.PHONY: help demo desktop reset test bench stop

ENSURE_BUN = sh tools/demo/ensure-bun.sh

help:
	@echo "  make demo      Install missing dependencies, start Manent and open http://localhost:4747  (LAN=1: let a second machine join)"
	@echo "  make desktop   Build and open the desktop app against the running demo"
	@echo "  make reset     Delete the demo data and seed it again"
	@echo "  make test      Unit, property and end-to-end tests"
	@echo "  make bench     Run the benchmark suite"
	@echo "  make stop      Stop the server and the supervisor"

demo:
	@LAN=$(LAN) $(ENSURE_BUN) --install -- bun run demo

desktop:
	@$(ENSURE_BUN) -- bun run desktop

reset:
	@$(ENSURE_BUN) -- bun run reset

test:
	@$(ENSURE_BUN) -- bun run test

bench:
	@$(ENSURE_BUN) -- bun run bench $(if $(TIER),--tier $(TIER)) $(if $(THROTTLE),--throttle $(THROTTLE)) $(if $(FILTER),--filter $(FILTER)) $(if $(QUICK),--quick) $(if $(FULL),--full) $(if $(PROVE),--prove)

stop:
	@$(ENSURE_BUN) -- bun run stop
