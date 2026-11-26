// Image imports (.webp, .png, ...) resolve to StaticImageData, as in the next-env.d.ts that
// `next build` / `next dev` generate (that file is not tracked, so a plain `tsc` needs this).
/// <reference types="next/image-types/global" />
