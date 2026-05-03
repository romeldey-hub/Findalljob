import { serve } from 'inngest/next'
import { inngest }           from '@/inngest/client'
import { parseResumeJob }    from '@/inngest/parse-resume'
import { matchJobsJob }      from '@/inngest/match-jobs'
import { validateJobsJob }   from '@/inngest/validate-jobs'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseResumeJob, matchJobsJob, validateJobsJob],
})
