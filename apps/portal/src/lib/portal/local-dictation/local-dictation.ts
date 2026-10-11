export type LocalRecognition = {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type RecognitionConstructor = {
  new (): LocalRecognition;
  available?: (options: {
    langs: string[];
    processLocally: true;
    quality: 'dictation';
  }) => Promise<string>;
};
/** Never fall back to the browser's default remote recognizer or download a pack. */
export async function prepareLocalDictation(
  ctor: RecognitionConstructor | undefined,
  lang: string,
): Promise<LocalRecognition | null> {
  if (!ctor?.available) return null;
  const recognition = new ctor();
  if (!('processLocally' in recognition)) return null;
  recognition.processLocally = true;
  if (
    !recognition.processLocally ||
    (await ctor.available({ langs: [lang], processLocally: true, quality: 'dictation' })) !==
      'available'
  )
    return null;
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  return recognition;
}
