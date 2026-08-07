/**
 * Mock backend — lets the entire UI run with no API server at all.
 *
 * It implements the documented response contract (ARCHITECTURE.md §3) and
 * nothing else. It is NOT a reimplementation of the backend: no scoring, no
 * LLM, no real evaluation. It exists so every UI state — opening, follow-ups,
 * typing latency, completion, feedback — can be reviewed standalone.
 *
 * Data comes from the real project files rather than hardcoded copies, so the
 * dropdown and question topics always match backend/data/. (Project rule 3.)
 */

import candidateData from '../../../backend/data/candidates.json'
import curriculumData from '../../../backend/data/curriculum.json'

// Latency is deliberate: without it the typing indicator never renders and the
// UI looks untested. Overridable so automated checks don't wait. */
const DEFAULT_DELAY = [700, 1500]

function delay() {
  const override = globalThis.__PROBEAI_MOCK_DELAY__
  if (typeof override === 'number') return override
  const [min, max] = DEFAULT_DELAY
  return min + Math.random() * (max - min)
}

function wait() {
  return new Promise((resolve) => setTimeout(resolve, delay()))
}

const DAYS = new Map(curriculumData.days.map((day) => [day.day, day]))

const sessions = new Map()

// --- candidate analysis (mirrors the planner's signal reading) --------------

const PRIORITY = { skipped: 0, failed: 1, struggled: 2, reworked: 3, strong: 4 }

function classify(mission) {
  if (mission.skipped) return 'skipped'
  if (mission.passed === false) return 'failed'
  const attempts = mission.attempts ?? 1
  if (attempts >= 4) return 'struggled'
  if (attempts >= 2) return 'reworked'
  return 'strong'
}

function difficultyFor(member) {
  const role = ` ${(member.jobRole ?? '').toLowerCase()} `
  const nonTechnical = [
    'marketing', 'hr ', 'business analyst', 'product manager', 'ux researcher', 'sales',
  ].some((keyword) => role.includes(keyword))
  const yearsExperience = Number(member.yearsExperience) || 0
  if (yearsExperience <= 2 || nonTechnical) return 'foundational'
  if (yearsExperience <= 7) return 'implementation'
  return 'architecture'
}

const QUESTIONS = {
  foundational: {
    strong: (d) => `You got through ${d.title} on the first try — in your own words, what is the core idea there, and why does it matter?`,
    reworked: (d) => `${d.title} took you a couple of passes. What part of it was hardest to get your head around?`,
    struggled: (d) => `${d.title} took a few attempts. Can you talk me through what you eventually understood about it?`,
    failed: (d) => `${d.title} didn't go through in the end. What do you remember about where it stopped making sense?`,
    skipped: (d) => `You skipped ${d.title} — no judgment at all. What do you know about it from anywhere else?`,
  },
  implementation: {
    strong: (d) => `You handled ${d.title} cleanly. Walk me through how you actually implemented it — what did your code do, step by step?`,
    reworked: (d) => `On ${d.title}, when you were working with ${d.tools[0]}, what broke first and how did you get past it?`,
    struggled: (d) => `You iterated a fair bit on ${d.title}. What was the specific thing that kept failing, and what finally fixed it?`,
    failed: (d) => `${d.title} didn't pass. Walk me through your approach and where it fell apart.`,
    skipped: (d) => `You skipped ${d.title}. If you had to add it to your project tomorrow, how would you start?`,
  },
  architecture: {
    strong: (d) => `You handled ${d.title} without much trouble. What trade-offs did you weigh, and what would change if this had to serve ten times the traffic?`,
    reworked: (d) => `On ${d.title}, what was the design decision you went back and forth on, and how did you settle it?`,
    struggled: (d) => `You iterated on ${d.title} quite a bit. Looking back, what would you architect differently now, and why?`,
    failed: (d) => `${d.title} didn't land. If you owned that decision today, how would you approach it differently?`,
    skipped: (d) => `You skipped ${d.title}. As the senior engineer shipping this to production, how would you decide the approach there?`,
  },
}

const SYNTHESIS = {
  foundational: 'Looking back across the whole cohort, which piece finally clicked for you — and what would you want to build with it first?',
  implementation: 'If you rebuilt your capstone from scratch with everything you know now, what would you do differently and why?',
  architecture: 'Take the full pipeline you built — ingestion, retrieval, generation, agents, deployment. Under real production load, what breaks first, and how would you harden it?',
}

const FOLLOW_UPS = [
  'Can you give me a specific example from your own project? A number, a failure you hit, a decision you had to make.',
  'That is the textbook answer — what did it actually look like in your build?',
  'Say more about that. What was the concrete thing you changed, and what happened after?',
]

const ACKNOWLEDGEMENTS = [
  'That is a solid answer.',
  'Good — that lines up with what I would expect.',
  'Nice, that is a real detail.',
  'That tracks.',
]

function buildPlan(candidate) {
  const difficulty = difficultyFor(candidate.member ?? {})

  const targets = (candidate.missions ?? [])
    .filter((mission) => DAYS.has(mission.day))
    .map((mission) => ({
      day: DAYS.get(mission.day),
      state: classify(mission),
    }))
    .sort((a, b) => PRIORITY[a.state] - PRIORITY[b.state])

  const strong = targets.filter((t) => t.state === 'strong')
  const weak = targets.filter((t) => t.state !== 'strong')

  // Open on something they passed, then work through the weak areas.
  const ordered = [...strong.slice(0, 1), ...weak.slice(0, 7), ...strong.slice(1, 4)]
  return { difficulty, targets: ordered.slice(0, 10) }
}

function questionFor(target, difficulty) {
  return QUESTIONS[difficulty][target.state](target.day)
}

// --- feedback ---------------------------------------------------------------

function buildFeedback(session) {
  const { answers, plan, candidate } = session
  const name = candidate.member?.name?.split(' ')[0] ?? 'The candidate'

  const detailed = answers.filter((a) => a.text.length >= 120)
  const thin = answers.filter((a) => a.text.length < 60)
  const avoided = plan.targets.filter((t) => t.state === 'skipped' || t.state === 'failed')

  const strengths = detailed.slice(0, 3).map(
    (answer) => `Gave a substantive answer on ${answer.topic} — went past definitions into what was actually built.`,
  )
  if (!strengths.length) {
    strengths.push('Stayed engaged across every topic and answered each question directly.')
  }

  const gaps = thin.slice(0, 2).map(
    (answer) => `Stayed at the surface on ${answer.topic} — the answer never reached a specific example or decision.`,
  )
  avoided.slice(0, 2).forEach((target) => {
    gaps.push(`${target.day.title} was never covered during the cohort, and that showed in the discussion.`)
  })
  if (!gaps.length) gaps.push('No sustained weakness surfaced, though several areas were only touched briefly.')

  const next = avoided.slice(0, 2).map(
    (target) => `Rebuild ${target.day.title} end to end — focus on: ${target.day.objectives[0].toLowerCase()}.`,
  )
  thin.slice(0, 1).forEach((answer) => {
    next.push(`Revisit ${answer.topic} and write down the decisions you made and why, so the reasoning is ready to explain.`)
  })
  if (!next.length) next.push('Push into production concerns next — evaluation harnesses, observability and cost per request.')

  return {
    summary:
      `${name} covered ${session.topicsCovered.size} areas of the cohort across ${session.questionCount} questions, ` +
      `answering in most depth on the topics they completed first time. ` +
      `This is demo feedback generated locally — the real assessment comes from the interview backend.`,
    strengths,
    gaps,
    next,
  }
}

// --- the contract -----------------------------------------------------------

export async function fetchCandidates() {
  await wait()
  return candidateData
}

export async function startInterview(sessionId, candidate) {
  await wait()

  const plan = buildPlan(candidate)
  const first = plan.targets[0]
  const name = candidate.member?.name?.split(' ')[0] ?? 'there'

  const session = {
    candidate,
    plan,
    index: 0,
    questionCount: 1,
    topicsCovered: new Set([first?.day.day]),
    answers: [],
    lastTopic: first?.day.title ?? 'your project',
    awaitingFollowUp: false,
  }
  sessions.set(sessionId, session)

  return {
    reply:
      `Hi ${name}, welcome — thanks for making the time. I have had a look at your run through the AI Cohort, ` +
      `so let's skip the small talk and get into the work itself.\n\n` +
      `${questionFor(first, plan.difficulty)}`,
    done: false,
  }
}

export async function sendMessage(sessionId, message) {
  await wait()

  const session = sessions.get(sessionId)
  if (!session) {
    const error = new Error('No interview session found for that sessionId.')
    error.status = 404
    error.kind = 'session-expired'
    throw error
  }

  session.answers.push({ text: message ?? '', topic: session.lastTopic })

  const isThin = (message ?? '').trim().length < 60
  const dontKnow = /i (don'?t|do not) know|no idea|skipped that|not sure/i.test(message ?? '')

  // Wrap up once the interview has covered enough ground. Mirrors the real
  // exit rule: 8+ questions across 4+ topics.
  const eligible = session.questionCount >= 8 && session.topicsCovered.size >= 4
  if (eligible && (!isThin || session.questionCount >= 12)) {
    const name = session.candidate.member?.name?.split(' ')[0] ?? ''
    sessions.delete(sessionId)
    return {
      reply:
        `That is a good place to stop, ${name}. Thanks for talking me through all of that — ` +
        `you gave me a clear picture of how you work. Let me put together my assessment.`,
      done: true,
      feedback: buildFeedback(session),
    }
  }

  session.questionCount += 1

  // A thin answer earns a follow-up on the same topic — the interview does not
  // advance until there is something specific. One follow-up per topic here.
  if (isThin && !dontKnow && !session.awaitingFollowUp) {
    session.awaitingFollowUp = true
    const prompt = FOLLOW_UPS[session.answers.length % FOLLOW_UPS.length]
    return { reply: prompt, done: false }
  }

  session.awaitingFollowUp = false
  session.index += 1
  const next = session.plan.targets[session.index % session.plan.targets.length]

  if (session.index >= session.plan.targets.length) {
    session.topicsCovered.add(31)
    session.lastTopic = 'the system as a whole'
    return { reply: SYNTHESIS[session.plan.difficulty], done: false }
  }

  session.topicsCovered.add(next.day.day)
  session.lastTopic = next.day.title

  const lead = dontKnow
    ? 'No problem, that one just did not come up for you.'
    : ACKNOWLEDGEMENTS[session.answers.length % ACKNOWLEDGEMENTS.length]

  return {
    reply: `${lead} ${questionFor(next, session.plan.difficulty)}`,
    done: false,
  }
}
