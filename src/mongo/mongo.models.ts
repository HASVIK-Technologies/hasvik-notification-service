import mongoose, { Model } from 'mongoose';
import { NotificationLogSchema, NotificationTemplateSchema } from './schemas';
import type { NotificationLog, NotificationTemplate } from './interfaces';

export class MongoModels {
  readonly notificationLog: Model<NotificationLog>;
  readonly notificationTemplate: Model<NotificationTemplate>;

  constructor() {
    this.notificationLog =
      mongoose.models.NotificationLog ??
      mongoose.model<NotificationLog>('NotificationLog', NotificationLogSchema);
    this.notificationTemplate =
      mongoose.models.NotificationTemplate ??
      mongoose.model<NotificationTemplate>('NotificationTemplate', NotificationTemplateSchema);
  }
}
