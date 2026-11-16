import { describe, expect, it } from 'vitest';
import { aggregateGrid, bucketFor, cellForZoom } from '../src/lib/grid';
import { deadlineNote, programCoversCounty, windowLabel, windowStatus } from '../src/lib/programs';

describe('grid', () => {
  it('buckets counts like the map legend', () => {
    expect([1, 2, 3, 9, 10, 29, 30, 99, 100, 500].map(bucketFor)).toEqual([1, 1, 3, 3, 10, 10, 30, 30, 100, 100]);
  });
  it('groups nearby points into one square and splits distant ones', () => {
    const f = aggregateGrid([{ lat: 44.01, lng: -121.31 }, { lat: 44.02, lng: -121.32 }, { lat: 30, lng: -90 }, { lat: NaN, lng: 1 }], 1);
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.properties.count).sort()).toEqual([1, 2]);
    const ring = f[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[4]);
  });
  it('gets finer as you zoom in', () => {
    expect(cellForZoom(4)).toBeGreaterThan(cellForZoom(8));
    expect(cellForZoom(30)).toBeGreaterThanOrEqual(0.005);
  });
});

describe('program windows', () => {
  const today = '2026-11-16';
  it('classifies windows', () => {
    expect(windowStatus({ window_start: '2026-10-28', window_end: '2027-01-26' }, today)).toBe('open');
    expect(windowStatus({ window_start: null, window_end: null, rolling: 1 }, today)).toBe('rolling');
    expect(windowStatus({ window_start: '2027-03-01', window_end: '2027-04-01' }, today)).toBe('upcoming');
    expect(windowStatus({ window_start: null, window_end: '2023-02-01' }, today)).toBe('past');
  });
  it('labels them the way the public page does', () => {
    expect(windowLabel({ window_start: '2026-10-28', window_end: '2027-01-26' })).toBe('Oct 28, 2026 to Jan 26, 2027');
    expect(windowLabel({ window_end: '2023-02-01' })).toBe('Deadline Feb 1, 2023');
    expect(windowLabel({})).toBe('Rolling, no dates listed');
    expect(deadlineNote({ window_end: '2027-01-26' }, today)).toBe('71 days left');
    expect(deadlineNote({ window_end: '2023-02-01' }, today)).toBe('Closed');
  });
  it('checks geography', () => {
    const county = { scope: 'counties', state: 'OR', counties: 'Deschutes, Crook' };
    expect(programCoversCounty(county, 'Deschutes County', 'OR')).toBe(true);
    expect(programCoversCounty(county, 'Lane County', 'OR')).toBe(false);
    expect(programCoversCounty(county, 'Deschutes County', 'CA')).toBe(false);
    expect(programCoversCounty({ scope: 'state', state: 'OR', counties: null }, 'Lane', 'OR')).toBe(true);
    expect(programCoversCounty({ scope: 'national', state: null, counties: null }, null, null)).toBe(true);
  });
});
