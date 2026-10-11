import { expect, it, vi } from 'vitest';
import {
  prepareLocalDictation,
  type RecognitionConstructor,
} from '../../apps/portal/src/lib/portal/local-dictation/local-dictation';
it('requires installed local speech support and never starts or installs a recognizer implicitly', async () => {
  const start = vi.fn();
  const available = vi.fn(async () => 'available');
  class Recognition {
    static available = available;
    processLocally = false;
    start = start;
  }
  const ctor = Recognition as unknown as RecognitionConstructor;
  const result = await prepareLocalDictation(ctor, 'es-ES');
  expect(result).toMatchObject({
    processLocally: true,
    lang: 'es-ES',
    interimResults: false,
    continuous: false,
  });
  expect(available).toHaveBeenCalledWith({
    langs: ['es-ES'],
    processLocally: true,
    quality: 'dictation',
  });
  expect(start).not.toHaveBeenCalled();
  available.mockResolvedValue('downloadable');
  expect(await prepareLocalDictation(ctor, 'pt-PT')).toBeNull();
  expect(await prepareLocalDictation(undefined, 'en-US')).toBeNull();
  class Legacy {
    static available = available;
    start = start;
  }
  available.mockClear();
  expect(
    await prepareLocalDictation(Legacy as unknown as RecognitionConstructor, 'en-US'),
  ).toBeNull();
  expect(available).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});
