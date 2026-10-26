// Curated from the documented xAI TTS voice list (GET /v1/tts/voices).
// Full catalog includes ara, eve, leo, rex, sal, and many others (carina, zagan, helix, ...).
// https://docs.x.ai/developers/model-capabilities/audio/text-to-speech

export interface VoiceOption {
  id: string;
  name: string;
  blurb: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "ara", name: "Ara", blurb: "Hangat dan ramah, enak buat jualan." },
  { id: "rex", name: "Rex", blurb: "Jelas dan percaya diri." },
  { id: "eve", name: "Eve", blurb: "Ceria, semangat, agak British." },
  { id: "sal", name: "Sal", blurb: "Halus dan seimbang." },
  { id: "leo", name: "Leo", blurb: "Tegas dan berwibawa." },
];

export function isAllowedVoice(id: string): boolean {
  return VOICE_OPTIONS.some((voice) => voice.id === id);
}
