FROM mcr.microsoft.com/playwright:v1.65.1-noble
COPY --from=oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile && MANENT_FLAVOUR=test bun run build:web
# The image holds no repository, so it carries the commit it was built from and whether that tree had changes.
ARG MANENT_BENCH_COMMIT
ARG MANENT_BENCH_DIRTY
ENV MANENT_BENCH_COMMIT=$MANENT_BENCH_COMMIT MANENT_BENCH_DIRTY=$MANENT_BENCH_DIRTY
