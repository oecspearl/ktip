// Sentry.init must run before any module that might throw, so this file is the
// first import in src/index.tsx and does nothing else.
import { initializeMonitoring } from './lib/monitoring'

initializeMonitoring()
