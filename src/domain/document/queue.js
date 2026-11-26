// The central processing queue (decisions 22-24), as pure functions over plain data.
//
//   - ONE central queue for the whole installation; a job waits in it until resources allow;
//   - FIFO (23): the job that arrived first starts first. There is NO priority by role: an Admin's
//     job never jumps ahead of an employee's;
//   - several jobs may run at the same time when resources allow (22): `capacity`.
//
// The real queue is durable and lives on the server (22, 24: it must survive a stop without
// losing or repeating work). This model is what the frontend simulation (src/dev) and the
// queue screens rely on; it persists nothing.
//
// A job: { id, kind: 'document' | 'page', documentId, pageNumber?, attempt?, seq, enqueuedAt, state: 'queued' | 'running' }

export const JOB_STATE = Object.freeze({ queued: 'queued', running: 'running' })
export const JOB_KIND = Object.freeze({ document: 'document', page: 'page' })

export function createQueue() {
  return { nextSeq: 1, jobs: [] }
}

// Appends at the END (FIFO). Returns { queue, job }.
export function enqueue(queue, { id, kind, documentId, pageNumber = null, attempt = null, enqueuedAt }) {
  const job = { id, kind, documentId, pageNumber, attempt, seq: queue.nextSeq, enqueuedAt, state: JOB_STATE.queued }
  return { queue: { nextSeq: queue.nextSeq + 1, jobs: [...queue.jobs, job] }, job }
}

export const countRunning = (queue) => queue.jobs.filter((job) => job.state === JOB_STATE.running).length

// The queued jobs that may start now: the earliest ones, as many as `capacity` still allows.
export function pickJobsToStart(queue, capacity) {
  const free = Math.max(0, capacity - countRunning(queue))
  return queue.jobs
    .filter((job) => job.state === JOB_STATE.queued)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, free)
}

export function markRunning(queue, jobId) {
  return { ...queue, jobs: queue.jobs.map((job) => (job.id === jobId ? { ...job, state: JOB_STATE.running } : job)) }
}

export function removeJob(queue, jobId) {
  return { ...queue, jobs: queue.jobs.filter((job) => job.id !== jobId) }
}

export function removeJobsOfDocument(queue, documentId) {
  return { ...queue, jobs: queue.jobs.filter((job) => job.documentId !== documentId) }
}

// 1-based position among the WAITING jobs (running jobs have no position), or null.
export function getQueuePosition(queue, jobId) {
  const waiting = queue.jobs.filter((job) => job.state === JOB_STATE.queued).sort((a, b) => a.seq - b.seq)
  const index = waiting.findIndex((job) => job.id === jobId)
  return index === -1 ? null : index + 1
}

// Jobs in the order the queue will serve them (running first, then the waiting ones by arrival).
export function listJobs(queue) {
  return [...queue.jobs].sort((a, b) => {
    if (a.state !== b.state) return a.state === JOB_STATE.running ? -1 : 1
    return a.seq - b.seq
  })
}
