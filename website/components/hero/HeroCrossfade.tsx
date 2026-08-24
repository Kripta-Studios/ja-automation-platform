'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import roboticsImg from '@/public/images/hero/hero-robotics.webp';
import foodBevImg from '@/public/images/hero/hero-food-beverage.webp';
import energyImg from '@/public/images/hero/hero-energy-process.webp';

const heroFrames = [
  {
    src: roboticsImg,
    altKey: 'heroRobotics',
    objectPosition: '55% 52%',
    sectorKey: 'sectorAutomotive' as const,
  },
  {
    src: foodBevImg,
    altKey: 'heroFoodBeverage',
    objectPosition: '48% 50%',
    sectorKey: 'sectorFoodBev' as const,
  },
  {
    src: energyImg,
    altKey: 'heroEnergyProcess',
    objectPosition: '50% 55%',
    sectorKey: 'sectorEnergy' as const,
  },
];

const FRAME_HOLD_MS = 7000;
const FADE_DURATION_MS = 1200;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot() {
  return false;
}

export function HeroCrossfade() {
  const t = useTranslations('hero');
  const imageAlt = useTranslations('imageAlts');
  const [activeIndex, setActiveIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isFading, setIsFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );

  const startTransition = useCallback(() => {
    if (reducedMotion) return;

    const next = (activeIndex + 1) % heroFrames.length;
    setNextIndex(next);
    setIsFading(true);

    timerRef.current = setTimeout(() => {
      setActiveIndex(next);
      setNextIndex(null);
      setIsFading(false);
    }, FADE_DURATION_MS);
  }, [activeIndex, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const interval = setInterval(startTransition, FRAME_HOLD_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startTransition, reducedMotion]);

  const currentSector =
    nextIndex !== null ? heroFrames[nextIndex].sectorKey : heroFrames[activeIndex].sectorKey;

  return (
    <div className="hero-media relative w-full">
      {/* Active Frame */}
      <Image
        src={heroFrames[activeIndex].src}
        alt={imageAlt(heroFrames[activeIndex].altKey)}
        fill
        priority={activeIndex === 0}
        className="object-cover"
        style={{ objectPosition: heroFrames[activeIndex].objectPosition }}
        sizes="100vw"
        quality={85}
      />

      {/* Next Frame (fading in) */}
      {nextIndex !== null && (
        <Image
          src={heroFrames[nextIndex].src}
          alt={imageAlt(heroFrames[nextIndex].altKey)}
          fill
          className="object-cover"
          style={{
            objectPosition: heroFrames[nextIndex].objectPosition,
            opacity: isFading ? 1 : 0,
            transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          }}
          sizes="100vw"
          quality={85}
        />
      )}

      {/* Sector Label */}
      <div className="absolute bottom-8 right-8 lg:bottom-12 lg:right-12 z-10" aria-hidden="true">
        <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs tracking-[0.16em] text-white/60 uppercase transition-opacity duration-200">
          {t(currentSector)}
        </span>
      </div>
    </div>
  );
}
