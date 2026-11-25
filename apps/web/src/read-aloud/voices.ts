// Voice filtering, deterministic per-character assignment, and spoken-line planning for Read aloud.

export interface SpeechBlock {
  readonly id: string | null;
  readonly type: string;
  readonly text: string;
}

export interface SpokenLine {
  readonly blockId: string | null;
  readonly text: string;
  readonly voice: SpeechSynthesisVoice;
}

const SCENE_BOUNDARY_TYPES = new Set<string>([
  "scene_heading",
  "slug",
  "chapter",
]);

const SILENT_TYPES = new Set<string>([
  "character",
  "parenthetical",
  "page_break",
  "break",
  "group",
]);

/** Primary BCP-47 language subtag (lowercase), defaulting to `"en"` when empty or unknown. */
export function languagePrefix(language: string | null | undefined): string {
  const trimmed = language?.trim() ?? "";
  if (trimmed === "") return "en";
  const prefix = trimmed.split(/[-_]/, 1)[0]?.trim().toLowerCase() ?? "";
  return prefix === "" ? "en" : prefix;
}

/** Voices whose `lang` matches `language`'s prefix, sorted alphabetically by `name`. */
export function matchingVoices(
  voices: readonly SpeechSynthesisVoice[],
  language = "en",
): SpeechSynthesisVoice[] {
  const prefix = languagePrefix(language);
  return voices
    .filter((voice) => {
      const lang = voice.lang.trim().toLowerCase();
      return (
        lang === prefix ||
        lang.startsWith(`${prefix}-`) ||
        lang.startsWith(`${prefix}_`)
      );
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Matching system voices currently reported by `speechSynthesis`, sorted by name. */
export function availableVoices(language = "en"): SpeechSynthesisVoice[] {
  const synth = globalThis.speechSynthesis;
  if (synth === undefined) return [];
  return matchingVoices(synth.getVoices(), language);
}

/** Whether at least one matching system voice is available for `language`. */
export function hasMatchingVoice(language = "en"): boolean {
  return availableVoices(language).length > 0;
}

/** Character cue key: text before any `(extension)`, trimmed and uppercased. */
export function cueKey(text: string): string {
  return (text.split("(", 1)[0] ?? "").trim().toUpperCase();
}

/** Index of the scene heading/slug/chapter holding `caretBlockId`, or 0 when before the first scene. */
export function sceneStartIndex(
  blocks: readonly SpeechBlock[],
  caretBlockId: string | null,
): number {
  if (blocks.length === 0 || caretBlockId === null) return 0;
  const caretIndex = blocks.findIndex((block) => block.id === caretBlockId);
  if (caretIndex <= 0) return 0;
  for (let i = caretIndex; i >= 0; i--) {
    const block = blocks[i];
    if (block !== undefined && SCENE_BOUNDARY_TYPES.has(block.type)) return i;
  }
  return 0;
}

/**
 * Assigns narrator (`voices[0]`) and per-character voices (`voices[1..]`, cycling when exhausted) in order
 * of first cue appearance across the full script, then returns spoken lines from the caret's scene onwards.
 * `character` cues and `parenthetical` blocks are never spoken; dialogue uses its cue's voice.
 */
export function planSpeech(options: {
  readonly blocks: readonly SpeechBlock[];
  readonly voices: readonly SpeechSynthesisVoice[];
  readonly caretBlockId: string | null;
}): SpokenLine[] {
  const { blocks, voices, caretBlockId } = options;
  const narrator = voices[0];
  if (narrator === undefined || blocks.length === 0) return [];

  const characterPool = voices.length > 1 ? voices.slice(1) : [narrator];
  const characterVoices = new Map<string, SpeechSynthesisVoice>();
  for (const block of blocks) {
    if (block.type !== "character") continue;
    const key = cueKey(block.text);
    if (key === "" || characterVoices.has(key)) continue;
    const assigned =
      characterPool[characterVoices.size % characterPool.length] ?? narrator;
    characterVoices.set(key, assigned);
  }

  const start = sceneStartIndex(blocks, caretBlockId);
  const lines: SpokenLine[] = [];
  let currentSpeaker: string | null = null;

  for (let i = start; i < blocks.length; i++) {
    const block = blocks[i];
    if (block === undefined) continue;
    if (block.type === "character") {
      const key = cueKey(block.text);
      currentSpeaker = key === "" ? null : key;
      continue;
    }
    if (block.type === "parenthetical") continue;
    if (SILENT_TYPES.has(block.type)) {
      currentSpeaker = null;
      continue;
    }
    const text = block.text.trim();
    if (text === "") continue;
    if (block.type === "dialogue") {
      const voice =
        (currentSpeaker !== null
          ? characterVoices.get(currentSpeaker)
          : undefined) ?? narrator;
      lines.push({ blockId: block.id, text, voice });
      continue;
    }
    currentSpeaker = null;
    lines.push({ blockId: block.id, text, voice: narrator });
  }

  return lines;
}
