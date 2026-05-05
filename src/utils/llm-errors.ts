export function formatLLMError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const maybeError = error as {
    status?: unknown;
    message?: unknown;
    error?: unknown;
  };
  const message = typeof maybeError.message === "string" ? maybeError.message : undefined;
  const providerMessage = getProviderMessage(maybeError.error);
  const status = typeof maybeError.status === "number" ? maybeError.status : undefined;
  const detail = providerMessage ?? message ?? "Unknown provider error";

  return status ? `${status} ${detail}` : detail;
}

function getProviderMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}
