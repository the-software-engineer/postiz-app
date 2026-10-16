import { describe, expect, it, vi } from 'vitest';
vi.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({
  SocialAbstract: class {},
}));
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  getSsrfSafeDispatcher: vi.fn(),
}));
import { MastodonProvider } from './mastodon.provider';
describe('Mastodon media thread', () => {
  it('keeps root text and explicit visibility, with stable status idempotency', async () => {
    const provider = new MastodonProvider();
    const request = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ id: 'status' }) });
    Object.assign(provider, { fetch: request });
    vi.spyOn(provider, 'uploadFile').mockResolvedValue('media');
    const part = {
      id: 'part',
      message: 'Theo’s text',
      settings: { visibility: 'direct' },
      media: [{ path: 'photo.png', alt: 'A photo' }],
    };
    await provider.dynamicPost('account', 'token', 'https://m.example', [
      part,
    ] as any);
    const init = request.mock.calls[0][1];
    expect(init.body.get('status')).toBe('Theo’s text');
    expect(init.body.get('visibility')).toBe('direct');
    expect(init.headers['Idempotency-Key']).toBe('postiz:part');
  });
  it('sends an empty-text media reply under the root with the same visibility', async () => {
    const provider = new MastodonProvider();
    const request = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ id: 'reply-status' }) });
    Object.assign(provider, { fetch: request });
    vi.spyOn(provider, 'uploadFile').mockResolvedValue('video');
    await provider.dynamicComment(
      'account',
      'root-status',
      undefined,
      'token',
      'https://m.example',
      [
        {
          id: 'reply',
          message: '',
          settings: { visibility: 'private' },
          media: [{ path: 'clip.mp4', alt: '' }],
        },
      ] as any
    );
    const init = request.mock.calls[0][1];
    expect(init.body.get('status')).toBe('');
    expect(init.body.get('visibility')).toBe('private');
    expect(init.body.get('in_reply_to_id')).toBe('root-status');
    expect(init.body.getAll('media_ids[]')).toEqual(['video']);
    expect(init.headers['Idempotency-Key']).toBe('postiz:reply');
  });
});
