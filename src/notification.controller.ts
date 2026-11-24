import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalAuthGuard } from './auth.guard';
import { NotificationService } from './notification.service';
import { BulkNotificationsDto, CreateNotificationDto } from './dto/notification.dto';
@Controller('v1/notifications')
@UseGuards(InternalAuthGuard)
@ApiTags('Notifications')
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
  @Post() @HttpCode(HttpStatus.ACCEPTED) create(@Body() dto: CreateNotificationDto) {
    return this.service.create(dto);
  }
  @Post('bulk') @HttpCode(HttpStatus.ACCEPTED) bulk(@Body() dto: BulkNotificationsDto) {
    return this.service.bulk(dto.notifications);
  }
  @Get(':id') get(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.service.find(id, tenantId);
  }
  @Post(':id/retry') retry(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    return this.service.retry(id, tenantId);
  }
}
