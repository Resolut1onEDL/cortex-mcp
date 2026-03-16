export function textContent(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function jsonContent(data: unknown) {
  return textContent(JSON.stringify(data, null, 2));
}
