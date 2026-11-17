import { describe, expect, it } from 'vitest';
import {
  minorToProjectAmount,
  minutesToProjectHours,
  projectAmountToMinor,
  projectHoursToMinutes,
} from '../../apps/portal/src/lib/portal/sections/project-budget-input';

describe('project budget form display', () => {
  it('keeps blank distinct from explicit zero', () => {
    expect(minorToProjectAmount('')).toBe('');
    expect(projectAmountToMinor('')).toBe('');
    expect(minorToProjectAmount('0')).toBe('0.00');
    expect(projectAmountToMinor('0.00')).toBe('0');
  });

  it('round-trips exact amounts with comma or dot decimal separators', () => {
    expect(minorToProjectAmount('1500000')).toBe('15000.00');
    expect(projectAmountToMinor('15000.00')).toBe('1500000');
    expect(projectAmountToMinor('15000,25')).toBe('1500025');
    expect(projectAmountToMinor('1,000.25')).toBe('');
  });

  it('shows planned effort in hours while submitting integral minutes', () => {
    expect(minutesToProjectHours('72000')).toBe('1200');
    expect(projectHoursToMinutes('1200')).toBe('72000');
    expect(projectHoursToMinutes('7,5')).toBe('450');
    expect(projectHoursToMinutes(minutesToProjectHours('1'))).toBe('1');
    expect(projectHoursToMinutes('')).toBe('');
  });
});

describe('project budget amounts follow the currency minor units', () => {
  it('shows and parses JPY as whole yen', () => {
    expect(minorToProjectAmount('1500', 'JPY')).toBe('1500');
    expect(projectAmountToMinor('1500', 'JPY')).toBe('1500');
    expect(projectAmountToMinor('1500.50', 'JPY')).toBe('');
    expect(minorToProjectAmount('1500', 'USD')).toBe('15.00');
  });

  it('accepts hours:minutes like the Time screen', () => {
    expect(projectHoursToMinutes('8:15')).toBe('495');
    expect(projectHoursToMinutes('2:40')).toBe('160');
    expect(projectHoursToMinutes('120:30')).toBe('7230');
    expect(projectHoursToMinutes('8:75')).toBe('');
  });
});
