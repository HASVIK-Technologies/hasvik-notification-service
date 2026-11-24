import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { DeliveryWorker } from './worker';
import { Msg91Provider } from './providers/msg91.provider';
import { NotificationProviderFactory } from './providers/notification-provider.factory';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, DeliveryWorker, Msg91Provider, NotificationProviderFactory],
  exports: [NotificationService],
})
export class NotificationModule {}
