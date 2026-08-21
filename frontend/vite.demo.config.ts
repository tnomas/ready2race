import {defineConfig, Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import {readFileSync, writeFileSync} from 'fs'
import {resolve} from 'path'

// Build for the standalone speaker board preview:
//   npm run build:demo  ->  dist-demo/speaker-board.html
// One self-contained file (styles, fonts and script inlined) that renders the
// real board against generated demo data - no backend, opens straight from disk.

const OUT_DIR = 'dist-demo'

// Fold the emitted stylesheet and script back into the HTML.
const inlineIntoSingleFile = (): Plugin => ({
    name: 'speaker-demo-single-file',
    closeBundle() {
        const dir = resolve(__dirname, OUT_DIR)
        const read = (file: string) => readFileSync(resolve(dir, file), 'utf8')
        const css = read('demo.css')
        const js = read('demo.js')

        const single = read('demo.html')
            // Replacements are functions: the bundle contains `$&`-style
            // sequences that a string replacement would expand.
            .replace(/<link rel="stylesheet"[^>]*href="[^"]*demo\.css"\s*\/?>/, () =>
                `<style>\n${css}\n</style>`,
            )
            .replace(/<script type="module"[^>]*src="[^"]*demo\.js"><\/script>/, () =>
                `<script type="module">\n${js}\n</script>`,
            )

        const target = resolve(dir, 'speaker-board.html')
        writeFileSync(target, single)
        console.log(`\n  ${OUT_DIR}/speaker-board.html  ${(single.length / 1024 / 1024).toFixed(2)} MB (standalone)\n`)
    },
})

export default defineConfig({
    plugins: [react(), tsconfigPaths(), inlineIntoSingleFile()],
    build: {
        outDir: OUT_DIR,
        emptyOutDir: true,
        // Inline fonts and images as data URIs so the single file needs no assets.
        assetsInlineLimit: 10_000_000,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
            input: resolve(__dirname, 'demo.html'),
            output: {
                inlineDynamicImports: true,
                entryFileNames: 'demo.js',
                assetFileNames: 'demo.[ext]',
            },
        },
    },
})
