> Source: maintained test fixture. This is not live model output.

# Study Flow

**Spec ID:** `study-flow`

A controllable study planner that converts a syllabus and weekly availability into an adaptive plan with visible progress.

## Background

Learners often know what they must cover but struggle to distribute work realistically and recover when plans slip.

## Target users

### learner

A learner managing a syllabus alongside limited weekly time.

Needs:
- A realistic schedule
- Clear progress
- Safe replanning

## Problems

- Static calendars do not account for workload or missed sessions
- Opaque recommendations are difficult to trust

## User scenarios

### scenario-plan: Create a first weekly plan

Actor: `learner`

1. Enter syllabus topics and deadlines
2. Set available study windows
3. Review and approve the proposed plan

Outcome: The learner has an approved schedule covering required work without overlapping unavailable time.

### scenario-recover: Recover from a missed session

Actor: `learner`

1. Mark a session missed
2. Review the impact and proposed alternatives
3. Approve one revised schedule

Outcome: Remaining work is rescheduled without silently dropping a required topic.

## Features

- **feature-syllabus** [must]: Capture topics, estimated effort, priority, and deadlines. (verifies: ac-syllabus)
- **feature-schedule** [must]: Build and edit a weekly schedule constrained by learner availability. (verifies: ac-schedule, ac-capacity)
- **feature-progress** [must]: Track completed, missed, and upcoming study sessions. (verifies: ac-progress)
- **feature-replan** [should]: Explain and propose recovery options after plan changes. (verifies: ac-replan, ac-ai-fallback, ac-replan-cancel)

## Non-functional requirements

- **nfr-accessibility** All planning and progress workflows are keyboard operable and expose meaningful labels.
- **nfr-privacy** Syllabus and availability data remain private to the learner by default.

## Data

- **data-topic** Topic: A syllabus unit with effort, priority, deadline, and completion state.
- **data-session** Study session: A scheduled time block linked to one or more topics and its outcome.

## External integrations

- None

## UX principles

- Show why each session was scheduled
- Require confirmation before AI changes the plan
- Keep missed work visible until resolved

## Constraints

- The core planner remains usable when AI recommendations are unavailable
- No schedule change is applied without learner confirmation
- Initial scope is one learner in a private local workspace; sharing and multi-user hosting are out of scope.
- Send syllabus and availability to AI only after explicit consent; declining consent preserves manual planning.
- Insufficient capacity must remain visible as unassigned effort; never silently omit work or overwrite an approved plan.

## Acceptance criteria

- **ac-syllabus** A learner can create and edit topics with effort and deadlines.
  - Verification: Create two topics, edit one deadline, reload, and verify both values persist.
- **ac-schedule** An approved schedule covers required topics only within available windows.
  - Verification: Use two required 60-minute topics and two non-overlapping 60-minute windows before their deadlines. Approve a plan; verify exactly 120 minutes assigned, no overlap, no unavailable time, no missed deadline, and persistence after reload.
- **ac-progress** Completion and missed states update the visible weekly progress.
  - Verification: Complete one session and miss another, then verify counts, states, and remaining effort.
- **ac-replan** A missed session produces explained alternatives and applies only the selected option.
  - Verification: Miss a 60-minute session with two eligible future windows. Inspect two explained alternatives, choose one, reload, and verify only that option persists. With one eligible window show one valid option; with none explain infeasibility without inventing a schedule.
- **ac-capacity** Insufficient capacity is visible without dropping work or changing the approved plan.
  - Verification: Request 180 minutes of work with only 120 available before the deadline. Verify at least 60 minutes visibly unassigned, an explanation, and an unchanged approved schedule until constraints are changed and approved.
- **ac-ai-fallback** Manual planning remains usable when AI fails or returns an invalid schedule.
  - Verification: Simulate an AI timeout and an out-of-bounds draft. Verify an actionable error, unchanged approved state, and successful manual rescheduling and completion tracking after reload.
- **ac-replan-cancel** Cancelling or rejecting drafts preserves approved state.
  - Verification: Record the approved schedule, request alternatives, cancel, and reload. Verify unchanged schedule and visible missed work. Repeat by rejecting every alternative.
- **ac-accessibility** Planning and progress flows work with a keyboard and meaningful accessible names.
  - Verification: Without a pointer, create a topic, edit availability, approve a plan, and complete a session. Verify visible focus, no keyboard trap, and meaningful accessible names for each used control.
- **ac-privacy** AI transmission requires consent and schedules are not publicly exposed.
  - Verification: Enter distinctive syllabus data, decline consent, and inspect network requests during manual planning: no syllabus or availability is sent to AI. Verify transmission only after consent, and inspect the app access boundary for unauthenticated public exposure.

## AI assessment

Adopted: **yes**

AI can compare workload, deadlines, and preferences to propose explainable recovery options, while deterministic constraints and explicit approval protect schedule integrity.

- **ai-recovery** After consent, read syllabus and availability, propose feasible recovery schedules, explain tradeoffs or infeasibility, and wait for approval. Reject invalid drafts; on failure keep manual planning usable and the approved schedule unchanged.
  - Tools: Read syllabus, Read availability, Draft schedule alternatives
  - State changes: Create reviewable draft alternatives; Persist only the learner-approved schedule
  - Verifies: ac-replan, ac-capacity, ac-ai-fallback, ac-replan-cancel, ac-privacy
