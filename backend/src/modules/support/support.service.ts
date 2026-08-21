import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { SupportTicket, SupportTicketDocument } from './schemas/support.schema';
import { CreateTicketDto, ReplyTicketDto, UpdateTicketStatusDto } from './dto/support.dto';
import { SupportStatus } from '../../common/enums/support-status.enum';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { sanitizeTicketAttachments } from './utils/ticket-attachment.util';
import { mongoRefEquals, mongoRefId } from './utils/mongo-ref-id.util';
import { NotificationService } from '../notification/notification.service';

export type CreateTicketMeta = {
  participantIds?: string[];
  businessId?: string;
  relatedPaymentId?: string;
  relatedWithdrawalId?: string;
};

export type SupportListOpts = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  category?: string;
  priority?: string;
  /** When true, omit phone from populated user (sub-admin). */
  hideContact?: boolean;
};

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
  ) {}

  async create(userId: string, dto: CreateTicketDto, meta?: CreateTicketMeta) {
    const ticketId = `TKT-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const participantIds = (meta?.participantIds || [])
      .filter((id) => id && id !== userId)
      .map((id) => new Types.ObjectId(id));

    let businessId = meta?.businessId;
    if (!businessId) {
      const user = await this.userModel.findById(userId).select('referredByBusiness').exec();
      if (user?.referredByBusiness) {
        businessId = user.referredByBusiness.toString();
      }
    }

    const attachments = sanitizeTicketAttachments(dto.attachments, userId);
    const message =
      dto.message?.trim() || (attachments.length ? '(See attachments)' : '');
    if (!message) {
      throw new BadRequestException('Message or attachment is required');
    }

    const ticket = await this.ticketModel.create({
      ticketId,
      userId: new Types.ObjectId(userId),
      participantIds,
      businessId: businessId ? new Types.ObjectId(businessId) : undefined,
      relatedPaymentId: meta?.relatedPaymentId
        ? new Types.ObjectId(meta.relatedPaymentId)
        : undefined,
      relatedWithdrawalId: meta?.relatedWithdrawalId
        ? new Types.ObjectId(meta.relatedWithdrawalId)
        : undefined,
      subject: dto.subject,
      message,
      attachments,
      priority: dto.priority,
      category: dto.category,
    });

    const requester = await this.userModel.findById(userId).select('name email').exec();
    const title = 'New support ticket';
    const body = `${requester?.name || 'User'}: ${dto.subject} (${ticketId})`;

    const notifyIds = new Set<string>();
    if (businessId) {
      const biz = await this.businessModel.findById(businessId).select('ownerId').exec();
      if (biz?.ownerId) notifyIds.add(biz.ownerId.toString());
    }
    const admins = await this.userModel
      .find({ role: { $in: [UserRole.ADMIN, UserRole.SUB_ADMIN] }, status: UserStatus.ACTIVE })
      .select('_id')
      .limit(50)
      .exec();
    for (const a of admins) notifyIds.add(a._id.toString());
    notifyIds.delete(userId);

    await Promise.all(
      [...notifyIds].map((id) =>
        this.notificationService.send(id, title, body, 'support', 'support_ticket', ticketId),
      ),
    );

    return ticket;
  }

  private async accessFilter(userId: string, role: UserRole) {
    const oid = new Types.ObjectId(userId);
    const or: Record<string, unknown>[] = [
      { userId: oid },
      { userId },
      { participantIds: oid },
      { participantIds: userId },
    ];

    if (role === UserRole.BUSINESS) {
      const actor = await this.userModel.findById(userId).select('staffBusinessId').exec();
      const biz = await this.businessModel
        .findOne({
          $or: [
            { ownerId: oid },
            { ownerId: userId },
            ...(actor?.staffBusinessId
              ? [{ _id: actor.staffBusinessId }, { _id: actor.staffBusinessId.toString() }]
              : []),
          ],
        })
        .select('_id')
        .exec();
      if (biz) {
        or.push({ businessId: biz._id });
        or.push({ businessId: biz._id.toString() });
        const referred = await this.userModel
          .find({
            $or: [
              { referredByBusiness: biz._id },
              { referredByBusiness: biz._id.toString() },
            ],
          })
          .select('_id')
          .lean()
          .exec();
        if (referred.length) {
          const ids = referred.map((u) => u._id);
          or.push({ userId: { $in: ids } });
        }
      }
    }

    return { $or: or };
  }

  private buildListFilter(
    base: Record<string, unknown>,
    opts: SupportListOpts,
  ): Record<string, unknown> {
    const and: Record<string, unknown>[] = [base];

    if (opts.status && opts.status !== 'all') {
      and.push({ status: opts.status });
    }
    if (opts.category && opts.category !== 'all') {
      and.push({ category: opts.category });
    }
    if (opts.priority && opts.priority !== 'all') {
      and.push({ priority: opts.priority });
    }
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      and.push({
        $or: [
          { ticketId: { $regex: q, $options: 'i' } },
          { subject: { $regex: q, $options: 'i' } },
          { message: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
        ],
      });
    }

    return and.length === 1 ? base : { $and: and };
  }

  private sortSpec(sort?: string): Record<string, 1 | -1> {
    const map: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { status: 1, createdAt: -1 },
      priority: { priority: -1, createdAt: -1 },
      subject: { subject: 1 },
    };
    return map[sort || 'newest'] || map.newest;
  }

  private async assertCanAccess(
    ticket: SupportTicketDocument,
    userId: string,
    role: UserRole,
  ) {
    const isStaff = [UserRole.ADMIN, UserRole.SUB_ADMIN].includes(role);
    if (isStaff) return;

    if (mongoRefEquals(ticket.userId, userId)) return;
    if (ticket.participantIds?.some((id) => mongoRefEquals(id, userId))) return;

    if (role === UserRole.BUSINESS) {
      const actor = await this.userModel.findById(userId).select('staffBusinessId').exec();
      const oid = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
      const biz = await this.businessModel
        .findOne({
          $or: [
            { ownerId: oid },
            { ownerId: userId },
            ...(actor?.staffBusinessId
              ? [{ _id: actor.staffBusinessId }, { _id: actor.staffBusinessId.toString() }]
              : []),
          ],
        })
        .select('_id')
        .exec();
      if (biz) {
        if (ticket.businessId && ticket.businessId.toString() === biz._id.toString()) {
          return;
        }
        const opener = await this.userModel
          .findById(mongoRefId(ticket.userId) || ticket.userId)
          .select('referredByBusiness')
          .exec();
        if (opener?.referredByBusiness?.toString() === biz._id.toString()) {
          return;
        }
      }
    }

    throw new ForbiddenException('Not your ticket');
  }

  async findAccessible(userId: string, role: UserRole, opts: SupportListOpts = {}) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 10;
    const skip = (page - 1) * limit;
    const access = await this.accessFilter(userId, role);
    const filter = this.buildListFilter(access, opts);
    const sort = this.sortSpec(opts.sort);

    const [items, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .populate('userId', 'name email businessUserCode')
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.ticketModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  /** @deprecated use findAccessible */
  async findByUser(userId: string, page = 1, limit = 20) {
    return this.findAccessible(userId, UserRole.USER, { page, limit });
  }

  async findAll(opts: SupportListOpts = {}) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 10;
    const skip = (page - 1) * limit;
    const filter = this.buildListFilter({}, opts);
    const sort = this.sortSpec(opts.sort);
    const userFields = opts.hideContact
      ? 'name email role status businessUserCode'
      : 'name email phone role status businessUserCode';

    const [items, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .populate('userId', userFields)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.ticketModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findByTicketId(ticketId: string, userId?: string, role?: UserRole) {
    const ticket = await this.ticketModel
      .findOne({ ticketId })
        .populate(
          'userId',
          userId
            ? 'name email businessUserCode'
            : 'name email phone role status businessUserCode',
        )
      .exec();
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (userId && role) {
      await this.assertCanAccess(ticket, userId, role);
    } else if (userId) {
      await this.assertCanAccess(ticket, userId, UserRole.USER);
    }
    return ticket;
  }

  async reply(
    ticketId: string,
    authorId: string,
    dto: ReplyTicketDto,
    role: UserRole,
  ) {
    const ticket = await this.ticketModel.findOne({ ticketId }).exec();
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.assertCanAccess(ticket, authorId, role);

    const attachments = sanitizeTicketAttachments(dto.attachments, authorId);
    const message =
      dto.message?.trim() || (attachments.length ? '(See attachments)' : '');
    if (!message) {
      throw new BadRequestException('Message or attachment is required');
    }

    ticket.replies.push({
      authorId: new Types.ObjectId(authorId),
      message,
      attachments,
      createdAt: new Date(),
    });

    const isStaff = [UserRole.ADMIN, UserRole.SUB_ADMIN].includes(role);
    if (isStaff && ticket.status === SupportStatus.OPEN) {
      ticket.status = SupportStatus.IN_PROGRESS;
    }

    await ticket.save();
    return ticket;
  }

  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    const update: Record<string, unknown> = {};
    if (dto.status) update.status = dto.status;
    if (dto.assignedTo) update.assignedTo = dto.assignedTo;

    const ticket = await this.ticketModel
      .findOneAndUpdate({ ticketId }, update, { new: true })
      .exec();
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }
}
