interface GeminiScoutProps {
  onLocationFound: (locationName: string) => void;
}

export function GeminiScout({ onLocationFound }: GeminiScoutProps) {
  return <div>Gemini Scout Component</div>
}
