import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';

export type NotificationListOpts = ListQueryOpts & { unreadOnly?: string | boolean };

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async send(
    userId: string,
    title: string,
    message: string,
    type = 'info',
    referenceType?: string,
    referenceId?: string,
  ) {
    return this.notificationModel.create({
      userId,
      title,
      message,
      type,
      referenceType,
      referenceId,
    });
  }

  async findByUser(userId: string, opts: NotificationListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { userId: new Types.ObjectId(userId) },
          { userId },
        ],
      },
    ];

    const unreadOnly =
      opts.unreadOnly === true ||
      opts.unreadOnly === 'true' ||
      opts.unreadOnly === '1';
    if (unreadOnly) and.push({ isRead: false });
    if (status && status !== 'all') and.push({ type: status });
    if (search) {
      and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { message: { $regex: search, $options: 'i' } },
          { referenceId: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { isRead: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.notificationModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async markRead(userId: string, notificationId: string) {
    return this.notificationModel
      .findOneAndUpdate({ _id: notificationId, userId }, { isRead: true }, { new: true })
      .exec();
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany({ userId, isRead: false }, { isRead: true });
    return { success: true };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({ userId, isRead: false }).exec();
    return { unreadCount: count };
  }
}
