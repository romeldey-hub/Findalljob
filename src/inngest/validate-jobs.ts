import { inngest }             from './client'
import { validateUrlBatch }   from '@/lib/jobs/validate'
import { createAdminClient }  from '@/lib/supabase/server'

const BATCH_LIMIT = 100  // jobs validated per run

/**
 * Background job: validate apply URLs and update apply_status in the DB.
 *
 * Runs every 6 hours. Targets:
 *   1. All jobs with apply_status = 'unverified' (newest first)
 *   2. Jobs with apply_status = 'active' not verified in the last 24 h
 *
 * Marks: 'active' → confirmed reachable | 'broken' → definitive 4xx
 * Leaves: 'unverified' when a network error prevents determination
 */
export const validateJobsJob = inngest.createFunction(
  {
    id:      'validate-job-links',
    name:    'Validate Job Apply Links',
    retries: 1,
    triggers: [
      { cron: '0 */6 * * *' },                  // every 6 hours on schedule
      { event: 'jobs/validate-links-requested' }, // also triggerable on demand
    ],
    concurrency: { limit: 1 },  // only one validation run at a time
  },
  async ({ step }) => {

    // ── Fetch jobs that need validation ──────────────────────────────────────
    const jobsToValidate = await step.run('fetch-jobs', async () => {
      const admin = createAdminClient()

      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await admin
        .from('jobs')
        .select('id, apply_url, url, apply_status, last_verified_at')
        .or(
          `apply_status.eq.unverified,` +
          `and(apply_status.eq.active,last_verified_at.lt.${staleThreshold})`
        )
        .order('created_at', { ascending: false })
        .limit(BATCH_LIMIT)

      if (error) throw new Error(`Failed to fetch jobs for validation: ${error.message}`)

      console.log(`[validate-jobs] fetched ${data?.length ?? 0} jobs to validate`)
      return (data ?? []).map((j) => ({
        id:  j.id as string,
        url: (j.apply_url ?? j.url ?? '') as string,
      }))
    })

    if (!jobsToValidate.length) {
      console.log('[validate-jobs] no jobs to validate — exiting')
      return { validated: 0 }
    }

    // ── Validate URLs in batches ──────────────────────────────────────────────
    const results = await step.run('validate-urls', async () => {
      const statusMap = await validateUrlBatch(jobsToValidate)
      return Object.fromEntries(statusMap)
    })

    // ── Persist results ───────────────────────────────────────────────────────
    const { active, broken, unverified } = await step.run('save-results', async () => {
      const admin = createAdminClient()
      const now   = new Date().toISOString()

      let active = 0, broken = 0, unverified = 0

      // Group by status for bulk updates
      const byStatus: Record<string, string[]> = { active: [], broken: [], unverified: [] }
      for (const [id, status] of Object.entries(results)) {
        byStatus[status]?.push(id)
      }

      for (const [status, ids] of Object.entries(byStatus)) {
        if (!ids.length) continue
        const { error } = await admin
          .from('jobs')
          .update({ apply_status: status, last_verified_at: now })
          .in('id', ids)
        if (error) {
          console.error(`[validate-jobs] failed to update ${status} jobs:`, error.message)
        } else {
          if (status === 'active')      active      += ids.length
          else if (status === 'broken') broken      += ids.length
          else                          unverified  += ids.length
        }
      }

      console.log(`[validate-jobs] results → active:${active} broken:${broken} unverified:${unverified}`)
      return { active, broken, unverified }
    })

    return { validated: jobsToValidate.length, active, broken, unverified }
  }
)
