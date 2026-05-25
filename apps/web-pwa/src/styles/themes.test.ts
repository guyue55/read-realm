import { describe, it, expect } from 'vitest';
import { THEMES } from './themes';

describe('THEMES', () => {
  it('should have all required themes', () => {
    const expectedThemes = ['paper', 'sepia', 'green', 'dark', 'black'];
    expect(Object.keys(THEMES)).toEqual(expect.arrayContaining(expectedThemes));
  });

  it('should have correct colors for each theme', () => {
    expect(THEMES.paper).toEqual({ bg: '#F8F8F5', text: '#2F2A24' });
    expect(THEMES.sepia).toEqual({ bg: '#F4ECD8', text: '#3A2D22' });
    expect(THEMES.green).toEqual({ bg: '#DDEBD6', text: '#263527' });
    expect(THEMES.dark).toEqual({ bg: '#1E1E1E', text: '#CFCFCF' });
    expect(THEMES.black).toEqual({ bg: '#000000', text: '#BDBDBD' });
  });
});
