# The spike on Linux (arm64, native), with the Playwright 1.65.1 browsers and Bun 1.4.4.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /spike
COPY . /spike
RUN bun install --frozen-lockfile
