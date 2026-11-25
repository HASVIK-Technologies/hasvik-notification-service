import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { CreateNotificationDto } from './dto/notification.dto';
import { MongoService } from './mongo/mongo.service';
import { NotificationStatus } from './mongo/enums';
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly mongo: MongoService) {}
  private hash(dto: CreateNotificationDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: dto.tenantId,
          channel: dto.channel,
          category: dto.category,
          recipient: dto.recipient,
          templateCode: dto.templateCode,
          variables: dto.variables || {},
          scheduledAt: dto.scheduledAt || null,
        }),
      )
      .digest('hex');
  }
  async create(dto: CreateNotificationDto) {
    const hash = this.hash(dto);
    const key = {
      tenantId: new Types.ObjectId(dto.tenantId),
      sourceService: 'crm',
      idempotencyKey: `${dto.tenantId}:crm:${dto.idempotencyKey}`,
    };
    const existing = await this.mongo.models.notificationLog.findOne(key).lean();
    if (existing) {
      if (existing.payloadHash !== hash)
        throw new ConflictException('Idempotency key reused with different payload');
      this.logger.log(`Returning existing notification ${existing._id}`);
      return { id: String(existing._id), status: existing.status, duplicate: true };
    }
    try {
      const record = await this.mongo.models.notificationLog.create({
        ...dto,
        ...key,
        provider: 'msg91',
        payloadHash: hash,
        status: NotificationStatus.QUEUED,
        nextAttemptAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
      });
      this.logger.log(`Notification ${record._id} queued`);
      return { id: String(record._id), status: NotificationStatus.QUEUED, duplicate: false };
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        const record = await this.mongo.models.notificationLog.findOne(key).lean();
        if (record?.payloadHash !== hash) throw new ConflictException('Idempotency key conflict');
        this.logger.log(`Returning existing notification ${record?._id}`);
        return { id: String(record?._id), status: record?.status, duplicate: true };
      }
      throw e;
    }
  }
  async bulk(items: CreateNotificationDto[]) {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        results.push({ index: i, ok: true, ...(await this.create(items[i])) });
      } catch (e) {
        results.push({ index: i, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results };
  }
  async find(id: string, tenantId: string) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(tenantId))
      throw new BadRequestException('Invalid ID');
    const record = await this.mongo.models.notificationLog
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .select('-variables -payloadHash')
      .lean();
    if (!record) throw new NotFoundException();
    return record;
  }
  async retry(id: string, tenantId: string) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(tenantId))
      throw new BadRequestException('Invalid ID');
    const record = await this.mongo.models.notificationLog.findOneAndUpdate(
      {
        _id: id,
        tenantId: new Types.ObjectId(tenantId),
        status: NotificationStatus.FAILED,
      },
      {
        $set: {
          status: NotificationStatus.QUEUED,
          nextAttemptAt: new Date(),
          lastError: null,
          attempts: 0,
        },
      },
      { new: true },
    );
    if (!record) throw new NotFoundException('Failed notification not found');
    this.logger.log(`Notification ${record._id} queued for retry`);
    return { id: String(record._id), status: record.status };
  }
}
