import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Receipt, Ref, ServiceContext } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { ref } from './references.js';
export class NotificationDelivery {
  private readonly authorization: Authorization;
  private readonly commands: Commands;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
  }
  private async recipient(
    context: ServiceContext,
    notice: ModelData,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    await this.authorization.identity(context, transaction);
    requireCondition(
      (notice.recipientAccountRefs as Ref[]).some((value) => value.id === context.principalId),
      404,
      'NOT_FOUND',
      '대상을 확인할 수 없습니다.',
    );
  }
  async read(
    context: ServiceContext,
    cursor: string | null = null,
    pageSize = 25,
  ): Promise<unknown> {
    await this.authorization.identity(context);
    const notices = await this.store.list('NotificationIntent', {
      equals: { recipientAccountRefs: [{ id: context.principalId }] },
      cursor,
      limit: pageSize,
    });
    const items = [];
    for (const notice of notices) {
      await this.recipient(context, notice);
      const reads = await this.store.list('NoticeReadReceipt', {
        equals: {
          notificationRef: { id: notice.notificationId },
          readerAccountRef: { id: context.principalId },
        },
        limit: 1,
      });
      items.push({
        knowledge: 'KNOWN',
        data: {
          notificationRef: ref('NotificationIntent', notice),
          minimalText: notice.minimalText,
          loginPath: notice.loginPath,
          createdAt: notice.createdAt,
          readAt: reads[0]?.readAt ?? null,
          requiredActionRefs: [],
        },
        sourceRefs: [ref('NotificationIntent', notice)],
        observedAt: this.now().toISOString(),
      });
    }
    return this.store.schema.validate('NotificationViewResultPage', {
      items,
      nextCursor: notices.length === pageSize ? String(notices.at(-1)!.notificationId) : null,
      observedAt: this.now().toISOString(),
    });
  }
  async recordRead(
    context: ServiceContext,
    input: { meta: CommandMeta; notificationRef: Ref },
  ): Promise<Receipt> {
    this.store.schema.validate('NoticeInput', input);
    const notice = await this.store.read('NotificationIntent', input.notificationRef.id);
    requireCondition(notice, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
    return this.commands.run(
      context,
      'NotificationDelivery',
      'recordNoticeRead',
      { kind: 'RECORD', recordRef: input.notificationRef },
      input,
      'NotificationHistory',
      (transaction) => this.recipient(context, notice, transaction),
      async (transaction) => {
        const previous = await transaction.list(
          'NoticeReadReceipt',
          {
            notificationRef: { id: notice.notificationId },
            readerAccountRef: { id: context.principalId },
          },
          1,
        );
        const record = previous[0] ?? {
          noticeReadId: randomUUID(),
          notificationRef: ref('NotificationIntent', notice),
          readerAccountRef: context.actorAccountRef,
          readAt: this.now().toISOString(),
          revision: 1,
        };
        if (!previous[0]) await transaction.put('NoticeReadReceipt', record);
        return {
          target: ref('NoticeReadReceipt', record),
          refs: [ref('NoticeReadReceipt', record)],
          scope: null,
          state: 'RESULT_RECORDED',
        };
      },
    );
  }
}
