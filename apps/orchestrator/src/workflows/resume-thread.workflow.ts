import type { PostActivity } from '../activities/post.activity';
import { proxyActivities } from '@temporalio/workflow';

export async function resumeThreadWorkflow(input: {
  organizationId: string;
  postId: string;
  taskQueue: string;
}) {
  const { getPostsList, updatePost, changeState } =
    proxyActivities<PostActivity>({
      startToCloseTimeout: '10 minute',
      retry: { maximumAttempts: 3 },
    });
  const { postComment } = proxyActivities<PostActivity>({
    taskQueue: input.taskQueue,
    startToCloseTimeout: '10 minute',
    retry: { maximumAttempts: 1 },
  });
  const parts = await getPostsList(input.organizationId, input.postId);
  const root = parts[0];
  if (!root?.releaseId || root.releaseId === 'missing') {
    throw new Error('Root receipt required to resume');
  }
  if (root.integration.disabled || root.integration.refreshNeeded) {
    await changeState(
      root.id,
      'ERROR',
      'Reconnect the channel before retrying'
    );
    return;
  }
  let previous = root.releaseId;
  for (const part of parts.slice(1)) {
    if (part.releaseId && part.releaseId !== 'missing') {
      previous = part.releaseId;
      continue;
    }
    try {
      const [receipt] = await postComment(
        root.releaseId,
        previous,
        root.integration,
        [part]
      );
      if (!receipt?.postId) throw new Error('Reply receipt missing');
      await updatePost(part.id, receipt.postId, receipt.releaseURL);
      previous = receipt.postId;
    } catch {
      await changeState(root.id, 'ERROR', 'Reply failed; try again');
      return;
    }
  }
  await changeState(root.id, 'PUBLISHED');
}
