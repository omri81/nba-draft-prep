import type { DraftConfig } from '../types'

/**
 * Which direction a round runs. `true` means pick slot 1 goes first.
 *
 * Plain snake:  R1 →, R2 ←, R3 →, R4 ←, …
 *
 * Third-round reversal: rounds 1 and 2 snake as usual, then round 3 repeats
 * round 2's reversed order instead of flipping back, and the snake carries on
 * from there — R1 →, R2 ←, R3 ←, R4 →, R5 ←, R6 →, …
 * This is the rule that turns the 1.01's picks from 1, 20, 21, 40, 41 into
 * 1, 20, 30, 31, 50, 51.
 */
function isForwardRound(round: number, thirdRoundReversal: boolean): boolean {
  if (!thirdRoundReversal) return round % 2 === 1
  if (round === 1) return true
  if (round === 2 || round === 3) return false
  return round % 2 === 0
}

/** 1-based round a given overall pick number falls in. */
export function roundOf(pickNumber: number, teams: number): number {
  if (teams < 1) return 1
  return Math.floor((pickNumber - 1) / teams) + 1
}

/**
 * Every overall pick number belonging to me, ascending, up to `upTo`.
 * Empty when no draft slot is configured.
 */
export function myPickNumbers(cfg: DraftConfig, upTo: number): number[] {
  const { teams, pick, thirdRoundReversal } = cfg
  if (!pick || teams < 1 || pick < 1 || pick > teams || upTo < 1) return []

  const out: number[] = []
  const rounds = Math.ceil(upTo / teams)
  for (let r = 1; r <= rounds; r++) {
    const slot = isForwardRound(r, thirdRoundReversal) ? pick : teams - pick + 1
    const n = (r - 1) * teams + slot
    if (n <= upTo) out.push(n)
  }
  return out
}
