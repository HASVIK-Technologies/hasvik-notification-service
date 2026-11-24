export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  RETRY_PENDING = 'retry_pending',
  ACCEPTED = 'accepted',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum NotificationCategory {
  TRANSACTIONAL = 'transactional',
  REMINDER = 'reminder',
  PROMOTIONAL = 'promotional',
}

export interface NotificationVariables {
  [key: string]: string | number | boolean | null;
}
