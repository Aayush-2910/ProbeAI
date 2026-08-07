/**
 * Pure helpers. No React, no fetch.
 * Track B · FRONTEND-ARCHITECTURE.md §6
 *
 * Exports:
 *   createSessionId()            -> crypto.randomUUID() with a fallback for
 *                                   non-secure contexts
 *   createMessageId()            -> stable unique key for React lists
 *   formatCandidateLabel(c)      -> "Sarah Johnson — Senior Data Engineer (9 years)"
 *   formatCandidatePill(c)       -> "Sarah Johnson | Senior Data Engineer | 9y exp"
 *
 * Both formatters read c.member.{name, jobRole, yearsExperience} and must
 * tolerate a missing education/status.
 *
 * TODO(track-b): implement.
 */
