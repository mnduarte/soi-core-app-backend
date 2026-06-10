import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import {
  CreateBannerDto,
  CreateClinicAccountDto,
  ExtendSubscriptionDto,
  RecordPaymentDto,
  UpdateAdminSettingsDto,
  UpdateClinicDto,
  UpdateClinicSubscriptionDto,
} from './dto/admin.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateAdminSettingsDto) {
    return this.adminService.updateSettings(dto);
  }

  @Get('clinics')
  findAllClinics(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.findAllClinics(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('clinics/check-slug')
  checkSlug(@Query('slug') slug: string) {
    return this.adminService.checkSlugAvailability(slug ?? '');
  }

  @Post('clinics')
  createClinic(@Body() dto: CreateClinicAccountDto) {
    return this.adminService.createClinicAccount(dto);
  }

  @Get('clinics/:id')
  findClinic(@Param('id') id: string) {
    return this.adminService.findClinicById(id);
  }

  @Patch('clinics/:id')
  updateClinic(@Param('id') id: string, @Body() dto: UpdateClinicDto) {
    return this.adminService.updateClinic(id, dto);
  }

  @Patch('clinics/:id/subscription')
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateClinicSubscriptionDto) {
    return this.adminService.updateClinicSubscription(id, dto);
  }

  @Post('clinics/:id/extend-subscription')
  extendSubscription(@Param('id') id: string, @Body() dto: ExtendSubscriptionDto) {
    return this.adminService.extendSubscription(id, dto);
  }

  @Post('clinics/:id/payment')
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.adminService.recordPayment(id, dto);
  }

  @Post('clinics/:id/suspend')
  suspendClinic(@Param('id') id: string) {
    return this.adminService.suspendClinic(id);
  }

  @Post('clinics/:id/reactivate')
  reactivateClinic(@Param('id') id: string) {
    return this.adminService.reactivateClinic(id);
  }

  @Post('clinics/:id/reset-credentials')
  resetCredentials(@Param('id') id: string) {
    return this.adminService.resetCredentials(id);
  }

  @Post('clinics/:id/impersonate')
  impersonateClinic(
    @Param('id') id: string,
    @Req() req: Request & { admin?: { sub: string } },
  ) {
    const adminId = req.admin?.sub ?? 'unknown';
    return this.adminService.impersonateClinic(id, adminId);
  }

  @Get('password-reset-requests')
  listPasswordResetRequests() {
    return this.adminService.listPasswordResetRequests();
  }

  @Get('password-reset-requests/count')
  countPasswordResetRequests() {
    return this.adminService.countPendingPasswordResetRequests();
  }

  @Post('password-reset-requests/:id/resolve')
  resolvePasswordResetRequest(@Param('id') id: string) {
    return this.adminService.resolvePasswordResetRequest(id);
  }

  @Get('banners')
  findAllBanners() {
    return this.adminService.findAllBanners();
  }

  @Post('banners')
  createBanner(@Body() dto: CreateBannerDto) {
    return this.adminService.createBanner(dto);
  }

  @Delete('banners/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBanner(@Param('id') id: string) {
    return this.adminService.deleteBanner(id);
  }
}
