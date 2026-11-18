// Bundles the page into shared/page/dist/, which both shells copy into their app.
import { join } from 'node:path'

const page = join(import.meta.dir, '..', 'shared', 'page')

if (import.meta.main) {
  await Bun.build({ entrypoints: [join(page, 'app.ts')], outdir: join(page, 'dist'), target: 'browser', minify: true })
}
