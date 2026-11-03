import fs from 'node:fs'

const THRESHOLD = Number(process.env.COVERAGE_THRESHOLD ?? 95)
const summaryPath = 'coverage/coverage-summary.json'

if (!fs.existsSync(summaryPath)) {
  console.error(`::error file=${summaryPath},title=Coverage gate::${summaryPath} missing — run 'npm run test:coverage' before the coverage gate`)
  process.exit(1)
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
const total = summary.total
const metrics = ['statements', 'branches', 'functions', 'lines']

console.log('::group::Coverage report summary')
for (const metric of metrics) {
  console.log(`${metric}: ${total[metric].pct}%`)
}
console.log('::endgroup::')

const pct = total.statements.pct
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `pct=${pct}\n`)
}

const failed = metrics.filter((metric) => Number(total[metric].pct) < THRESHOLD)
if (failed.length > 0) {
  const detail = failed.map((metric) => `${metric} ${total[metric].pct}%`).join(', ')
  console.error(
    `::error file=coverage/coverage-summary.json,title=Coverage gate::Coverage is below the ${THRESHOLD}% threshold (${detail}).`,
  )
  process.exit(1)
}

console.log(`Total statement coverage: ${pct}%`)
