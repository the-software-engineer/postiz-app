import { beforeEach, describe, expect, it, vi } from 'vitest';
const a = vi.hoisted(() => ({
  getPostsList: vi.fn(),
  postComment: vi.fn(),
  updatePost: vi.fn(),
  changeState: vi.fn(),
}));
vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => a }));
import { resumeThreadWorkflow } from './resume-thread.workflow';
const input = { organizationId: 'org', postId: 'root', taskQueue: 'mastodon' };
const root = {
  id: 'root',
  releaseId: 'status-1',
  releaseURL: 'https://m.example/1',
  integration: {},
};
describe('resume a published thread', () => {
  beforeEach(() => vi.resetAllMocks());
  it('keeps the root receipt and retries only the media-only reply after failure', async () => {
    const reply = {
      id: 'reply',
      content: '',
      image: '[{"path":"video.mp4"}]',
      releaseId: null,
    };
    a.getPostsList.mockResolvedValue([root, reply]);
    a.postComment
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce([
        { id: 'reply', postId: 'status-2', releaseURL: 'https://m.example/2' },
      ]);
    await resumeThreadWorkflow(input);
    expect(a.changeState).toHaveBeenCalledWith(
      'root',
      'ERROR',
      'Reply failed; try again'
    );
    expect(a.updatePost).not.toHaveBeenCalled();
    await resumeThreadWorkflow(input);
    expect(a.postComment).toHaveBeenCalledTimes(2);
    expect(a.postComment).toHaveBeenLastCalledWith(
      'status-1',
      'status-1',
      root.integration,
      [reply]
    );
    expect(a.updatePost).toHaveBeenCalledWith(
      'reply',
      'status-2',
      'https://m.example/2'
    );
    expect(a.changeState).toHaveBeenLastCalledWith('root', 'PUBLISHED');
  });
  it('skips every stored receipt, including a completed reply', async () => {
    a.getPostsList.mockResolvedValue([
      root,
      { id: 'reply', releaseId: 'status-2' },
    ]);
    await resumeThreadWorkflow(input);
    expect(a.postComment).not.toHaveBeenCalled();
  });
  it('refuses a thread without a durable root receipt', async () => {
    a.getPostsList.mockResolvedValue([
      { ...root, releaseId: null },
      { id: 'reply' },
    ]);
    await expect(resumeThreadWorkflow(input)).rejects.toThrow('Root receipt');
    expect(a.postComment).not.toHaveBeenCalled();
  });
});
