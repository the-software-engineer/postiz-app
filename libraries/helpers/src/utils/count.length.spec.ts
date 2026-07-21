import {
  countCharacters,
  toShortBlueskyUrl,
  blueskyDisplayText,
  weightedLength,
} from './count.length';

describe('countCharacters', () => {
  const url = 'https://example.com/some/very/long/path/that/keeps/going?ref=1';

  describe('x', () => {
    it('counts a URL as a fixed 23 characters', () => {
      expect(countCharacters('x', url)).toBe(23);
    });

    it('counts plain text by its length', () => {
      expect(countCharacters('x', 'hello world')).toBe(11);
    });

    it('matches twitter weightedLength', () => {
      const text = `check this ${url} out`;
      expect(countCharacters('x', text)).toBe(weightedLength(text));
    });
  });

  describe('bluesky', () => {
    it('counts a long URL as its shortened display length', () => {
      const short = toShortBlueskyUrl(url);
      expect(countCharacters('bluesky', url)).toBe([...short].length);
      expect([...short].length).toBeLessThan([...url].length);
    });

    it('leaves a short URL unchanged', () => {
      const shortUrl = 'https://example.com';
      expect(countCharacters('bluesky', shortUrl)).toBe(
        [...toShortBlueskyUrl(shortUrl)].length
      );
    });

    it('counts graphemes, not code units, for emoji', () => {
      expect(countCharacters('bluesky', '👍')).toBe(1);
    });

    it('counts plain text raw', () => {
      expect(countCharacters('bluesky', 'hello')).toBe(5);
    });
  });

  describe('linkedin and threads keep full URLs', () => {
    it('counts linkedin by raw length', () => {
      expect(countCharacters('linkedin', url)).toBe(url.length);
    });

    it('counts threads by raw length', () => {
      expect(countCharacters('threads', url)).toBe(url.length);
    });

    it('counts an unknown provider by raw length', () => {
      expect(countCharacters('mastodon', url)).toBe(url.length);
    });
  });
});

describe('toShortBlueskyUrl', () => {
  it('drops the protocol and www, and truncates long paths', () => {
    expect(toShortBlueskyUrl('https://www.example.com/a/very/long/path')).toBe(
      'example.com/a/very/long/…'
    );
  });

  it('keeps short paths whole', () => {
    expect(toShortBlueskyUrl('https://example.com/short')).toBe(
      'example.com/short'
    );
  });

  it('drops a bare trailing slash', () => {
    expect(toShortBlueskyUrl('https://example.com/')).toBe('example.com');
  });
});

describe('blueskyDisplayText', () => {
  it('shortens every URL in the text', () => {
    const text = 'see https://www.example.com/a/very/long/path now';
    expect(blueskyDisplayText(text)).toBe('see example.com/a/very/long/… now');
  });
});
