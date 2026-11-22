/**
 * Hippomem — the team's engineering memory (z10-labs/hippomem), read from its
 * local server. Whetstone does not own it: Hippomem holds *why the code is the
 * way it is* across every repo, while session memory holds a Session's working
 * state. Whetstone shows the decisions in force for the repo a run works in;
 * Claude Code terminal runs feed Hippomem themselves through its hooks.
 */

/** Why there is, or is not, something to show. */
export type HippomemState = 'ok' | 'offline' | 'no-token' | 'error';

export interface HippomemView {
  state: HippomemState;
  /** Server base URL, for the "start it" hint. */
  url: string;
  /** Hippomem's name for the repo the run works in. */
  repo: string | null;
  /** True when the repo has Hippomem's Claude Code hooks installed. */
  hooksInstalled: boolean;
  /** Hippomem's own rendering of the result (plain text). */
  text: string | null;
  /** A one-line reason when state is not `ok`. */
  message: string | null;
}

export interface HippomemQueryInput {
  cwd: string;
  text: string;
}
