import { makeReportCron } from './monthly-report.js'

// Node for the same reasons as monthly-report.ts, which explains the `.js`
// extension and the GET export.
// 60s is the ceiling on every Vercel plan, Fluid compute or not; report-run
// caps the model call at 45s so the rest of the run fits inside it.
export const config = { runtime: 'nodejs', maxDuration: 60 }

/**
 * The quarterly report (roadmap §14 Table 39, to the RPIU). Same pipeline as
 * the monthly route with the kind fixed — a Vercel cron path cannot carry a
 * query string, so the schedule needs a path of its own.
 */
export const GET = makeReportCron('quarter')
