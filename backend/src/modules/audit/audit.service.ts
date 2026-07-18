import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit.schema';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';

export interface AuditParams {
  actorId?: string;
  actorEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export type AuditListOpts = ListQueryOpts & { resource?: string };

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>) {}

  async log(params: AuditParams) {
    return this.auditModel.create(params);
  }

  async findAll(opts: AuditListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts, 50);
    const and: Record<string, unknown>[] = [];

    if (opts.resource && opts.resource !== 'all') {
      and.push({ resource: opts.resource });
    }
    if (status) and.push({ action: status });
    if (search) {
      and.push({
        $or: [
          { actorEmail: { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } },
          { resource: { $regex: search, $options: 'i' } },
          { resourceId: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { action: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.auditModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }
}
