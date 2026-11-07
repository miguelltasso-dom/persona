/**
 * ISO-5 (D-083, condition 2): the stderr of the CLI never reaches the screen or a log with the NAMES of the connectors the person has.
 *
 * With an MCP policy (the allow-list that loads only the connector a request needs) Claude prints, on stderr, a line that lists every
 * connector it blocked ("claude.ai MCP servers blocked by enterprise policy: <names>"), and the OAR keeps a tail of the child's stderr
 * and puts it into the error it raises when a session fails. Those names are personal data. This removes the lines that carry them;
 * everything else in the message is left as it was.
 */

/** The text a removed line is replaced with. */
export const STDERR_OMITTED = '[aviso da CLI omitido]'

const CONNECTOR_LINE = /blocked by (?:enterprise )?policy|mcp servers? .{0,40}blocked|connectors? .{0,40}blocked/iu

/**
 * @param text - An error message or log text that may carry a tail of the CLI's stderr.
 * @returns The same text without the lines that name blocked connectors.
 */
export function redactCliStderr(text: string): string {
  if (!CONNECTOR_LINE.test(text)) return text
  return text.split(/\r?\n/u).map(line => (CONNECTOR_LINE.test(line) ? STDERR_OMITTED : line)).join('\n')
}
