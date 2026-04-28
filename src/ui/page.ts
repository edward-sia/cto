export interface RenderUiPageOptions {
  initialRunId?: string;
}

export function renderUiPage(options: RenderUiPageOptions = {}): string {
  const initialRunId = options.initialRunId ?? null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CTO UI</title>
  </head>
  <body>
    <main id="app">Loading CTO UI...</main>
    <script>
      window.__CTO_INITIAL_RUN_ID__ = ${JSON.stringify(initialRunId)};
    </script>
  </body>
</html>`;
}
