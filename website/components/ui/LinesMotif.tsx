import Image from 'next/image';
import linesImg from '@/public/brand/lines.webp';

export function LinesMotif({ className = '' }: { className?: string }) {
  return (
    <Image
      src={linesImg}
      alt=""
      aria-hidden="true"
      width={80}
      height={7}
      className={`lines-motif ${className}`.trim()}
    />
  );
}
