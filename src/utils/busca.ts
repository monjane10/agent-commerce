export function prepararTermosBusca(
  texto: string,
): string[] {
  const stopwords = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "um",
    "uma",
    "o",
    "a",
    "os",
    "as",
  ]);

  return texto
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(
      (termo) =>
        termo.length > 0 &&
        !stopwords.has(termo),
    );
}