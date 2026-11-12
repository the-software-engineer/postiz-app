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

  describe.each(['mastodon', 'mastodon-custom'])('%s', (provider) => {
    it.each(['https://a.co', url])('counts %s as 23 characters', (link) => {
      expect(countCharacters(provider, link)).toBe(23);
    });

    it('counts each URL and keeps surrounding punctuation', () => {
      expect(countCharacters(provider, `See (${url}), https://a.co.`)).toBe(55);
    });

    it('leaves non-URL text and bare domains unchanged', () => {
      const text = 'hello 👍 example.com';
      expect(countCharacters(provider, text)).toBe(text.length);
    });

    it.each(['gregory.sh', 'protectmysim.com'])(
      'accepts 500 counted characters with 1 to 20 %s links',
      (host) => {
        const link = `https://${host}/z/nr1_${'a'.repeat(24)}`;
        for (let n = 1; n <= 20; n++) {
          const text = 'a'.repeat(500 - 24 * n) + ` ${link}`.repeat(n);
          expect(text.length).toBe(500 + n * (link.length - 23));
          expect(text.length).toBeGreaterThan(500);
          expect(countCharacters(provider, text)).toBe(500);
          expect(countCharacters(provider, text + '\n')).toBe(501);
        }
      }
    );

    it('rejects 501 counted characters even when raw length is below 500', () => {
      const text = 'a'.repeat(477) + ' https://a.co';
      expect(text.length).toBeLessThan(500);
      expect(countCharacters(provider, text)).toBe(501);
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
      expect(countCharacters('unknown', url)).toBe(url.length);
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
