const supportRegex = /I support (?:alternative |option )?["']?([^"'\n]+)/i;


export function parseSupportedAlternative(rawResponse: string): string | undefined {
  const supportMatch = supportRegex.exec(rawResponse);
  return supportMatch?.[1]?.trim();
}
