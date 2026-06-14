export function generateEightDigitPublicId(): string {
  const value = Math.floor(Math.random() * 100_000_000);
  return value.toString().padStart(8, "0");
}

