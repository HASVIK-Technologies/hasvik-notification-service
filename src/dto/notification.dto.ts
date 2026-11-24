import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationChannel, NotificationCategory } from '../mongo/enums';

export class CreateNotificationDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7890abcd', description: 'MongoDB tenant ID' })
  @IsMongoId()
  tenantId!: string;

  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.SMS })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ enum: NotificationCategory, example: NotificationCategory.TRANSACTIONAL })
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @ApiProperty({ example: '919454263965', description: 'Email address or phone number' })
  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @ApiProperty({ example: 'order_shipped' })
  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { customerName: 'Alex', orderNumber: 'ORD-1042' },
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number | boolean | null>;

  @ApiProperty({
    maxLength: 240,
    example: 'order-1042-shipped-sms',
    description: 'Unique key used to prevent duplicate notifications',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  idempotencyKey!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-12-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { orderId: 'ORD-1042', source: 'orders-service' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BulkNotificationsDto {
  @ApiProperty({
    type: [CreateNotificationDto],
    minItems: 1,
    maxItems: 100,
    example: [
      {
        tenantId: '665f1a2b3c4d5e6f7890abcd',
        channel: NotificationChannel.WHATSAPP,
        category: NotificationCategory.TRANSACTIONAL,
        recipient: '919454263965',
        templateCode: 'order_shipped',
        variables: { customerName: 'Alex', orderNumber: 'ORD-1042' },
        idempotencyKey: 'order-1042-shipped-whatsapp',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateNotificationDto)
  notifications!: CreateNotificationDto[];
}
