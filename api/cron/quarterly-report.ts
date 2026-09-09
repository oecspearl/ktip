import { makeReportCron } from './monthly-report'

export const config = { runtime: 'edge' }

/**
 * The quarterly report (roadmap §14 Table 39, to the RPIU). Same pipeline as
 * the monthly route with the kind fixed — a Vercel cron path cannot carry a
 * query string, so the schedule needs a path of its own.
 */
export default makeReportCron('quarter')
