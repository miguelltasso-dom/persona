import type { MessageView } from '../src/client/remote/persona-remote-types.ts'

/** Minimal host message row for client mapper tests (MessageView v1). */
export function hostMessage(partial: Pick<MessageView, 'id' | 'body' | 'actorId' | 'subjectId' | 'occurredAt' | 'seq'> & {
  readonly streamId?: string
  readonly type?: string
  readonly reactions?: MessageView['reactions']
  readonly runError?: MessageView['runError']
}): MessageView {
  const { reactions, runError, ...rest } = partial
  return {
    streamId: 'channel:geral',
    type: 'message',
    source: 'host',
    attachmentIds: [],
    replyToId: '',
    editedAt: '',
    pinned: false,
    topicId: '',
    ...rest,
    ...(reactions === undefined ? {} : { reactions }),
    ...(runError === undefined ? {} : { runError }),
  }
}
