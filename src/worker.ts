import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationProviderFactory } from './providers/notification-provider.factory';
import { MongoService } from './mongo/mongo.service';
import { NotificationLog } from './mongo/interfaces';
import { NotificationChannel, NotificationStatus } from './mongo/enums';
@Injectable()
export class DeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorker.name);
  private static readonly cronJobName = 'notification-delivery-worker';
  private busy = false;
  constructor(
    private readonly mongo: MongoService,
    private readonly providers: NotificationProviderFactory,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('NOTIFICATION_WORKER_ENABLED', 'true') === 'false') return;

    const cronExpression = this.config.get<string>('NOTIFICATION_WORKER_CRON', '0 */2 * * * *');
    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => this.tick(),
      waitForCompletion: true,
      name: DeliveryWorker.cronJobName,
    });

    this.schedulerRegistry.addCronJob(DeliveryWorker.cronJobName, job);
    job.start();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('cron', DeliveryWorker.cronJobName)) {
      this.schedulerRegistry.deleteCronJob(DeliveryWorker.cronJobName);
    }
  }
  async tick() {
    this.logger.log('Processing notification delivery');
    if (this.busy) return;
    if (this.config.get<string>('NOTIFICATION_DELIVERY_ENABLED') !== 'true') {
      this.logger.warn('Notification delivery is disabled; due notifications remain queued');
      return;
    }

    this.busy = true;
    try {
      const batchMax = this.getPositiveIntegerConfig('NOTIFICATION_BATCH_MAX', 100);
      for (let n = 0; n < batchMax; n++) {
        const now = new Date();
        const lease = new Date(
          now.getTime() + this.getPositiveIntegerConfig('NOTIFICATION_LEASE_MS', 120000),
        );

        const filter =  {
            $or: [
              {
                status: NotificationStatus.QUEUED,
                $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: null }],
              },
              {
                status: NotificationStatus.RETRY_PENDING,
                $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: null }],
              },
              {
                status: NotificationStatus.PROCESSING,
                $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: null }],
              },
            ],
          };
          
        const record = await this.mongo.models.notificationLog.findOneAndUpdate(
          filter,
          {
            $set: { status: NotificationStatus.PROCESSING, leaseUntil: lease },
            $inc: { attempts: 1 },
          },
          { sort: { nextAttemptAt: 1 }, new: true },
        );
        if (!record) break;
        await this.process(record);
      }
    } catch (e) {
      this.logger.error('Worker tick failed', e instanceof Error ? e.stack : String(e));
    } finally {
      this.busy = false;
    }
  }
  private async process(record: NotificationLog) {
    try {
      const templates = this.mongo.models.notificationTemplate;
      const template = await templates
        .findOne({
          code: record.templateCode.toUpperCase(),
          channel: record.channel,
          isActive: true,
          $or: [{ tenantId: record.tenantId }, { tenantId: null }],
        })
        .sort({ tenantId: -1 })
        .lean();
      if (!template)
        throw new Error('Active notification template not found: ' + record.templateCode);
      const provider = this.providers.getProvider(record.channel as NotificationChannel);
      const result = await provider.send({
        channel: record.channel as NotificationChannel,
        recipient: record.recipient,
        templateCode: template.code,
        providerTemplateId: template.providerTemplateId ?? undefined,
        requiredVariables: template.requiredVariables,
        variables: record.variables,
      });
      await this.mongo.models.notificationLog.updateOne(
        { _id: record._id, status: NotificationStatus.PROCESSING },
        {
          $set: {
            status: NotificationStatus.ACCEPTED,
            provider: provider.name,
            providerMessageId: result.providerMessageId,
            processedAt: new Date(),
          },
          $unset: { leaseUntil: 1 },
        },
      );
    } catch (e) {
      const attempts = record.attempts;
      const max = this.getPositiveIntegerConfig('NOTIFICATION_MAX_ATTEMPTS', 6);
      const delay = Math.min(
        3600000,
        this.getPositiveIntegerConfig('NOTIFICATION_RETRY_BASE_MS', 60000) *
          Math.pow(2, Math.max(0, attempts - 1)),
      );
      const failed = attempts >= max;
      await this.mongo.models.notificationLog.updateOne(
        { _id: record._id, status: NotificationStatus.PROCESSING },
        {
          $set: {
            status: failed ? NotificationStatus.FAILED : NotificationStatus.RETRY_PENDING,
            lastError: e instanceof Error ? e.message : String(e),
            nextAttemptAt: new Date(Date.now() + delay),
            processedAt: new Date(),
          },
          $unset: { leaseUntil: 1 },
        },
      );
      this.logger.warn(`Notification ${record._id} ${failed ? 'failed' : 'will retry'}`);
    }
  }

  private getPositiveIntegerConfig(name: string, defaultValue: number): number {
    const value = this.config.get<string>(name);
    if (value === undefined || value.trim() === '') return defaultValue;

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  }
}
