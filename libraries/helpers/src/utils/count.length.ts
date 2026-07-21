// @ts-ignore
import twitter from 'twitter-text';

// Keep this in sync with the URL detection in strip.links.ts
const urlRegex = () =>
  /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gm;

// Every t.co link on X counts as this many characters, no matter its real length
export const X_TRANSFORMED_URL_LENGTH = 23;

export const textSlicer = (
  integrationType: string,
  end: number,
  text: string
): { start: number; end: number } => {
  if (integrationType !== 'x') {
    return {
      start: 0,
      end,
    };
  }

  const { validRangeEnd, valid } = twitter.parseTweet(text, {
    version: 3,
    maxWeightedTweetLength: end,
    scale: 100,
    defaultWeight: 200,
    emojiParsingEnabled: true,
    transformedURLLength: X_TRANSFORMED_URL_LENGTH,
    ranges: [
      { start: 0, end: 4351, weight: 100 },
      { start: 8192, end: 8205, weight: 100 },
      { start: 8208, end: 8223, weight: 100 },
      { start: 8242, end: 8247, weight: 100 },
    ],
  });

  return {
    start: 0,
    end: valid ? end : validRangeEnd,
  };
};

export const weightedLength = (text: string): number => {
  return twitter.parseTweet(text).weightedLength;
};

// Count graphemes (user-perceived characters), the unit Bluesky uses for its 300 limit
const graphemeLength = (text: string): number => {
  const Segmenter = (Intl as any)?.Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const _ of segmenter.segment(text)) {
      count++;
    }
    return count;
  }
  return [...text].length;
};

// bsky.app's toShortUrl: how the Bluesky client shrinks a link's visible text
export const toShortBlueskyUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return url;
    }
    const path =
      (parsed.pathname === '/' ? '' : parsed.pathname) +
      parsed.search +
      parsed.hash;
    const host = parsed.host.startsWith('www.')
      ? parsed.host.slice(4)
      : parsed.host;
    return host + (path.length > 15 ? path.slice(0, 13) + '…' : path);
  } catch {
    return url;
  }
};

// The text Bluesky actually shows: every link replaced by its shortened display form
export const blueskyDisplayText = (text: string): string => {
  return text.replace(urlRegex(), (match) => toShortBlueskyUrl(match));
};

// Single source of truth for how many characters a post costs on a given platform.
// Backend gate and frontend counter both call this so they never drift.
export const countCharacters = (
  providerIdentifier: string,
  text: string
): number => {
  switch (providerIdentifier) {
    // X routes every link through t.co, so URLs weigh a fixed 23 chars
    case 'x':
      return weightedLength(text);
    // Bluesky counts graphemes of the visible text; we shorten link display like the app does
    case 'bluesky':
      return graphemeLength(blueskyDisplayText(text));
    // LinkedIn, Threads and the rest keep full URLs, so raw length is correct
    default:
      return text.length;
  }
};
